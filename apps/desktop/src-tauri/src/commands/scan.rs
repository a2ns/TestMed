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
    token: String,
) -> Result<ScanResultat, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    // 1. Scan du lot (ADF) dans un dossier temporaire.
    let dossier_tmp = std::env::temp_dir().join(format!("primia-scan-{}", uuid::Uuid::new_v4()));
    let dossier_tmp = dossier_tmp.to_string_lossy().to_string();
    let lot = crate::scan::backend().scanner_masse(&scanner, &dossier_tmp)?;

    // 2. OCR local de chaque page (Tesseract, pack fra).
    let mut textes = Vec::new();
    for page in &lot.pages {
        let res = crate::ocr::reconnaitre(&page.chemin)?;
        textes.push(res.texte);
    }
    let texte_complet = crate::ocr::fusionner(&textes);

    // 3. Rangement des pages dans la GED (id-1.png, id-2.png…) +
    //    enregistrement en base avec indexation plein texte (tsvector).
    let id = uuid::Uuid::new_v4().to_string();
    let chemin_ref = crate::scan::ranger_pages(&lot.pages, &dossier_ged, &id)?;
    crate::db::insert_document_ocr(
        &id,
        patient_id.as_deref(),
        &format!("Scan {} pages", lot.pages.len()),
        &chemin_ref,
        &type_doc,
        &texte_complet,
    )
    .await?;

    // 4. Nettoyage du dossier temporaire.
    let _ = std::fs::remove_dir_all(&dossier_tmp);

    crate::audit::journaliser(
        &utilisateur.id,
        "SCAN_MASSE",
        Some("document"),
        Some(&id),
        Some(serde_json::json!({ "pages": lot.pages.len(), "type": type_doc })),
    );

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
#[serde(rename_all = "camelCase")]
pub struct ScanResultat {
    pub id_document: String,
    pub nb_pages: usize,
    pub texte_ocr: String,
}
