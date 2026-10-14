use serde::Serialize;

#[derive(Serialize)]
pub struct Stats {
    pub patients_total: i64,
    pub documents_total: i64,
    pub courriers_brouillons: i64,
    pub courriers_valides: i64,
}

#[tauri::command]
pub async fn statistiques() -> Result<Stats, String> {
    crate::db::statistiques().await
}
