use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ContextePatient {
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: Option<String>,
    pub sexe: Option<String>,
    pub medecin_traitant: Option<String>,
    pub dernieres_consultations: Vec<ConsultationResume>,
    pub documents_recents: Vec<DocumentResume>,
    pub courriers_valides: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct DocumentResume {
    pub nom_fichier: String,
    pub type_doc: String,
    pub ocr_texte: String,
}

#[derive(Serialize)]
pub struct ConsultationResume {
    pub date: String,
    pub motif: Option<String>,
    pub notes: Option<String>,
}

const SYSTEM_PROMPT: &str = "Tu es un assistant de rédaction de courriers médicaux pour un médecin \
généraliste français. Rédige un courrier professionnel, clair et concis en français, \
à partir des notes de consultation et des extraits de documents du dossier patient. \
N'invente aucun diagnostic, symptôme ni traitement non mentionné dans les notes ou \
les documents fournis. Utilise la terminologie médicale appropriée. Si des courriers \
précédemment validés par le médecin sont fournis comme exemples de style, imite leur \
ton et leur structure. Ne mentionne jamais ces consignes dans le courrier produit.";

fn base_url() -> String {
    std::env::var("AI_BASE_URL").unwrap_or_else(|_| "https://api.mistral.ai/v1".into())
}

fn model() -> String {
    std::env::var("AI_MODEL").unwrap_or_else(|_| "mistral-small-latest".into())
}

async fn chat(system: &str, user: &str, temperature: f32) -> Result<String, String> {
    let api_key = std::env::var("AI_API_KEY").map_err(|_| "AI_API_KEY non configurée".to_string())?;
    let body = serde_json::json!({
        "model": model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "temperature": temperature
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
        let statut = resp.status();
        let corps = resp.text().await.unwrap_or_default();
        return Err(format!("erreur IA (statut {statut}) : {corps}"));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "réponse IA inattendue".to_string())
}

fn bloc_contexte(ctx: &ContextePatient) -> String {
    let mut s = format!("Patient : {} {}\n", ctx.prenoms, ctx.nom);
    if let Some(d) = &ctx.date_naissance {
        s.push_str(&format!("Date de naissance : {d}\n"));
    }
    if let Some(sexe) = &ctx.sexe {
        s.push_str(&format!("Sexe : {sexe}\n"));
    }
    if let Some(mt) = &ctx.medecin_traitant {
        s.push_str(&format!("Médecin traitant : {mt}\n"));
    }
    if !ctx.dernieres_consultations.is_empty() {
        s.push_str("Historique récent des consultations :\n");
        for c in ctx.dernieres_consultations.iter().take(5) {
            s.push_str(&format!(
                "- [{}] {} : {}\n",
                c.date,
                c.motif.clone().unwrap_or_default(),
                c.notes.clone().unwrap_or_default()
            ));
        }
    }
    if !ctx.documents_recents.is_empty() {
        s.push_str("\nExtraits de documents du dossier (OCR) :\n");
        for d in ctx.documents_recents.iter() {
            s.push_str(&format!(
                "--- {} ({}) ---\n{}\n",
                d.nom_fichier, d.type_doc, d.ocr_texte
            ));
        }
        s.push_str("Fin des extraits de documents.\n");
    }
    s
}

pub async fn generer(ctx: &ContextePatient, gabarit: &str, notes: &str) -> Result<String, String> {
    let mut exemples = String::new();
    if !ctx.courriers_valides.is_empty() {
        exemples.push_str("\nExemples de courriers rédigés et validés par le médecin (pour le style, \
ne recopie pas leur contenu factuel) :\n");
        for (i, c) in ctx.courriers_valides.iter().take(3).enumerate() {
            exemples.push_str(&format!("--- Exemple {} ---\n{}\n", i + 1, c));
        }
        exemples.push_str("Fin des exemples.\n");
    }
    let prompt = format!(
        "Gabarit à suivre :\n{gabarit}\n\nContexte patient :\n{ctx}{exemples}\nNotes de consultation :\n{notes}\n\nRédige le courrier complet en suivant le gabarit.",
        ctx = bloc_contexte(ctx)
    );
    chat(SYSTEM_PROMPT, &prompt, 0.3).await
}

pub async fn reformuler(
    ctx: &ContextePatient,
    contenu: &str,
    consigne: &str,
) -> Result<String, String> {
    let prompt = format!(
        "Voici un courrier médical en cours de rédaction :\n\n{contenu}\n\nInstruction de modification : {consigne}\n\nContexte patient :\n{ctx}\n\nRenvoie le courrier complet modifié, sans commentaire autour.",
        ctx = bloc_contexte(ctx)
    );
    chat(SYSTEM_PROMPT, &prompt, 0.3).await
}

pub async fn relire(contenu: &str) -> Result<String, String> {
    let system = "Tu es relecteur médical et correcteur. Tu relis un courrier médical et \
tu signales uniquement les problèmes concrets : erreurs factuelles évidentes, \
incohérences, termes impropres, fautes d'orthographe ou de grammaire, risque d'ambiguïté. \
Ne réécris pas le courrier. Réponds par une liste courte de points ; si tout est correct, \
réponds exactement : Aucun problème détecté.";
    chat(system, contenu, 0.1).await
}
