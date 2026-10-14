//! Configuration applicative chiffrée : les secrets (identifiants Amélie,
//! DICOS, clés API) sont stockés en base, chiffrés AES-256-GCM avec la clé
//! maître — jamais en clair dans un fichier .env.
//!
//! Accès : lecture des valeurs uniquement par le code applicatif (jamais
//! exposées à l'IHM en retour — l'IHM ne voit que « configuré / non ») ;
//! écriture réservée au rôle ADMIN via la commande enregistrer_config.

use serde::{Deserialize, Serialize};

/// Chiffre et stocke une valeur de configuration.
/// Remplace la valeur existante pour la même clé (upsert).
#[tauri::command]
pub async fn enregistrer_config(
    cle: String,
    valeur: String,
    token: String,
) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.role != "ADMIN" {
        return Err("configuration réservée au rôle ADMIN".into());
    }
    let chiffre = crate::crypto::chiffrer(&valeur)?;
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO \\"ConfigApp\\" (cle, valeur_chiffree, \\"misAJour\\", \\"misAJourPar\\") \\\\
         VALUES ($1, $2, now(), $3) \\\\
         ON CONFLICT (cle) DO UPDATE SET valeur_chiffree = $2, \\"misAJour\\" = now(), \\"misAJourPar\\" = $3",
    )
    .bind(&cle)
    .bind(&chiffre)
    .bind(&utilisateur.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    crate::audit::journaliser(&utilisateur.id, "CONFIG_ENREGISTREE", Some("config"), Some(&cle), None);
    Ok(())
}

/// Supprime une entrée de configuration.
#[tauri::command]
pub async fn supprimer_config(cle: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.role != "ADMIN" {
        return Err("configuration réservée au rôle ADMIN".into());
    }
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM \\"ConfigApp\\" WHERE cle = $1")
        .bind(&cle)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(&utilisateur.id, "CONFIG_SUPPRIMEE", Some("config"), Some(&cle), None);
    Ok(())
}

/// Liste les clés configurées — SANS les valeurs (jamais exposées à l'IHM).
#[tauri::command]
pub async fn lister_config(token: String) -> Result<Vec<String>, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.role != "ADMIN" {
        return Err("configuration réservée au rôle ADMIN".into());
    }
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let cles: Vec<(String,)> = sqlx::query_as("SELECT cle FROM \\"ConfigApp\\" ORDER BY cle")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(cles.into_iter().map(|(c,)| c).collect())
}

/// Lecture interne (jamais une commande Tauri) : déchiffre une valeur
/// pour le code applicatif (connecteurs, IA).
pub async fn lire_config(cle: &str) -> Option<String> {
    let pool = crate::db::pool().ok()?;
    let chiffre: Option<(String,)> = sqlx::query_as(
        "SELECT valeur_chiffree FROM \\"ConfigApp\\" WHERE cle = $1",
    )
    .bind(cle)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    let (c,)? = chiffre?;
    crate::crypto::dechiffrer(&c).ok()
}
