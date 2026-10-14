//! Assistant IA de rédaction de courriers médicaux.
//! API compatible OpenAI : Mistral (cloud) ou Ollama (100 % local).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContexteCourrier {
    pub nom_patient: String,
    pub prenoms_patient: String,
    pub age: Option<i32>,
    pub ville: Option<String>,
    pub date_jour: String,
    pub nom_praticien: String,
    pub cabinet: Option<String>,
    pub adresse_cabinet: Option<String>,
    pub telephone_praticien: Option<String>,
    pub email_praticien: Option<String>,
    pub destinataire: Option<String>,
    pub gabarit: String,
    pub notes: String,
}

const SYSTEM_PROMPT: &str = "Tu es un assistant de rédaction de courriers médicaux pour un médecin généraliste. \
Rédige un courrier professionnel, clair et concis en français, à partir des notes de consultation. \
N'invente aucun diagnostic ni traitement non mentionné dans les notes. \
Règle absolue : ne laisse AUCUN champ à compléter, aucun [crochet], aucun placeholder. \
Utilise uniquement les informations fournies dans le contexte ; s'il manque une information (coordonnées \
du praticien ou du destinataire), compose le courrier sans cette ligne plutôt que d'insérer un champ vide. \
Le courrier doit être prêt à imprimer tel quel.

MISE EN PAGE EXIGÉE (courrier postal français) :
- En-tête expéditeur en HAUT À GAUCHE : nom du médecin, cabinet, adresse, téléphone, email (fournis dans le contexte).
- Destinataire en HAUT À DROITE (sous l'expéditeur) : nom et adresse du destinataire fournis.
- Date et ville du jour, alignées à DROITE, sous le destinataire : « [Ville], le [date du jour] » (fournies dans le contexte).
- Puis l'objet, le corps, la formule de politesse et la signature.
Utilise un texte brut structuré par des lignes et des lignes vides (pas de tableaux, pas de markdown **gras**)";

fn base_url() -> String {
    std::env::var("AI_BASE_URL").unwrap_or_else(|_| "https://api.mistral.ai/v1".into())
}

fn model() -> String {
    std::env::var("AI_MODEL").unwrap_or_else(|_| "mistral-small-latest".into())
}

/// Construit le prompt utilisateur avec tout le contexte disponible.
fn prompt_contexte(c: &ContexteCourrier) -> String {
    let mut p = String::new();
    p.push_str(&format!("Gabarit : {}\n", c.gabarit));
    p.push_str(&format!(
        "Patient : {} {}, âgé de {}\n",
        c.prenoms_patient,
        c.nom_patient,
        match c.age {
            Some(a) => format!("{a} ans"),
            None => "âge inconnu (ne le mentionne pas)".into(),
        }
    ));
    p.push_str(&format!("Médecin expéditeur : {}\n", c.nom_praticien));
    if let Some(cab) = &c.cabinet {
        p.push_str(&format!("Cabinet : {cab}\n"));
    }
    if let Some(ad) = &c.adresse_cabinet {
        p.push_str(&format!("Adresse du cabinet : {ad}\n"));
    }
    if let Some(t) = &c.telephone_praticien {
        p.push_str(&format!("Téléphone : {t}\n"));
    }
    if let Some(e) = &c.email_praticien {
        p.push_str(&format!("Email : {e}\n"));
    }
    match &c.destinataire {
        Some(d) if !d.trim().is_empty() => {
            p.push_str(&format!("Destinataire (Dr ou spécialiste ciblé) : {d}\n"))
        }
        _ => p.push_str("Destinataire : général, utilise « Cher Confrère »\n"),
    }
    p.push_str(&format!("\nNotes de consultation :\n{}\n", c.notes));
    p.push_str(&format!("\nDate du jour : {}\n", c.date_jour));
    match &c.ville {
        Some(v) if !v.trim().is_empty() => p.push_str(&format!("Ville d'émission : {v}\n")),
        _ => p.push_str("Ville d'émission : inconnue (écris seulement la date, sans ville)\n"),
    }
    p.push_str("\nRédige le courrier complet, prêt à imprimer, avec en-tête du praticien, destinataire, objet, corps et signature. Aucun placeholder.");
    p
}

/// Génère un courrier à partir du contexte complet.
pub async fn generer(c: &ContexteCourrier) -> Result<String, String> {
    let corps = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt_contexte(c)}
        ],
        "temperature": 0.3
    });
    let reponse = appel_ia(&corps).await?;
    Ok(reponse)
}

