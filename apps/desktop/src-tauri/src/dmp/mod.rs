//! Interconnexion DMP (Document Médical Partagé) — fondations.
//!
//! L'accès au DMP exige (côté cabinet) :
//! - une inscription du cabinet (tutelle/CPS + procédure d'habilitation)
//! - un certificat logiciel DMP (carte CPS ou certificat HORUS)
//! - le flux "inscrire un document au DMP" via les web-services DMP
//!
//! Ce module fournit le client (mTLS prêt pour le certificat) et les
//! commandes de dépôt de documents CDA. L'URL et le certificat seront
//! fournis après habilitation (phase 3).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepotDmp {
    pub patient_id: String,
    pub ins_et_id: String,   // INS de la personne (obtenu via FSV/INSc)
    pub type_document: String,
    pub titre: String,
    pub chemin_pdf: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatDmp {
    pub configure: bool,
    pub detail: String,
}

#[tauri::command]
pub fn verifier_dmp(token: String) -> Result<EtatDmp, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let url = std::env::var("DMP_URL");
    let cert = std::env::var("DMP_CERTIFICAT");
    Ok(EtatDmp {
        configure: url.is_ok() && cert.is_ok(),
        detail: match (&url, &cert) {
            (Ok(u), Ok(c)) => format!("DMP configuré ({u}, certificat {c})"),
            _ => "DMP non configuré : définissez DMP_URL et DMP_CERTIFICAT après habilitation".into(),
        },
    })
}

/// Dépose un document au DMP (requiert INS + habilitation).
#[tauri::command]
pub async fn deposer_dmp(depot: DepotDmp, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let url = std::env::var("DMP_URL")
        .map_err(|_| "DMP non configuré : habilitation requise (phase 3)")?;
    let _cert = std::env::var("DMP_CERTIFICAT")
        .map_err(|_| "certificat DMP manquant")?;

    // Flux réel (phase 3) : wrapper CDA + appel SubmitDocument du DMP
    // en mTLS avec le certificat logiciel. Le squelette prépare la
    // requête et journalise l'intention de dépôt.
    crate::audit::journaliser(
        &utilisateur.id,
        "DMP_DEPOT",
        Some("patient"),
        Some(&depot.patient_id),
        Some(serde_json::json!({ "type": depot.type_document, "url": url })),
    );
    Err("dépôt DMP : habilitation + web-services DMP requis (phase 3)".into())
}
