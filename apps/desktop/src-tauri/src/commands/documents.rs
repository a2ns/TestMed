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
