use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct CourrierIaRequest {
    pub nom_patient: String,
    pub prenoms_patient: String,
    pub gabarit: String,
    pub notes: String,
}

const SYSTEM_PROMPT: &str = "Tu es un assistant de rédaction de courriers médicaux pour un médecin généraliste. \
Rédige un courrier professionnel, clair et concis en français, à partir des notes de consultation. \
N'invente aucun diagnostic ni traitement non mentionné dans les notes.";

fn base_url() -> String {
    std::env::var("AI_BASE_URL").unwrap_or_else(|_| "https://api.mistral.ai/v1".into())
}

fn model() -> String {
    std::env::var("AI_MODEL").unwrap_or_else(|_| "mistral-small-latest".into())
}

pub async fn generer(
    nom: &str,
    prenoms: &str,
    gabarit: &str,
    notes: &str,
) -> Result<String, String> {
    let api_key = std::env::var("AI_API_KEY").unwrap_or_default();
    let prompt = format!(
        "Gabarit : {gabarit}\nPatient : {prenoms} {nom}\n\nNotes de consultation :\n{notes}\n\nRédige le courrier."
    );
    let body = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    });
    let client = reqwest::Client::new();
    let mut requete = client
        .post(format!("{}/chat/completions", base_url()))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        requete = requete.bearer_auth(&api_key);
    }
    let resp = requete
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!(
            "erreur IA (statut {}) — vérifiez AI_API_KEY (Mistral) ou AI_BASE_URL/AI_MODEL (Ollama local)",
            resp.status()
        ));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())
}

/// Teste la connexion à l'IA (vérifie la configuration et l'appel réel).
#[tauri::command]
pub async fn tester_ia(token: String) -> Result<serde_json::Value, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let reponse = appel_simple("Réponds uniquement par: OK").await?;
    Ok(serde_json::json!({
        "operationnel": true,
        "base_url": base_url(),
        "modele": model(),
        "reponse": reponse
    }))
}

/// Reformule un texte (courrier en cours d'édition) : plus clair, plus
/// professionnel, sans changer le sens médical.
#[tauri::command]
pub async fn reformuler_texte(texte: String, consigne: String, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let api_key = std::env::var("AI_API_KEY").unwrap_or_default();
    let corps = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": "Tu reformules des courriers médicaux en français. Tu ne changes JAMAIS le sens médical, n'ajoutes ni ne retires d'information clinique. Corrige la forme : clarté, professionnel, orthographe."},
            {"role": "user", "content": format!("Consigne : {consigne}\n\nTexte à reformuler :\n{texte}")}
        ],
        "temperature": 0.3
    });
    let client = reqwest::Client::new();
    let mut requete = client
        .post(format!("{}/chat/completions", base_url()))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        requete = requete.bearer_auth(&api_key);
    }
    let resp = requete
        .json(&corps)
        .send()
        .await
        .map_err(|e| format!("IA injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("erreur IA (statut {}) — vérifiez la configuration", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let resultat = json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "IA_REFORMULATION",
        None,
        None,
        Some(serde_json::json!({ "taille": texte.len() })),
    );
    Ok(resultat)
}

/// Appel IA minimal (test de connexion).
async fn appel_simple(instruction: &str) -> Result<String, String> {
    let api_key = std::env::var("AI_API_KEY").unwrap_or_default();
    let corps = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "user", "content": instruction}
        ],
        "temperature": 0.0,
        "max_tokens": 10
    });
    let client = reqwest::Client::new();
    let mut requete = client
        .post(format!("{}/chat/completions", base_url()))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        requete = requete.bearer_auth(&api_key);
    }
    let resp = requete
        .json(&corps)
        .send()
        .await
        .map_err(|e| format!("IA injoignable ({e}) — vérifiez AI_BASE_URL (API Mistral) ou lancez Ollama"))?;
    if !resp.status().is_success() {
        return Err(format!("statut {} — clé invalide (AI_API_KEY) ou modèle inconnu (AI_MODEL)", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())
}
