//! Scan de masse : abstraction TWAIN (Windows) / SANE (macOS, Linux).
//!
//! TWAIN : dialogue avec la DLL constructeur via FFI (phase pilote : SDK
//! constructeur du cabinet). SANE : pilotage de `scanimage` (sous-processus).

pub mod sane;

#[derive(Debug)]
pub struct PageScannee {
    pub chemin: String,
    pub largeur: u32,
    pub hauteur: u32,
}

#[derive(Debug)]
pub struct LotScan {
    pub pages: Vec<PageScannee>,
}

pub trait BackendScan {
    /// Nom du backend (affiché dans l'IHM).
    fn nom(&self) -> &'static str;
    /// Liste les scanners disponibles.
    fn lister_scanners(&self) -> Result<Vec<String>, String>;
    /// Lance un scan de masse (chargeur ADF) et retourne les pages en PNG.
    fn scanner_masse(&self, scanner: &str, dossier: &str) -> Result<LotScan, String>;
}

/// Sélectionne le backend selon la plateforme.
pub fn backend() -> Box<dyn BackendScan> {
    #[cfg(target_os = "windows")]
    {
        Box::new(sane::BackendSane::new()) // remplacé par le FFI TWAIN en phase pilote
    }
    #[cfg(not(target_os = "windows"))]
    {
        Box::new(sane::BackendSane::new())
    }
}

/// Range les pages scannées dans le dossier GED sous un préfixe unique
/// (id-1.png, id-2.png…) et retourne le chemin de la première page,
/// utilisée comme référence du document.
pub fn ranger_pages(pages: &[PageScannee], dossier_ged: &str, id: &str) -> Result<String, String> {
    use std::path::Path;
    std::fs::create_dir_all(dossier_ged).map_err(|e| e.to_string())?;
    let mut premier: Option<String> = None;
    for (i, page) in pages.iter().enumerate() {
        let destination = Path::new(dossier_ged).join(format!("{id}-{}.png", i + 1));
        std::fs::copy(&page.chemin, &destination).map_err(|e| e.to_string())?;
        if premier.is_none() {
            premier = Some(destination.to_string_lossy().to_string());
        }
    }
    premier.ok_or_else(|| "aucune page à ranger".into())
}
