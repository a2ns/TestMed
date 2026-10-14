use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Patient {
    pub id: String,
    pub nom: String,
    pub prenoms: String,
}

#[derive(Serialize, Deserialize)]
pub struct PatientNouveau {
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: Option<String>,
    pub sexe: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub medecin_traitant: Option<String>,
}

#[tauri::command]
pub async fn list_patients(recherche: String) -> Result<Vec<Patient>, String> {
    crate::db::query_patients(&recherche).await
}

#[tauri::command]
pub async fn creer_patient(req: PatientNouveau) -> Result<Patient, String> {
    crate::db::creer_patient(&req).await
}