/// Appel IA commun (avec clé si présente — Ollama n'en exige pas).
async fn appel_ia(corps: &serde_json::Value) -> Result<String, String> {
    let api_key = std::env::var("AI_API_KEY").unwrap_or_default();
    let client = reqwest::Client::new();
    let mut requete = client
        .post(format!("{}/chat/completions", base_url()))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        requete = requete.bearer_auth(&api_key);
    }
    let resp = requete
        .json(corps)
        .send()
        .await
        .map_err(|e| format!("IA injoignable ({e}) — vérifiez AI_BASE_URL ou lancez Ollama"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "erreur IA (statut {}) — vérifiez AI_API_KEY (Mistral) ou AI_MODEL",
            resp.status()
        ));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())
}

/// Teste la connexion à l'IA.
#[tauri::command]
pub async fn tester_ia(token: String) -> Result<serde_json::Value, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let corps = serde_json::json!({
        "model": model(),
        "messages": [{"role": "user", "content": "Réponds uniquement par: OK"}],
        "temperature": 0.0,
        "max_tokens": 10
    });
    let reponse = appel_ia(&corps).await?;
    Ok(serde_json::json!({
        "operationnel": true,
        "base_url": base_url(),
        "modele": model(),
        "reponse": reponse
    }))
}

/// Reformule un texte : améliore la forme sans toucher au fond médical.
#[tauri::command]
pub async fn reformuler_texte(texte: String, consigne: String, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let corps = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": "Tu reformules des courriers médicaux en français. Tu ne changes JAMAIS le sens médical, n'ajoutes ni ne retires d'information clinique. Corrige la forme : clarté, professionnel, orthographe. Aucun placeholder."},
            {"role": "user", "content": format!("Consigne : {consigne}\n\nTexte à reformuler :\n{texte}")}
        ],
        "temperature": 0.3
    });
    let resultat = appel_ia(&corps).await?;
    crate::audit::journaliser(
        &utilisateur.id,
        "IA_REFORMULATION",
        None,
        None,
        Some(serde_json::json!({ "taille": texte.len() })),
    );
    Ok(resultat)
}

/// Assistante IA générique pour les tâches du dossier patient.
/// tache : "consultation" (structurer des notes) | "ordonnance" (proposer
/// des lignes de prescription). Le médecin valide toujours le résultat.
#[tauri::command]
pub async fn assister_ia(tache: String, entree: String, token: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let (systeme, consigne) = match tache.as_str() {
        "consultation" => (
            "Tu es un assistant pour un médecin généraliste. Structure et clarifie des notes de consultation prises à la hâte, en une observation médicale claire et ordonnée : motif, examen, diagnostic, conduite à tenir. Ne JAMAIS inventer d'information clinique absente des notes, ne pas inventer de diagnostic. Texte brut, sans markdown.",
            format!("Structure ces notes de consultation en observation claire :
{entree}"),
        ),
        "ordonnance" => (
            "Tu es un assistant de prescription pour un médecin généraliste. À partir d'une description libre, propose des lignes d'ordonnance au format strict : « Médicament | posologie | durée » une par ligne. Ne propose QUE des médicaments courants de médecine générale adaptés à la description. Rappelle en fin de réponse : « À vérifier et valider par le médecin ».",
            format!("Propose des lignes de prescription pour : {entree}"),
        ),
        _ => return Err("tache inconnue".into()),
    };
    let corps = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": systeme},
            {"role": "user", "content": consigne}
        ],
        "temperature": 0.3
    });
    let resultat = appel_ia(&corps).await?;
    crate::audit::journaliser(
        &utilisateur.id,
        "IA_ASSISTANCE",
        Some("dossier"),
        Some(&tache),
        Some(serde_json::json!({ "taille": entree.len() })),
    );
    Ok(resultat)
}
