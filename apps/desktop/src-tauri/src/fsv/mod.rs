//! Intégration Sesam-Vitale (FSV) — poste Windows uniquement.
//!
//! Prérequis réglementaires et techniques (à fournir par le cabinet) :
//! - Contrat GIE SESAM-Vitale (accession au service)
//! - Logiciel FSV installé (sgpv.dll +environnement)
//! - Lecteur de carte certifié + CPS du praticien
//!
//! Ce module expose les commandes Tauri et l'ossature FFI. La DLL n'étant
//! livrée que sous contrat, les liens concrets (noms d'exports réels,
//! buffers, codes retour) seront finalisés avec la documentation GIE du
//! cabinet (phase 2 du projet).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatFsv {
    pub disponible: bool,
    pub detail: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarteVitaleLue {
    pub nir_chiffre: String,
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: String,
    pub droits: serde_json::Value,
}

/// Vérifie la disponibilité du FSV (DLL présente + service opérationnel).
#[tauri::command]
pub fn verifier_fsv(token: String) -> Result<EtatFsv, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    #[cfg(target_os = "windows")]
    {
        let chemin_dll = std::env::var("FSV_DLL").unwrap_or_else(|_| "sgpv.dll".into());
        let dispo = Path::new(&chemin_dll).exists();
        Ok(EtatFsv {
            disponible: dispo,
            detail: if dispo {
                format!("FSV détecté ({chemin_dll})")
            } else {
                "FSV absent : installez le logiciel FSV du GIE et définissez FSV_DLL".into()
            },
        })
    }
    #[cfg(not(target_os = "windows"))]
    Ok(EtatFsv {
        disponible: false,
        detail: "Sesam-Vitale nécessite le poste Windows de facturation (FSV/GIE)".into(),
    })
}

#[cfg(target_os = "windows")]
use std::path::Path;

/// Lecture de la carte Vitale insérée (FSV requis).
#[tauri::command]
pub fn lire_carte_vitale(token: String) -> Result<CarteVitaleLue, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    #[cfg(target_os = "windows")]
    {
        // Phase 2 : FFI vers sgpv.dll (SGP_LireVitale / SGP_InitLibrary…)
        // selon la spécification GIE du cabinet. La lecture retournera les
        // données B2 qui alimenteront patient + FSE.
        let _ = &utilisateur;
        Err("FSV non branché : nécessite le contrat GIE et la spécification sgpv.dll (phase 2)".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = utilisateur;
        Err("lecture Vitale disponible uniquement sur le poste Windows de facturation".into())
    }
}

/// Création d'une FSE (feuille de soins électronique) — phase 2.
#[tauri::command]
pub fn creer_fse(token: String, patient_id: String) -> Result<(), String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let _ = patient_id;
    Err("création FSE : phase 2 (contrat GIE + FSV + CPS requis)".into())
}
