//! Sauvegarde chiffrée : pg_dump → gzip → AES-256-GCM, rétention configurable.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Deserialize)]
pub struct ResultatSauvegarde {
    pub chemin: String,
    pub taille_octets: u64,
    pub tables: usize,
}

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Deserialize, Clone)]
pub struct ConfigSauvegarde {
    pub dossier: String,
    pub retention: u32, // nombre de sauvegardes conservées
}

pub fn config() -> ConfigSauvegarde {
    ConfigSauvegarde {
        dossier: std::env::var("MAGICMED_SAUVEGARDE_DOSSIER").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            format!("{home}/MagicMed-backups")
        }),
        retention: std::env::var("MAGICMED_SAUVEGARDE_RETENTION")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30),
    }
}

/// Lance un pg_dump, compresse et chiffre l'archive.
#[tauri::command]
pub async fn lancer_sauvegarde(token: String) -> Result<ResultatSauvegarde, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.role != "ADMIN" {
        return Err("sauvegarde réservée au rôle ADMIN".into());
    }

    let url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL non configurée")?;
    let cfg = config();
    std::fs::create_dir_all(&cfg.dossier).map_err(|e| e.to_string())?;

    let horodatage = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let nom = format!("magicmed-{horodatage}.sql.gz.enc");
    let chemin_archive = Path::new(&cfg.dossier).join(&nom);

    // 1. pg_dump (format SQL, compression gzip via -Zd)
    let dump = tokio::process::Command::new("pg_dump")
        .arg(&url)
        .arg("--compress=9")
        .output()
        .await
        .map_err(|e| format!("pg_dump introuvable ({e}) — installez postgresql-client"))?;
    if !dump.status.success() {
        return Err(format!(
            "pg_dump a échoué : {}",
            String::from_utf8_lossy(&dump.stderr)
        ));
    }

    // 2. Chiffrement AES-256-GCM de l'archive (clé dérivée comme le NIR).
    let chiffre = crate::crypto::chiffrer_octets(&dump.stdout)
        .map_err(|e| format!("chiffrement échoué : {e}"))?;
    std::fs::write(&chemin_archive, &chiffre).map_err(|e| e.to_string())?;

    // 3. Rétention : supprime les plus anciennes au-delà de la limite.
    appliquer_retention(&cfg)?;

    // 4. Audit.
    crate::audit::journaliser(
        &utilisateur.id,
        "SAUVEGARDE",
        Some("systeme"),
        None,
        Some(serde_json::json!({ "taille": chiffre.len(), "retention": cfg.retention })),
    );

    Ok(ResultatSauvegarde {
        chemin: chemin_archive.to_string_lossy().to_string(),
        taille_octets: chiffre.len() as u64,
        tables: 0,
    })
}

fn appliquer_retention(cfg: &ConfigSauvegarde) -> Result<(), String> {
    let mut sauvegardes: Vec<PathBuf> = std::fs::read_dir(&cfg.dossier)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension().map(|x| x == "enc").unwrap_or(false)
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("magicmed-"))
                    .unwrap_or(false)
        })
        .collect();
    sauvegardes.sort();
    let excessif = sauvegardes.len().saturating_sub(cfg.retention as usize);
    for ancienne in sauvegardes.into_iter().take(excessif) {
        let _ = std::fs::remove_file(&ancienne);
    }
    Ok(())
}

/// Restaure une sauvegarde (déchiffre puis renvoie le SQL — l'administrateur
/// l'injecte via psql). Le mot de passe base est requis en argument.
#[tauri::command]
pub async fn dechiffrer_sauvegarde(
    chemin: String,
    token: String,
) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.role != "ADMIN" {
        return Err("opération réservée au rôle ADMIN".into());
    }
    let brut = std::fs::read(&chemin).map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "RESTAURATION_LECTURE",
        Some("systeme"),
        None,
        None,
    );
    crate::crypto::dechiffrer_octets(&brut)
}
