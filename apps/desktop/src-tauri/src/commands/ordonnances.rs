use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrescriptionLigne {
    pub id: String,
    pub zone: String,
    pub medicament: String,
    pub cip: Option<String>,
    pub posologie: String,
    pub duree: Option<String>,
    pub duree_jours: Option<i32>,
    pub substitution: bool,
    pub renouvellements: i32,
    pub position: i32,
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Ordonnance {
    pub id: String,
    pub patient_id: String,
    pub r#type: String,
    pub securisee: bool,
    pub date: chrono::NaiveDateTime,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelleOrdonnance {
    pub patient_id: String,
    pub r#type: String, // SIMPLE | BI_ORDONNANCE | SECURISEE
    pub securisee: bool,
    pub lignes: Vec<NouvellePrescription>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvellePrescription {
    pub zone: String, // A | B
    pub medicament: String,
    pub cip: Option<String>,
    pub posologie: String,
    pub duree: Option<String>,
    pub duree_jours: Option<i32>,
    pub substitution: bool,
    pub renouvellements: i32,
}

#[tauri::command]
pub async fn creer_ordonnance(o: NouvelleOrdonnance, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if o.lignes.is_empty() {
        return Err("une ordonnance exige au moins une prescription".into());
    }
    if o.r#type == "BI_ORDONNANCE" && !o.lignes.iter().any(|l| l.zone == "B") {
        return Err("bi-ordonnance : au moins une ligne en zone B requise".into());
    }
    let id = crate::db::creer_ordonnance(&o)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "ORDONNANCE_CREATION",
        Some("ordonnance"),
        Some(&id),
        Some(
            serde_json::json!({ "patient_id": o.patient_id, "lignes": o.lignes.len(), "type": o.r#type }),
        ),
    );
    Ok(id)
}

#[tauri::command]
pub async fn list_ordonnances(patient_id: String) -> Result<Vec<Ordonnance>, String> {
    crate::db::list_ordonnances(&patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_prescriptions(ordonnance_id: String) -> Result<Vec<PrescriptionLigne>, String> {
    crate::db::get_prescriptions(&ordonnance_id)
        .await
        .map_err(|e| e.to_string())
}
