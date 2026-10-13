use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct CourrierRequest {
    pub patient_id: String,
    pub gabarit: String,
    pub notes: String,
}

#[derive(Serialize, Deserialize)]
pub struct CourrierGenere {
    pub contenu: String,
}

#[tauri::command]
pub async fn generer_courrier_ia(req: CourrierRequest) -> Result<CourrierGenere, String> {
    crate::db::generer_courrier(&req).await.map_err(|e| e.to_string())
}
