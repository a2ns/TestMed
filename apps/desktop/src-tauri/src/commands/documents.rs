use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("bin");
    let nom_stocke = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let destination = std::path::Path::new(&dossier).join(&nom_stocke);
    std::fs::copy(source, &destination).map_err(|e| e.to_string())?;
    let mut doc = doc;
    doc.chemin = destination.to_string_lossy().to_string();
    crate::db::insert_document(&doc).await
}

#[tauri::command]
pub async fn supprimer_document(id: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::supprimer_document(&id)
        .await
        .map_err(|e| e.to_string())?;
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

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourrierGed {
    pub patient_id: String,
    pub nom_fichier: String,
    pub chemin: String,
    pub contenu: String,
}

/// Enregistre un courrier généré dans la GED du patient : le texte du
/// courrier sert d'index de recherche plein texte (comme l'OCR).
#[tauri::command]
pub async fn enregistrer_courrier_ged(c: CourrierGed, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let id = uuid::Uuid::new_v4().to_string();
    crate::db::insert_document_ocr_intelligent(
        &id,
        Some(&c.patient_id),
        &c.nom_fichier,
        &c.chemin,
        "COURRIER",
        &c.contenu,
        false,
    )
    .await?;
    crate::audit::journaliser(
        &utilisateur.id,
        "COURRIER_ARCHIVE",
        Some("patient"),
        Some(&c.patient_id),
        Some(serde_json::json!({ "document": id })),
    );
    Ok(id)
}
