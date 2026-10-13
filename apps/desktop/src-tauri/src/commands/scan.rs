use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn lister_scanners() -> Result<Vec<String>, String> {
    crate::scan::backend().lister_scanners()
}

#[tauri::command]
pub async fn scan_masse(
    scanner: String,
    dossier_ged: String,
    patient_id: Option<String>,
    type_doc: String,
) -> Result<ScanResultat, String> {
    // 1. Scan du lot (ADF) dans un dossier temporaire.
    let dossier_tmp = std::env::temp_dir().join(format!("magicmed-scan-{}", uuid::Uuid::new_v4()));
    let dossier_tmp = dossier_tmp.to_string_lossy().to_string();
    let lot = crate::scan::backend().scanner_masse(&scanner, &dossier_tmp)?;

    // 2. OCR local de chaque page (Tesseract, pack fra).
    let mut textes = Vec::new();
    for page in &lot.pages {
        let res = crate::ocr::reconnaitre(&page.chemin)?;
        textes.push(res.texte);
    }
    let texte_complet = crate::ocr::fusionner(&textes);

    // 3. Assemblage PDF du lot + enregistrement en base avec indexation
    //    plein texte (tsvector mis à jour côté PostgreSQL).
    let id = uuid::Uuid::new_v4().to_string();
    let chemin_pdf = crate::ocr::chemin_document(&dossier_ged, &id, "pdf");
    crate::scan::assembler_pdf(&lot.pages, &chemin_pdf)?;
    crate::db::insert_document_ocr(
        &id,
        patient_id.as_deref(),
        &format!("Scan {} pages", lot.pages.len()),
        &chemin_pdf,
        &type_doc,
        &texte_complet,
    )
    .await?;

    // 4. Nettoyage du dossier temporaire.
    let _ = std::fs::remove_dir_all(&dossier_tmp);

    Ok(ScanResultat {
        id_document: id,
        nb_pages: lot.pages.len(),
        texte_ocr: if texte_complet.len() > 500 {
            format!("{}…", &texte_complet[..500])
        } else {
            texte_complet
        },
    })
}

#[derive(Serialize, Deserialize)]
pub struct ScanResultat {
    pub id_document: String,
    pub nb_pages: usize,
    pub texte_ocr: String,
}
