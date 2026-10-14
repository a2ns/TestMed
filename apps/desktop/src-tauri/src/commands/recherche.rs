use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ResultatDocument {
    pub id: String,
    pub patient_id: Option<String>,
    pub nom_patient: Option<String>,
    pub nom_fichier: String,
    pub r#type: String,
    pub extrait: Option<String>,
    pub created_at: chrono::NaiveDateTime,
}

/// Import intelligent : détecte le patient destinataire à partir du texte
/// OCR (nom + prénom trouvés dans le document). Si aucun patient ne
/// correspond avec suffisamment de certitude, le document part au caddie
/// (aTrier = true) pour classement manuel par le praticien.
#[tauri::command]
pub async fn importer_document_intelligent(
    chemin: String,
    nom_fichier: String,
    type_doc: String,
    patient_indice: Option<String>,
    token: String,
) -> Result<ImportIntelligentResultat, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;

    // 1. OCR du document (Tesseract local).
    let ocr = crate::ocr::reconnaitre(&chemin).ok();

    // 2. Détection du patient : soit explicite (sélecteur IHM), soit par OCR.
    let (patient_id, confiance) = match patient_indice {
        Some(id) if !id.trim().is_empty() => (Some(id), 1.0),
        _ => match &ocr {
            Some(res) => crate::db::detecter_patient(&res.texte).await?,
            None => (None, 0.0),
        },
    };

    // 3. Enregistrement : rattaché, ou caddie si détection incertaine.
    let id = uuid::Uuid::new_v4().to_string();
    let a_trier = patient_id.is_none();
    crate::db::insert_document_ocr_intelligent(
        &id,
        patient_id.as_deref(),
        &nom_fichier,
        &chemin,
        &type_doc,
        ocr.as_ref().map(|r| r.texte.as_str()).unwrap_or(""),
        a_trier,
    )
    .await?;

    crate::audit::journaliser(
        &utilisateur.id,
        if a_trier { "DOC_CADDIE" } else { "DOC_IMPORTE" },
        Some("document"),
        Some(&id),
        Some(serde_json::json!({ "patient": patient_id, "confiance": confiance })),
    );

    Ok(ImportIntelligentResultat {
        id_document: id,
        patient_id,
        a_trier,
        texte_ocr: ocr.as_ref().map(|r| r.texte.chars().take(300).collect::<String>()).unwrap_or_default(),
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIntelligentResultat {
    pub id_document: String,
    pub patient_id: Option<String>,
    pub a_trier: bool,
    pub texte_ocr: String,
}

/// Recherche multi-critères dans la GED : texte (plein texte OCR),
/// patient, type de document, période. Tous les critères sont
/// combinés (ET) et tous optionnels.
#[tauri::command]
pub async fn recherche_multi(
    texte: Option<String>,
    patient_id: Option<String>,
    type_doc: Option<String>,
    date_debut: Option<String>,
    date_fin: Option<String>,
    token: String,
) -> Result<Vec<ResultatDocument>, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;

    // Construction dynamique : chaque critère présent ajoute sa clause.
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    // Texte : plein texte sur le tsvector (termes en conjonction).
    if let Some(t) = &texte {
        if !t.trim().is_empty() {
            let termes: Vec<String> = t
                .split_whitespace()
                .map(|m| {
                    m.trim_matches(|c: char| !(c.is_alphanumeric() || c == '-'))
                        .to_lowercase()
                })
                .filter(|m| !m.is_empty())
                .collect();
            if !termes.is_empty() {
                let tsquery = termes.join(" & ");
                params.push(tsquery);
                clauses.push(format!(
                    "d.tsv @@ to_tsquery('french', ${})",
                    params.len()
                ));
            }
        }
    }
    if let Some(p) = &patient_id {
        if !p.trim().is_empty() {
            params.push(p.clone());
            clauses.push(format!("d.\"patientId\" = ${}", params.len()));
        }
    }
    if let Some(t) = &type_doc {
        if !t.trim().is_empty() {
            params.push(t.clone());
            clauses.push(format!("d.type = ${}::\"DocType\"", params.len()));
        }
    }
    if let Some(d) = &date_debut {
        if !d.trim().is_empty() {
            params.push(d.clone());
            clauses.push(format!(
                "d.\"createdAt\" >= ${}::date",
                params.len()
            ));
        }
    }
    if let Some(f) = &date_fin {
        if !f.trim().is_empty() {
            params.push(f.clone());
            clauses.push(format!(
                "d.\"createdAt\" < (${}::date + interval '1 day')",
                params.len()
            ));
        }
    }

    let mut requete = format!(
        "SELECT d.id, d.\"patientId\" as patient_id, p.nom as nom_patient, \
         d.\"nomFichier\" as nom_fichier, d.type::text as type, \
         CASE WHEN d.tsv IS NULL THEN NULL ELSE LEFT(d.\"ocrTexte\", 200) END as extrait, \
         d.\"createdAt\" as created_at \
         FROM \"Document\" d LEFT JOIN \"Patient\" p ON p.id = d.\"patientId\""
    );
    if !clauses.is_empty() {
        requete.push_str(" WHERE ");
        requete.push_str(&clauses.join(" AND "));
    }
    requete.push_str(" ORDER BY d.\"createdAt\" DESC LIMIT 200");

    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let mut q = sqlx::query_as::<_, ResultatDocument>(&requete);
    for p in &params {
        q = q.bind(p);
    }
    let resultats = q.fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(resultats)
}

/// Documents du caddie (à trier par le praticien).
#[tauri::command]
pub async fn list_documents_a_trier(token: String) -> Result<Vec<ResultatDocument>, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::list_documents_a_trier()
        .await
        .map_err(|e| e.to_string())
}

