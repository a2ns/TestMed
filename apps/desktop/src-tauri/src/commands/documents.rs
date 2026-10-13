use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImport {
    pub patient_id: Option<String>,
    pub nom_fichier: String,
    pub chemin: String,
    pub type_doc: String,
}

#[tauri::command]
pub async fn import_document(doc: DocumentImport) -> Result<String, String> {
    // Phase 1 : copie du fichier + enregistrement en base.
    // Phase 2 : OCR Tesseract + indexation tsvector + scan de masse TWAIN/SANE.
    crate::db::insert_document(&doc).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn supprimer_document(id: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::supprimer_document(&id).await.map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "DOC_SUPPRESSION",
        Some("document"),
        Some(&id),
        None,
    );
    Ok(())
}

/// Ouvre un document avec l'application native du système
/// (Aperçu/PDF sur macOS, visionneuse par défaut sur Windows).
#[tauri::command]
pub async fn ouvrir_document(id: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let chemin = crate::db::chemin_document(&id)
        .await
        .map_err(|e| e.to_string())?;
    if !std::path::Path::new(&chemin).exists() {
        return Err("fichier introuvable sur le disque".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &chemin])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&chemin)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&chemin)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    crate::audit::journaliser(
        &utilisateur.id,
        "DOC_OUVERTURE",
        Some("document"),
        Some(&id),
        None,
    );
    Ok(())
}
