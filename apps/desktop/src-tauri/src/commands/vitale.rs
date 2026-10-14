use crate::sesam_vitale::{ffi, CpsInfo, IdentiteVitale};

#[tauri::command]
pub fn lire_carte_vitale() -> Result<IdentiteVitale, String> {
    ffi::lire_vitale().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lire_cps() -> Result<CpsInfo, String> {
    ffi::lire_cps().map_err(|e| e.to_string())
}
