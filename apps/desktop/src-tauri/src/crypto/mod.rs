//! Chiffrement au repos des données sensibles (NIR) : AES-256-GCM.
//!
//! La clé maîtresse est lue depuis MAGICMED_CLE_MASTER (base64, 32 octets).
//! Si absente en développement, une clé éphémère est dérivée (les données
//! chiffrées ne sont lisibles que pendant la session).

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

static CLE: OnceLock<Vec<u8>> = OnceLock::new();

fn cle() -> Vec<u8> {
    CLE.get_or_init(|| {
        match std::env::var("MAGICMED_CLE_MASTER") {
            Ok(k) => {
                let maitre = Sha256::digest(k.as_bytes());
                maitre.to_vec()
            }
            Err(_) => {
                eprintln!("[crypto] MAGICMED_CLE_MASTER absente : clé éphémère de session (développement uniquement)");
                Sha256::digest(uuid::Uuid::new_v4().as_bytes()).to_vec()
            }
        }
    }).clone()
}

/// Chiffre une donnée sensible → base64(nonce + ciphertext).
pub fn chiffrer(clair: &str) -> Result<String, String> {
    let cle = cle();
    let key = Key::<Aes256Gcm>::from_slice(&cle);
    let cipher = Aes256Gcm::new(key);
    let nonce_bytes = Sha256::digest(uuid::Uuid::new_v4().as_bytes());
    let nonce = Nonce::from_slice(&nonce_bytes[..12]);
    let chiffre = cipher
        .encrypt(
            nonce,
            Payload {
                msg: clair.as_bytes(),
                aad: b"primia-nir".as_ref(),
            },
        )
        .map_err(|_| "échec du chiffrement")?;
    let mut sorti = nonce_bytes[..12].to_vec();
    sorti.extend_from_slice(&chiffre);
    Ok(B64.encode(sorti))
}

/// Déchiffre une donnée sensible.
pub fn dechiffrer(base64: &str) -> Result<String, String> {
    let cle = cle();
    let brut = B64.decode(base64).map_err(|_| "donnée chiffrée invalide")?;
    if brut.len() < 12 {
        return Err("donnée chiffrée tronquée".into());
    }
    let (nonce_bytes, chiffre) = brut.split_at(12);
    let key = Key::<Aes256Gcm>::from_slice(&cle);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);
    let clair = cipher
        .decrypt(
            nonce,
            Payload {
                msg: chiffre,
                aad: b"primia-nir".as_ref(),
            },
        )
        .map_err(|_| "clé de chiffrement invalide ou donnée altérée")?;
    String::from_utf8(clair).map_err(|_| "donnée illisible".into())
}

/// Chiffre des octets bruts (sauvegardes) : nonce + ciphertext, sans base64.
pub fn chiffrer_octets(clair: &[u8]) -> Result<Vec<u8>, String> {
    let cle = cle();
    let key = Key::<Aes256Gcm>::from_slice(&cle);
    let cipher = Aes256Gcm::new(key);
    let nonce_bytes = Sha256::digest(uuid::Uuid::new_v4().as_bytes());
    let nonce = Nonce::from_slice(&nonce_bytes[..12]);
    let chiffre = cipher
        .encrypt(
            nonce,
            Payload {
                msg: clair,
                aad: b"primia-backup".as_ref(),
            },
        )
        .map_err(|_| "échec du chiffrement")?;
    let mut sorti = nonce_bytes[..12].to_vec();
    sorti.extend_from_slice(&chiffre);
    Ok(sorti)
}

/// Déchiffre des octets bruts (sauvegardes).
pub fn dechiffrer_octets(brut: &[u8]) -> Result<String, String> {
    let cle = cle();
    if brut.len() < 12 {
        return Err("donnée chiffrée tronquée".into());
    }
    let (nonce_bytes, chiffre) = brut.split_at(12);
    let key = Key::<Aes256Gcm>::from_slice(&cle);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);
    let clair = cipher
        .decrypt(
            nonce,
            Payload {
                msg: chiffre,
                aad: b"primia-backup".as_ref(),
            },
        )
        .map_err(|_| "clé invalide ou archive altérée")?;
    String::from_utf8(clair).map_err(|_| "archive illisible".into())
}

/// Empreinte déterministe (HMAC-SHA256-like via SHA256(clé||donnée)) :
/// permet la recherche/unicité sans stocker le NIR en clair.
pub fn empreinte(donnee: &str) -> String {
    let cle = cle();
    let mut h = Sha256::new();
    h.update(&cle);
    h.update(donnee.as_bytes());
    let out = h.finalize();
    B64.encode(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chiffre_puis_dechiffre() {
        std::env::set_var("MAGICMED_CLE_MASTER", "test");
        let nir = "175021212345678";
        let chiffe = chiffrer(nir).unwrap();
        assert_ne!(chiffe, nir);
        assert_eq!(dechiffrer(&chiffe).unwrap(), nir);
    }
}
