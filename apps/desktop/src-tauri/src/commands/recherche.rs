use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
pub struct ResultatDocument {
    pub id: String,
    pub patient_id: Option<String>,
    pub nom_patient: Option<String>,
    pub nom_fichier: String,
    pub type: String,
    pub extrait: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Recherche plein texte sur l'OCR des documents (lexique français).
#[tauri::command]
pub async fn recherche_documents(
    recherche: String,
    type_doc: Option<String>,
) -> Result<Vec<ResultatDocument>, String> {
    // Les mots saisis sont combinés en conjonction (mot1 & mot2 …) après
    // nettoyage : aucun opérateur tsquery injectable depuis l'IHM.
    let termes: Vec<String> = recherche
        .split_whitespace()
        .map(|m| {
            m.trim_matches(|c: char| !(c.is_alphanumeric() || c == '-'))
                .to_lowercase()
        })
        .filter(|m| !m.is_empty())
        .collect();
    if termes.is_empty() {
        return Ok(Vec::new());
    }
    let tsquery = termes.join(" & ");

    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let requete = format!(
        "SELECT d.id, d.patient_id, p.nom as nom_patient, d.nom_fichier, d.type, \
         ts_headline('french', d.\"ocrTexte\", to_tsquery('french', $1), 'StartSel=[[, StopSel=]]') as extrait, \
         d.created_at \
         FROM document d LEFT JOIN patient p ON p.id = d.patient_id \
         WHERE d.tsv @@ to_tsquery('french', $1) AND ($2::text IS NULL OR d.type = $2) \
         ORDER BY ts_rank(d.tsv, to_tsquery('french', $1)) DESC \
         LIMIT 50"
    );
    sqlx::query_as::<_, ResultatDocument>(&requete)
        .bind(&tsquery)
        .bind(type_doc)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Liste des documents d'un patient.
#[tauri::command]
pub async fn list_documents(patient_id: Option<String>) -> Result<Vec<ResultatDocument>, String> {
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let requete = format!(
        "SELECT d.id, d.patient_id, p.nom as nom_patient, d.nom_fichier, d.type, \
         NULL as extrait, d.created_at \
         FROM document d LEFT JOIN patient p ON p.id = d.patient_id \
         WHERE ($1::text IS NULL OR d.patient_id = $1) \
         ORDER BY d.created_at DESC LIMIT 200"
    );
    sqlx::query_as::<_, ResultatDocument>(&requete)
        .bind(patient_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}
