//! Backend SANE (macOS/Linux) via le sous-processus `scanimage`.
//! macOS : SANE est installé via Homebrew (`brew install sane-backends`).

use super::{BackendScan, LotScan, PageScannee};
use std::path::Path;
use std::process::Command;

pub struct BackendSane;

impl BackendSane {
    pub fn new() -> Self {
        BackendSane
    }
}

impl BackendScan for BackendSane {
    fn nom(&self) -> &'static str {
        "SANE"
    }

    fn lister_scanners(&self) -> Result<Vec<String>, String> {
        let sortie = Command::new("scanimage")
            .args(["-f", "%d\n"])
            .output()
            .map_err(|e| format!("scanimage introuvable ({e}) — installez sane-backends"))?;
        if !sortie.status.success() {
            return Err(format!("scanimage -L a échoué : {}", String::from_utf8_lossy(&sortie.stderr)));
        }
        let scanners = String::from_utf8_lossy(&sortie.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        Ok(scanners)
    }

    fn scanner_masse(&self, scanner: &str, dossier: &str) -> Result<LotScan, String> {
        std::fs::create_dir_all(dossier).map_err(|e| e.to_string())?;
        let mut pages = Vec::new();
        // Mode batch ADF : scanimage --batch alimente le chargeur jusqu'à
        // épuisement, en incrémentant le compteur de page.
        let prefixe = Path::new(dossier).join("page");
        let prefixe = prefixe.to_string_lossy().to_string();
        let sortie = Command::new("scanimage")
            .args([
                "-d", scanner,
                "--format", "png",
                "--resolution", "300",
                "--batch", &format!("{prefixe}%d.png"),
                "--batch-print",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !sortie.status.success() && pages.is_empty() {
            return Err(format!("scan batch a échoué : {}", String::from_utf8_lossy(&sortie.stderr)));
        }
        let mut i = 1;
        loop {
            let chemin = Path::new(dossier).join(format!("page{i}.png"));
            if !chemin.exists() {
                break;
            }
            pages.push(PageScannee {
                chemin: chemin.to_string_lossy().to_string(),
                largeur: 0,
                hauteur: 0,
            });
            i += 1;
        }
        if pages.is_empty() {
            return Err("aucune page scannée (chargeur vide ?)".into());
        }
        Ok(LotScan { pages })
    }
}
