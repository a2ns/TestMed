use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourrierRequest {
    pub patient_id: String,
    pub gabarit: String,
    pub notes: String,
    pub destinataire: Option<String>,
    pub token: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourrierGenere {
    pub contenu: String,
}

#[tauri::command]
pub async fn generer_courrier_ia(req: CourrierRequest, token: String) -> Result<CourrierGenere, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::audit::journaliser(
        &utilisateur.id,
        "COURRIER_IA",
        Some("patient"),
        Some(&req.patient_id),
        None,
    );
    crate::db::generer_courrier(&req).await.map_err(|e| e.to_string())
}
