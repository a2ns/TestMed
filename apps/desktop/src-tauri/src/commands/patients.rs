use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Patient {
    pub id: String,
    pub nom: String,
    pub prenoms: String,
}

#[tauri::command]
pub async fn list_patients(recherche: String) -> Result<Vec<Patient>, String> {
    crate::db::query_patients(&recherche).await.map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PatientDetail {
    pub id: String,
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: Option<chrono::NaiveDate>,
    pub sexe: Option<String>,
    pub adresse: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub medecin_traitant: Option<String>,
    pub nir: Option<String>,
}

#[tauri::command]
pub async fn get_patient(id: String, token: String) -> Result<PatientDetail, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::audit::journaliser(
        &utilisateur.id,
        "ACCES_PATIENT",
        Some("patient"),
        Some(&id),
        None,
    );
    crate::db::get_patient(&id).await.map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouveauPatient {
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: Option<String>,
    pub sexe: Option<String>,
    pub adresse: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub medecin_traitant: Option<String>,
    pub nir: Option<String>,
}

#[tauri::command]
pub async fn creer_patient(p: NouveauPatient) -> Result<String, String> {
    if p.nom.trim().is_empty() {
        return Err("le nom est obligatoire".into());
    }
    crate::db::creer_patient(&p).await.map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Consultation {
    pub id: String,
    pub patient_id: String,
    pub motif: Option<String>,
    pub notes: Option<String>,
    pub date: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelleConsultation {
    pub patient_id: String,
    pub motif: String,
    pub notes: String,
}

#[tauri::command]
pub async fn list_consultations(patient_id: String) -> Result<Vec<Consultation>, String> {
    crate::db::list_consultations(&patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn creer_consultation(c: NouvelleConsultation) -> Result<String, String> {
    if c.motif.trim().is_empty() {
        return Err("le motif est obligatoire".into());
    }
    crate::db::creer_consultation(&c)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Antecedent {
    pub id: String,
    pub categorie: String,
    pub libelle: String,
    pub annee: Option<i32>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn list_antecedents(patient_id: String) -> Result<Vec<Antecedent>, String> {
    crate::db::list_antecedents(&patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelAntecedent {
    pub patient_id: String,
    pub categorie: String,
    pub libelle: String,
    pub annee: Option<i32>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn creer_antecedent(a: NouvelAntecedent) -> Result<String, String> {
    if a.libelle.trim().is_empty() {
        return Err("le libellé est obligatoire".into());
    }
    crate::db::creer_antecedent(&a)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Traitement {
    pub id: String,
    pub medicament: String,
    pub posologie: String,
    pub duree: Option<String>,
    pub actif: bool,
}

#[tauri::command]
pub async fn list_traitements(patient_id: String) -> Result<Vec<Traitement>, String> {
    crate::db::list_traitements(&patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouveauTraitement {
    pub patient_id: String,
    pub medicament: String,
    pub posologie: String,
    pub duree: Option<String>,
}

#[tauri::command]
pub async fn creer_traitement(t: NouveauTraitement) -> Result<String, String> {
    if t.medicament.trim().is_empty() {
        return Err("le médicament est obligatoire".into());
    }
    crate::db::creer_traitement(&t)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Allergie {
    pub id: String,
    pub substance: String,
    pub gravite: String,
    pub reactions: Option<String>,
}

#[tauri::command]
pub async fn list_allergies(patient_id: String) -> Result<Vec<Allergie>, String> {
    crate::db::list_allergies(&patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelleAllergie {
    pub patient_id: String,
    pub substance: String,
    pub gravite: String,
    pub reactions: Option<String>,
}

#[tauri::command]
pub async fn creer_allergie(a: NouvelleAllergie) -> Result<String, String> {
    if a.substance.trim().is_empty() {
        return Err("la substance est obligatoire".into());
    }
    crate::db::creer_allergie(&a)
        .await
        .map_err(|e| e.to_string())
}
