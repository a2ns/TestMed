//! OCR Tesseract (local, aucune donnée envoyée à l'extérieur).
//! Prérequis : binaire `tesseract` installé (v5+, avec le pack `fra`).

use std::path::Path;
use std::process::Command;

pub struct OcrResultat {
    pub texte: String,
    pub confiance_moyenne: f32,
}

/// Reconnaissance de texte sur une image (PNG/TIFF issu du scan).
pub fn reconnaitre(chemin_image: &str) -> Result<OcrResultat, String> {
    // -l fra : langue française (pack tesseract-ocr-fra)
    let sortie = Command::new("tesseract")
        .args([chemin_image, "stdout", "-l", "fra"])
        .output()
        .map_err(|e| format!("tesseract introuvable ({e}) — installez tesseract-ocr + fra"))?;
    if !sortie.status.success() {
        return Err(format!(
            "OCR a échoué : {}",
            String::from_utf8_lossy(&sortie.stderr)
        ));
    }
    let texte = String::from_utf8_lossy(&sortie.stdout).to_string();
    let confiance = confiance(chemin_image)?;
    Ok(OcrResultat {
        texte,
        confiance_moyenne: confiance,
    })
}

/// Confiance moyenne via la sortie TSV de Tesseract.
fn confiance(chemin_image: &str) -> Result<f32, String> {
    let tsv = Command::new("tesseract")
        .args([chemin_image, "stdout", "-l", "fra", "tsv"])
        .output()
        .map_err(|e| e.to_string())?;
    let contenu = String::from_utf8_lossy(&tsv.stdout);
    let mut somme = 0.0f32;
    let mut n = 0u32;
    for ligne in contenu.lines().skip(1) {
        let cols: Vec<&str> = ligne.split('\t').collect();
        if cols.len() >= 11 {
            if let Ok(c) = cols[10].parse::<f32>() {
                if c >= 0.0 {
                    somme += c;
                    n += 1;
                }
            }
        }
    }
    Ok(if n == 0 { 0.0 } else { somme / n as f32 })
}

/// Fusionne les pages OCR d'un lot en un texte unique.
pub fn fusionner(textes: &[String]) -> String {
    textes.join("\n\n---- page ----\n\n")
}

/// Chemin de stockage d'un document scanné dans la GED.
pub fn chemin_document(dossier_ged: &str, id: &str, extension: &str) -> String {
    Path::new(dossier_ged)
        .join(format!("{id}.{extension}"))
        .to_string_lossy()
        .to_string()
}
