//! Impression des courriers : génération PDF (genpdf) + impression système.
//! macOS/Linux : `lpr` (CUPS). Windows : `ShellExecuteW` verbe "print".

use serde::{Deserialize, Serialize};

pub mod commande;

pub use commande::imprimer_courrier;

#[derive(Serialize, Deserialize)]
pub struct CourrierImpression {
    pub praticien: String,   // ex : "Dr Martin Dupont"
    pub cabinet: String,     // adresse du cabinet
    pub patient: String,     // "Mme Marie DURAND"
    pub destinataire: String,
    pub objet: String,
    pub corps: String,
    pub signature: String,
}

/// Génère le PDF du courrier et retourne son chemin.
pub fn generer_pdf(c: &CourrierImpression, chemin: &str) -> Result<(), String> {
    let police = genpdf::fonts::from_files("/usr/share/fonts", "Liberation", genpdf::fonts::BUILT_IN_FAMILIES)
        .map_err(|e| e.to_string())?;
    let mut doc = genpdf::Document::new(police);
    doc.set_title(format!("Courrier — {}", c.patient));

    doc.push(genpdf::elements::Paragraph::new(format!("{}\n{}", c.praticien, c.cabinet)).styled(genpdf::style::Style::new().bold()));
    doc.push(genpdf::elements::Break::new(2));
    doc.push(genpdf::elements::Paragraph::new(&c.destinataire));
    doc.push(genpdf::elements::Break::new(1));
    doc.push(genpdf::elements::Paragraph::new(format!("Objet : {}", c.objet)).styled(genpdf::style::Style::new().bold()));
    doc.push(genpdf::elements::Break::new(1));
    for paragraphe in c.corps.split("\n\n") {
        doc.push(genpdf::elements::Paragraph::new(paragraphe));
        doc.push(genpdf::elements::Break::new(1));
    }
    doc.push(genpdf::elements::Break::new(2));
    doc.push(genpdf::elements::Paragraph::new(format!("{}", c.signature)));

    doc.render(chemin).map_err(|e| e.to_string())
}

/// Envoie un PDF à l'imprimante système (imprimante par défaut si None).
pub fn imprimer_pdf(chemin: &str, imprimante: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::iter;
        let wide: Vec<u16> = std::path::Path::new(chemin)
            .as_os_str()
            .encode_wide()
            .chain(iter::once(0))
            .collect();
        let operation: Vec<u16> = "print\0".encode_utf16().collect();
        unsafe {
            winapi::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(), operation.as_ptr(), wide.as_ptr(),
                std::ptr::null(), std::ptr::null(), winapi::Win32::UI::WindowsAndMessaging::SW_HIDE,
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = std::process::Command::new("lpr");
        if let Some(nom) = imprimante {
            cmd.args(["-P", nom]);
        }
        cmd.arg(chemin)
            .output()
            .map_err(|e| format!("lpr introuvable ({e})"))?;
        Ok(())
    }
}
