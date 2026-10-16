use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub patients_total: i64,
    pub documents_total: i64,
    pub consultations_total: i64,
    pub courriers_brouillons: i64,
    pub courriers_valides: i64,
    pub non_lies: i64,
}

#[tauri::command]
pub async fn statistiques() -> Result<Stats, String> {
    crate::db::statistiques().await
}
