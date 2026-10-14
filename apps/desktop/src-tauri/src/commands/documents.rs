use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct DocumentImport {
    pub patient_id: Option<String>,
    pub nom_fichier: String,
    pub chemin: String,
    pub type_doc: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct DocumentRow {
    pub id: String,
    #[serde(rename = "patientId")]
    pub patient_id: Option<String>,
    #[serde(rename = "nomFichier")]
    pub nom_fichier: String,
    #[sqlx(rename = "type")]
    pub type_doc: String,
    #[serde(rename = "createdAt")]
    pub created_at: chrono::NaiveDateTime,
}

#[tauri::command]
pub async fn import_document(doc: DocumentImport) -> Result<String, String> {
    // Copie du fichier dans le stockage documents du cabinet, puis enregistrement en base.
    let dossier = std::env::var("MAGICMED_DOCS_DIR").unwrap_or_else(|_| "documents".into());
    std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let source = std::path::Path::new(&doc.chemin);
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let nom_stocke = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let destination = std::path::Path::new(&dossier).join(&nom_stocke);
    std::fs::copy(source, &destination).map_err(|e| e.to_string())?;
    let mut doc = doc;
    doc.chemin = destination.to_string_lossy().to_string();
    crate::db::insert_document(&doc).await
}

#[tauri::command]
pub async fn list_documents(patient_id: Option<String>) -> Result<Vec<DocumentRow>, String> {
    crate::db::list_documents(patient_id.as_deref()).await
}
