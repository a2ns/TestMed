use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConstanteBio {
    pub id: String,
    pub patient_id: String,
    pub r#type: String,
    pub valeur: String,
    pub unite: Option<String>,
    pub date: chrono::NaiveDateTime,
}

/// Historique des constantes d'un patient (dernières en premier).
#[tauri::command]
pub async fn list_constantes(
    patient_id: String,
    token: String,
) -> Result<Vec<ConstanteBio>, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, ConstanteBio>(
        "SELECT id, \"patientId\" as patient_id, type, valeur, unite, date FROM \"ConstanteBio\" \
         WHERE \"patientId\" = $1 ORDER BY date DESC LIMIT 2000",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Saisie rapide d'une constante (TA, poids, glycémie…).
#[tauri::command]
pub async fn creer_constante(
    patient_id: String,
    type_constante: String,
    valeur: String,
    unite: Option<String>,
    token: String,
) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if valeur.trim().is_empty() {
        return Err("valeur obligatoire".into());
    }
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"ConstanteBio\" (id, \"patientId\", type, valeur, unite, date) \
         VALUES ($1, $2, $3, $4, $5, now())",
    )
    .bind(&id)
    .bind(&patient_id)
    .bind(&type_constante)
    .bind(valeur.trim())
    .bind(unite)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "CONSTANTE_SAISIE",
        Some("patient"),
        Some(&patient_id),
        None,
    );
    Ok(id)
}
