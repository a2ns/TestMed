//! Liaison FFI vers la bibliothèque FSV du GIE SESAM-Vitale (`sgpv.dll`).
//!
//! Poste Windows uniquement : sur les autres plateformes le module compile
//! mais retourne `UnsupportedPlatform`. Les codes retour FSV sont ceux du
//! standard SPS/FSV (0 = succès).

use super::{CpsInfo, IdentiteVitale, VitaleError};

const TAILLE_TAMPON_VITALE: usize = 8192;
const TAILLE_TAMPON_CPS: usize = 4096;

#[repr(C)]
struct SgpvHandle {
    _private: [u8; 0],
}

#[cfg(windows)]
#[allow(clippy::upper_case_acronyms)]
#[link(name = "sgpv")]
extern "system" {
    fn SGPV_OuvrirSession(hSession: *mut *mut SgpvHandle, pcNomResource: *const i8, peMode: u16) -> u16;
    fn SGPV_LireVitale(hSession: *mut SgpvHandle, pBuf: *mut u8, pTaille: *mut u32) -> u16;
    fn SGPV_LireCPS(hSession: *mut SgpvHandle, pBuf: *mut u8, pTaille: *mut u32) -> u16;
    fn SGPV_FermerSession(hSession: *mut SgpvHandle) -> u16;
}

#[cfg(windows)]
mod imp {
    use super::*;

    pub fn lire_vitale() -> Result<IdentiteVitale, VitaleError> {
        let session = ouvrir_session()?;
        let mut tampon = [0u8; TAILLE_TAMPON_VITALE];
        let mut taille = tampon.len() as u32;
        let code = unsafe { SGPV_LireVitale(session, tampon.as_mut_ptr(), &mut taille) };
        if code != 0 {
            unsafe { SGPV_FermerSession(session) };
            return Err(VitaleError::Fsv { code, message: "lecture carte Vitale".into() });
        }
        let brut = String::from_utf8_lossy(&tampon[..taille as usize]).to_string();
        unsafe { SGPV_FermerSession(session) };
        decoder_b2(&brut)
    }

    pub fn lire_cps() -> Result<CpsInfo, VitaleError> {
        let session = ouvrir_session()?;
        let mut tampon = [0u8; TAILLE_TAMPON_CPS];
        let mut taille = tampon.len() as u32;
        let code = unsafe { SGPV_LireCPS(session, tampon.as_mut_ptr(), &mut taille) };
        if code != 0 {
            unsafe { SGPV_FermerSession(session) };
            return Err(VitaleError::Fsv { code, message: "lecture CPS".into() });
        }
        let brut = String::from_utf8_lossy(&tampon[..taille as usize]).to_string();
        unsafe { SGPV_FermerSession(session) };
        decoder_cps(&brut)
    }

    fn ouvrir_session() -> Result<*mut SgpvHandle, VitaleError> {
        let mut session: *mut SgpvHandle = std::ptr::null_mut();
        let code = unsafe { SGPV_OuvrirSession(&mut session, std::ptr::null(), 0) };
        match code {
            0 => Ok(session),
            9000.. => Err(VitaleError::NoCard),
            code => Err(VitaleError::Fsv { code, message: "ouverture de session FSV".into() }),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn lire_vitale() -> Result<IdentiteVitale, VitaleError> {
        Err(VitaleError::UnsupportedPlatform)
    }
    pub fn lire_cps() -> Result<CpsInfo, VitaleError> {
        Err(VitaleError::UnsupportedPlatform)
    }
}

pub use imp::{lire_cps, lire_vitale};

/// Décodage du flux B2 de la carte Vitale (segments `NN<valeur>` séparés
/// par `&` ; seuls les champs utiles au cabinet sont extraits).
fn decoder_b2(brut: &str) -> Result<IdentiteVitale, VitaleError> {
    let mut identite = IdentiteVitale::default();
    for segment in brut.split('&') {
        if segment.len() < 3 {
            continue;
        }
        let (typ, valeur) = (&segment[..2], &segment[2..]);
        match typ {
            "01" => identite.nir = valeur.trim().to_string(),
            "02" => identite.nom = valeur.trim().to_string(),
            "03" => {
                identite.prenoms = valeur
                    .split('/')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            }
            "04" => identite.date_naissance = valeur.trim().to_string(),
            "05" => identite.sexe = valeur.trim().to_string(),
            "06" => identite.adresse = Some(valeur.trim().to_string()),
            "07" => identite.medecin_traitant = Some(valeur.trim().to_string()),
            _ => {}
        }
    }
    if identite.nir.is_empty() {
        return Err(VitaleError::Decode("NIR absent du flux B2".into()));
    }
    Ok(identite)
}

fn decoder_cps(brut: &str) -> Result<CpsInfo, VitaleError> {
    let mut rpps = String::new();
    let mut nom = String::new();
    let mut specialite = None;
    for segment in brut.split('&') {
        if segment.len() < 3 {
            continue;
        }
        match &segment[..2] {
            "01" => rpps = segment[2..].trim().to_string(),
            "02" => nom = segment[2..].trim().to_string(),
            "03" => specialite = Some(segment[2..].trim().to_string()),
            _ => {}
        }
    }
    if rpps.is_empty() {
        return Err(VitaleError::Decode("RPPS absent du flux CPS".into()));
    }
    Ok(CpsInfo { rpps, nom, specialite })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_b2_minimal() {
        let flux = "0127102030405067&02DUPONT&03JEAN/MARIE&0419800101&051";
        let f = decoder_b2(flux).unwrap();
        assert_eq!(f.nir, "27102030405067");
        assert_eq!(f.nom, "DUPONT");
        assert_eq!(f.prenoms, vec!["JEAN", "MARIE"]);
        assert_eq!(f.date_naissance, "19800101");
        assert_eq!(f.sexe, "1");
    }

    #[test]
    fn decode_b2_invalide() {
        assert!(decoder_b2("X").is_err());
    }

    #[test]
    fn decode_cps_minimal() {
        let f = decoder_cps("0110100123456&02DR MARTIN&03MEDECINE GENERALE").unwrap();
        assert_eq!(f.rpps, "10100123456");
        assert_eq!(f.nom, "DR MARTIN");
        assert_eq!(f.specialite.as_deref(), Some("MEDECINE GENERALE"));
    }
}
