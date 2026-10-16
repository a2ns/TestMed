use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Correspondant {
    pub id: String,
    pub nom: String,
    pub specialite: Option<String>,
    pub adresse: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
}

/// Liste complète du carnet de correspondants.
#[tauri::command]
pub async fn list_correspondants(token: String) -> Result<Vec<Correspondant>, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Correspondant>(
        "SELECT id, nom, specialite, adresse, email, telephone FROM \"Correspondant\" ORDER BY nom",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Ajoute un correspondant (dédupliqué par nom + spécialité).
#[tauri::command]
pub async fn creer_correspondant(
    nom: String,
    specialite: Option<String>,
    adresse: Option<String>,
    email: Option<String>,
    telephone: Option<String>,
    token: String,
) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if nom.trim().is_empty() {
        return Err("le nom est obligatoire".into());
    }
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"Correspondant\" (id, nom, specialite, adresse, email, telephone) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         ON CONFLICT (nom, specialite) DO NOTHING",
    )
    .bind(&id)
    .bind(nom.trim())
    .bind(specialite)
    .bind(adresse)
    .bind(email)
    .bind(telephone)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    crate::audit::journaliser(&utilisateur.id, "CORRESPONDANT_AJOUT", Some("correspondant"), Some(&id), None);
    Ok(id)
}
