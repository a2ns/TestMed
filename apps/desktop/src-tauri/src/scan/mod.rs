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

/// Assemble les pages scannées en un PDF unique (crate `img2pdf`).
pub fn assembler_pdf(pages: &[PageScannee], chemin_pdf: &str) -> Result<(), String> {
    let chemins: Vec<&str> = pages.iter().map(|p| p.chemin.as_str()).collect();
    img2pdf::convert_images(
        chemins.iter().map(|c| c.as_ref()).collect(),
        std::fs::File::create(chemin_pdf).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
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
