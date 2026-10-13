use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RendezVous {
    pub id: String,
    pub patient_id: String,
    pub nom_patient: String,
    pub prenoms_patient: String,
    pub debut: chrono::DateTime<chrono::Utc>,
    pub duree_min: i32,
    pub statut: String,
    pub motif: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouveauRendezVous {
    pub patient_id: String,
    pub debut: String, // ISO 8601 (UTC)
    pub duree_min: i32,
    pub motif: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn list_rdv_jour(jour: String) -> Result<Vec<RendezVous>, String> {
    crate::db::list_rdv_jour(&jour).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn creer_rdv(r: NouveauRendezVous) -> Result<String, String> {
    if r.patient_id.trim().is_empty() {
        return Err("le patient est obligatoire".into());
    }
    let debut = chrono::DateTime::parse_from_rfc3339(&r.debut)
        .map_err(|_| "date de début invalide (RFC3339 attendu)")?
        .with_timezone(&chrono::Utc);
    crate::db::creer_rdv(&r.patient_id, debut, r.duree_min, &r.motif, &r.notes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn changer_statut_rdv(id: String, statut: String) -> Result<(), String> {
    if !["PLANIFIE", "ARRIVE", "HONORE", "ANNULE"].contains(&statut.as_str()) {
        return Err("statut inconnu".into());
    }
    crate::db::changer_statut_rdv(&id, &statut)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn supprimer_rdv(id: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::supprimer_rdv(&id)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "RDV_SUPPRESSION",
        Some("rendez_vous"),
        Some(&id),
        None,
    );
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModificationRdv {
    pub id: String,
    pub debut: String,
    pub duree_min: i32,
    pub motif: Option<String>,
}

#[tauri::command]
pub async fn modifier_rdv(m: ModificationRdv, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let debut = chrono::DateTime::parse_from_rfc3339(&m.debut)
        .map_err(|_| "date de début invalide")?
        .with_timezone(&chrono::Utc);
    crate::db::modifier_rdv(&m.id, debut, m.duree_min, &m.motif)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "RDV_MODIFICATION",
        Some("rendez_vous"),
        Some(&m.id),
        None,
    );
    Ok(())
}
