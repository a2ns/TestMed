use serde::Serialize;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourrierDossier {
    pub id: String,
    pub sujet: Option<String>,
    pub contenu: String,
    pub statut: String,
    pub date: Option<String>,
}

#[tauri::command]
pub async fn list_courriers_patient(patient_id: String) -> Result<Vec<CourrierDossier>, String> {
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, CourrierDossier>(
        "SELECT id, sujet, contenu, statut, CAST(date AS VARCHAR(25)) as date \
         FROM \"Courrier\" WHERE \"patientId\" = $1 \
         ORDER BY date DESC LIMIT 2000",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDossier {
    pub id: String,
    pub nom_fichier: String,
    pub r#type: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_documents_patient(patient_id: String) -> Result<Vec<DocumentDossier>, String> {
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, DocumentDossier>(
        "SELECT id, \"nomFichier\" as nom_fichier, type::text as type, \
         CAST(\"createdAt\" AS VARCHAR(25)) as created_at \
         FROM \"Document\" WHERE \"patientId\" = $1 \
         ORDER BY \"createdAt\" DESC LIMIT 2000",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VaccinationDossier {
    pub id: String,
    pub vaccin: String,
    pub date: Option<String>,
    pub date_rappel: Option<String>,
    pub lot: Option<String>,
}

#[tauri::command]
pub async fn list_vaccinations_patient(
    patient_id: String,
) -> Result<Vec<VaccinationDossier>, String> {
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, VaccinationDossier>(
        "SELECT id, vaccin, CAST(date AS VARCHAR(25)) as date, \
         CAST(\"dateRappel\" AS VARCHAR(25)) as date_rappel, lot \
         FROM \"Vaccination\" WHERE \"patientId\" = $1 \
         ORDER BY date DESC LIMIT 500",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}
