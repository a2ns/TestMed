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

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct CourrierRow {
    pub id: String,
    #[serde(rename = "patientId")]
    pub patient_id: String,
    pub sujet: Option<String>,
    pub contenu: String,
    #[serde(rename = "aiGenere")]
    pub ai_genere: bool,
    pub statut: String,
    pub date: chrono::NaiveDateTime,
}

#[derive(Serialize, Deserialize)]
pub struct CourrierSauvegarde {
    pub patient_id: String,
    pub sujet: Option<String>,
    pub contenu: String,
    pub ai_genere: bool,
    pub valide: bool,
}

#[derive(Serialize, Deserialize)]
pub struct ReformulationRequest {
    pub patient_id: String,
    pub contenu: String,
    pub consigne: String,
}

#[tauri::command]
pub async fn generer_courrier_ia(req: CourrierRequest) -> Result<CourrierGenere, String> {
    let ctx = crate::db::contexte_patient(&req.patient_id).await?;
    let contenu = crate::ia::generer(&ctx, &req.gabarit, &req.notes).await?;
    Ok(CourrierGenere { contenu })
}

#[tauri::command]
pub async fn reformuler_courrier_ia(req: ReformulationRequest) -> Result<CourrierGenere, String> {
    let ctx = crate::db::contexte_patient(&req.patient_id).await?;
    let contenu = crate::ia::reformuler(&ctx, &req.contenu, &req.consigne).await?;
    Ok(CourrierGenere { contenu })
}

#[tauri::command]
pub async fn relire_courrier_ia(contenu: String) -> Result<CourrierGenere, String> {
    let resultat = crate::ia::relire(&contenu).await?;
    Ok(CourrierGenere { contenu: resultat })
}

#[tauri::command]
pub async fn enregistrer_courrier(req: CourrierSauvegarde) -> Result<CourrierRow, String> {
    crate::db::enregistrer_courrier(&req).await
}

#[tauri::command]
pub async fn list_courriers(patient_id: Option<String>) -> Result<Vec<CourrierRow>, String> {
    crate::db::list_courriers(patient_id.as_deref()).await
}

#[tauri::command]
pub async fn valider_courrier(id: String) -> Result<(), String> {
    crate::db::valider_courrier(&id).await
}
