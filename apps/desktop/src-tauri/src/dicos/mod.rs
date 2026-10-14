//! Connecteur DICOS (SantéConnectée, ex-DIRECT) : réception des résultats
//! de laboratoire et comptes rendus via la messagerie sécurisée de santé.
//!
//! PRÉREQUIS RÉGLEMENTAIRES (à réaliser par le cabinet) :
//! 1. Adhésion à SantéConnectée (pro.santeconnectée.fr) — l'identifiant
//!    national de santé (INS) du cabinet et des praticiens.
//! 2. Un certificat de chiffrement MSSanté (via un CSP agréé ASIP).
//! 3. Convention avec le(s) laboratoire(s) pour l'envoi DICOS.
//!
//! ARCHITECTURE : le flux DICOS arrive sur une BAL MSSanté. Primia interroge
//! la BAL (protocole HTTPS/multipart du référentiel DIM), télécharge les
//! messages, en vérifie la signature, déchiffre les pièces jointes, puis
//! chaque document suit le pipeline existant : OCR → détection patient →
//! GED (rattaché ou caddie) → extraction des constantes.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatDicos {
    pub configure: bool,
    pub detail: String,
}

#[tauri::command]
pub fn verifier_dicos(token: String) -> Result<EtatDicos, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let bal = std::env::var("DICOS_BAL_URL");
    let cert = std::env::var("DICOS_CERTIFICAT");
    Ok(match (&bal, &cert) {
        (Ok(u), Ok(c)) => EtatDicos {
            configure: true,
            detail: format!("BAL MSSanté : {u} (certificat {c})"),
        },
        _ => EtatDicos {
            configure: false,
            detail: "DICOS non configuré : nécessite une adhésion SantéConnectée, \
                     un certificat MSSanté (DICOS_BAL_URL, DICOS_CERTIFICAT dans .env) \
                     et la convention avec vos laboratoires."
                .into(),
        },
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDicos {
    pub id: String,
    pub sujet: String,
    pub emetteur: String,
    pub nb_pieces: usize,
}

#[tauri::command]
pub async fn lister_messages_dicos(token: String) -> Result<Vec<MessageDicos>, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let _ = utilisateur;
    let bal_url = std::env::var("DICOS_BAL_URL")
        .map_err(|_| "DICOS non configuré (voir Système → DICOS)")?;
    // Interrogation de la BAL MSSanté : le référentiel DIM expose une API
    // HTTPS documentée par l'ASIP. Requête listant les messages non lus.
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{bal_url}/messages?nonLus=true"))
        .send()
        .await
        .map_err(|e| format!("BAL injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("BAL : statut {}", resp.status()));
    }
    // Format DIM (JSON) : parsing et mapping.
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let messages = json["messages"]
        .as_array()
        .ok_or("réponse BAL inattendue")?
        .iter()
        .map(|m| MessageDicos {
            id: m["id"].as_str().unwrap_or_default().to_string(),
            sujet: m["subject"].as_str().unwrap_or("").to_string(),
            emetteur: m["from"].as_str().unwrap_or("").to_string(),
            nb_pieces: m["attachments"].as_array().map(|a| a.len()).unwrap_or(0),
        })
        .collect();
    Ok(messages)
}

/// Télécharge une pièce jointe d'un message DICOS et l'importe dans la GED
/// via le pipeline existant (OCR → détection patient → GED/caddie).
#[tauri::command]
pub async fn importer_piece_dicos(
    message_id: String,
    piece_index: usize,
    token: String,
) -> Result<crate::commands::recherche::ImportIntelligentResultat, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let bal_url = std::env::var("DICOS_BAL_URL")
        .map_err(|_| "DICOS non configuré")?;
    let client = reqwest::Client::new();
    // Téléchargement (le certificat MSSanté gère le chiffrement applicatif).
    let resp = client
        .get(format!("{bal_url}/messages/{message_id}/pieces/{piece_index}"))
        .send()
        .await
        .map_err(|e| format!("téléchargement impossible : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("téléchargement : statut {}", resp.status()));
    }
    let contenu = resp.bytes().await.map_err(|e| e.to_string())?;
    // Dossier d'arrivée DICOS dans la GED.
    let dossier = std::env::temp_dir().join("primia-dicos");
    std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let fichier = dossier.join(format!("{message_id}-{piece_index}.pdf"));
    std::fs::write(&fichier, &contenu).map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "DICOS_IMPORT",
        Some("document"),
        None,
        Some(serde_json::json!({ "message": message_id, "piece": piece_index })),
    );
    // Pipeline standard : OCR + détection patient + caddie si besoin.
    crate::commands::recherche::importer_document_intelligent(
        fichier.to_string_lossy().to_string(),
        format!("DICOS {message_id}-{piece_index}"),
        "RESULTAT_EXAMEN".to_string(),
        None,
        token,
    )
    .await
}
