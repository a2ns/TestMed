use serde::{Deserialize, Serialize};

#[derive(Serialize, sqlx::FromRow)]
pub struct FicheOrpheline {
    pub id: String,
    pub kind: String,
    pub date: Option<String>,
    pub sujet: Option<String>,
    pub extrait: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct OccurrencePatient {
    pub id: String,
    pub nom: String,
    pub prenoms: String,
    pub occurrences: i64,
}

#[derive(Deserialize)]
pub struct LienFiche {
    pub kind: String,
    pub fiche_id: String,
    pub patient_id: String,
}

#[tauri::command]
pub async fn list_fiches_orphelines() -> Result<Vec<FicheOrpheline>, String> {
    crate::db::fiches_orphelines().await
}

#[tauri::command]
pub async fn list_occurrences_patients() -> Result<Vec<OccurrencePatient>, String> {
    crate::db::occurrences_patients().await
}

#[tauri::command]
pub async fn lier_fiche(req: LienFiche) -> Result<(), String> {
    crate::db::lier_fiche(&req.kind, &req.fiche_id, &req.patient_id).await
}
