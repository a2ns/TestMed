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
    let api_key = std::env::var("AI_API_KEY").map_err(|_| "AI_API_KEY non configurée")?;
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
    let resp = client
        .post(format!("{}/chat/completions", base_url()))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("erreur IA : statut {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())
}
