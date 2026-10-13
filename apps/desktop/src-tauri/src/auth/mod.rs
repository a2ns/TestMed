//! Authentification locale : praticien + mot de passe (bcrypt), session
//! en mémoire du client, rôles (MEDECIN / SECRETAIRE / ADMIN).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, FromRow)]
pub struct Utilisateur {
    pub id: String,
    pub identifiant: String,
    pub nom: String,
    pub prenoms: String,
    pub role: String,
    pub rpps: Option<String>,
    pub cabinet_nom: Option<String>,
    pub cabinet_adresse: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Identifiants {
    pub identifiant: String,
    pub mot_de_passe: String,
}

struct Sessions {
    map: HashMap<String, (Utilisateur, Instant)>,
}

static SESSIONS: Mutex<Option<Sessions>> = Mutex::new(None);
const EXPIRATION_SECONDES: u64 = 8 * 3600;

fn avec_sessions<R>(f: impl FnOnce(&mut Sessions) -> R) -> R {
    let mut guard = SESSIONS.lock().unwrap();
    let sessions = guard.get_or_insert_with(|| Sessions {
        map: HashMap::new(),
    });
    f(sessions)
}

pub fn creer_session(utilisateur: Utilisateur) -> String {
    let token = Uuid::new_v4().to_string();
    avec_sessions(|s| {
        s.map.insert(token.clone(), (utilisateur, Instant::now()));
        s.map.retain(|_, (_, ts)| ts.elapsed().as_secs() < EXPIRATION_SECONDES);
    });
    token
}

pub fn valider_session(token: &str) -> Option<Utilisateur> {
    avec_sessions(|s| {
        s.map.get(token).and_then(|(u, ts)| {
            if ts.elapsed().as_secs() < EXPIRATION_SECONDES {
                Some(u.clone())
            } else {
                None
            }
        })
    })
}

pub fn supprimer_session(token: &str) {
    avec_sessions(|s| {
        s.map.remove(token);
    });
}

#[tauri::command]
pub async fn connexion(identifiants: Identifiants) -> Result<String, String> {
    let hash = crate::db::hash_mot_de_passe(&identifiants.identifiant).await;
    let ok = match &hash {
        Ok(h) => bcrypt::verify(&identifiants.mot_de_passe, h).unwrap_or(false),
        Err(_) => false,
    };
    if !ok {
        crate::audit::journaliser(
            &identifiants.identifiant,
            "CONNEXION_ECHEC",
            None,
            None,
            None,
        );
        return Err("identifiant ou mot de passe incorrect".into());
    }
    let utilisateur = crate::db::charger_utilisateur(&identifiants.identifiant).await?;
    let id = utilisateur.id.clone();
    let token = creer_session(utilisateur);
    crate::audit::journaliser(&id, "CONNEXION_OK", None, None, None);
    Ok(token)
}

#[tauri::command]
pub fn utilisateur_courant(token: String) -> Result<Utilisateur, String> {
    valider_session(&token).ok_or_else(|| "session expirée".to_string())
}

#[tauri::command]
pub fn deconnexion(token: String) {
    supprimer_session(&token)
}

#[tauri::command]
pub async fn creer_compte(identifiants: Identifiants, role: String, admin_token: String) -> Result<(), String> {
    let admin = valider_session(&admin_token).ok_or("session admin requise")?;
    if admin.role != "ADMIN" {
        return Err("rôle ADMIN requis pour créer un compte".into());
    }
    let hash = bcrypt::hash(&identifiants.mot_de_passe, bcrypt::DEFAULT_COST)
        .map_err(|e| e.to_string())?;
    crate::db::creer_utilisateur(&identifiants.identifiant, &hash, &role).await
}