/// Compteur du caddie (pour la puce de notification du menu).
#[tauri::command]
pub async fn compter_a_trier(token: String) -> Result<i64, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::compter_a_trier().await.map_err(|e| e.to_string())
}

/// Classe un document du caddie vers un patient (ou type de document).
#[tauri::command]
pub async fn classer_document(
    document_id: String,
    patient_id: String,
    type_doc: Option<String>,
    token: String,
) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    crate::db::classer_document(&document_id, &patient_id, type_doc.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "DOC_CLASSE",
        Some("document"),
        Some(&document_id),
        Some(serde_json::json!({ "patient": patient_id })),
    );
    Ok(())
}

/// Recherche plein texte sur l'OCR des documents (lexique français).
#[tauri::command]
pub async fn recherche_documents(
    recherche: String,
    type_doc: Option<String>,
    token: String,
) -> Result<Vec<ResultatDocument>, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
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
        "SELECT d.id, d.\"patientId\" as patient_id, p.nom as nom_patient, d.\"nomFichier\" as nom_fichier, d.type::text as type, \
         ts_headline('french', d.\"ocrTexte\", to_tsquery('french', $1), 'StartSel=[[, StopSel=]]') as extrait, \
         d.\"createdAt\" as created_at \
         FROM \"Document\" d LEFT JOIN \"Patient\" p ON p.id = d.\"patientId\" \
         WHERE d.tsv @@ to_tsquery('french', $1) AND ($2::text IS NULL OR d.type = $2::\"DocType\") \
         ORDER BY ts_rank(d.tsv, to_tsquery('french', $1)) DESC \
         LIMIT 50"
    );
    let resultats = sqlx::query_as::<_, ResultatDocument>(&requete)
        .bind(&tsquery)
        .bind(type_doc)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "RECHERCHE_GED",
        None,
        None,
        Some(serde_json::json!({ "termes": tsquery, "resultats": resultats.len() })),
    );
    Ok(resultats)
}

/// Liste des documents d'un patient.
#[tauri::command]
pub async fn list_documents(patient_id: Option<String>) -> Result<Vec<ResultatDocument>, String> {
    let pool = crate::db::pool().map_err(|e| e.to_string())?;
    let requete = format!(
        "SELECT d.id, d.\"patientId\" as patient_id, p.nom as nom_patient, d.\"nomFichier\" as nom_fichier, d.type::text as type, \
         NULL as extrait, d.\"createdAt\" as created_at \
         FROM \"Document\" d LEFT JOIN \"Patient\" p ON p.id = d.\"patientId\" \
         WHERE ($1::text IS NULL OR d.\"patientId\" = $1) \
         ORDER BY d.\"createdAt\" DESC LIMIT 200"
    );
    sqlx::query_as::<_, ResultatDocument>(&requete)
        .bind(patient_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}
