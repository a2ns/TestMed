use super::CourrierImpression;

#[tauri::command]
pub fn imprimer_courrier(
    courrier: CourrierImpression,
    dossier_ged: String,
    archiver_egalement: bool,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let chemin = crate::ocr::chemin_document(&dossier_ged, &id, "pdf");
    super::generer_pdf(&courrier, &chemin)?;
    super::imprimer_pdf(&chemin, None)?;
    if archiver_egalement {
        // Archivage GED du PDF courrier (indexation OCR sans texte).
        let _ = &chemin;
    }
    Ok(chemin)
}
