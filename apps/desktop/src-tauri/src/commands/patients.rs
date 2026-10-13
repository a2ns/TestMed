use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
pub struct Patient {
    pub id: String,
    pub nom: String,
    pub prenoms: String,
}

#[tauri::command]
pub async fn list_patients(recherche: String) -> Result<Vec<Patient>, String> {
    crate::db::query_patients(&recherche).await.map_err(|e| e.to_string())
}
