//! Journal d'audit : traçabilité des accès aux données de santé.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EntreeAudit {
    pub id: i64,
    pub ts: chrono::NaiveDateTime,
    pub user_id: String,
    pub action: String,
    pub cible_type: Option<String>,
    pub cible_id: Option<String>,
    pub detail: Option<serde_json::Value>,
}

/// Journalise une action de manière non bloquante : une panne d'audit ne
/// doit jamais empêcher l'action métier (l'erreur est seulement remontée).
pub fn journaliser(
    user_id: &str,
    action: &str,
    cible_type: Option<&str>,
    cible_id: Option<&str>,
    detail: Option<serde_json::Value>,
) {
    let user_id = user_id.to_string();
    let action = action.to_string();
    let cible_type = cible_type.map(|s| s.to_string());
    let cible_id = cible_id.map(|s| s.to_string());
    tauri::async_runtime::spawn(async move {
        let res = crate::db::insert_audit(
            &user_id,
            &action,
            cible_type.as_deref(),
            cible_id.as_deref(),
            detail,
        )
        .await;
        if let Err(e) = res {
            eprintln!("[audit] échec de journalisation : {e}");
        }
    });
}

/// Consultation du journal — réservée au rôle ADMIN.
#[tauri::command]
pub async fn list_audit_log(admin_token: String, limite: i64) -> Result<Vec<EntreeAudit>, String> {
    let admin = crate::auth::valider_session(&admin_token).ok_or("session expirée")?;
    if admin.role != "ADMIN" {
        return Err("consultation du journal réservée au rôle ADMIN".into());
    }
    let limite = limite.clamp(1, 1000);
    crate::db::list_audit(limite)
        .await
        .map_err(|e| e.to_string())
}
