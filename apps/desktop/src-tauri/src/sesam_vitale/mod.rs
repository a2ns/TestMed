//! Module Sesam-Vitale : lecture CPS + carte Vitale via FSV (sgpv.dll) par FFI.
//!
//! Conforme au cahier des charges : FFI Rust vers `sgpv.dll` (bibliothèque FSV
//! du GIE SESAM-Vitale), poste Windows uniquement. Sur les autres plateformes,
//! le module compile mais retourne une erreur explicite.

pub mod ffi;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum VitaleError {
    #[error("Sesam-Vitale indisponible sur cette plateforme (Windows requis)")]
    UnsupportedPlatform,
    #[error("FSV (sgpv.dll) introuvable : {0}")]
    DllNotFound(String),
    #[error("Lecteur de carte non présent ou carte non insérée")]
    NoCard,
    #[error("Erreur FSV {code} : {message}")]
    Fsv { code: u16, message: String },
    #[error("Erreur de décodage des données Vitale : {0}")]
    Decode(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IdentiteVitale {
    pub nir: String,
    pub nom: String,
    pub prenoms: Vec<String>,
    pub date_naissance: String,
    pub sexe: String,
    pub adresse: Option<String>,
    pub medecin_traitant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpsInfo {
    pub rpps: String,
    pub nom: String,
    pub specialite: Option<String>,
}
