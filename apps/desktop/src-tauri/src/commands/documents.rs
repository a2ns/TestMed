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
