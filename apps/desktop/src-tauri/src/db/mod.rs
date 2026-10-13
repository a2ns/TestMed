use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::OnceLock;

static POOL: OnceLock<PgPool> = OnceLock::new();

pub async fn init(database_url: &str) -> Result<(), sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    let _ = POOL.set(pool);
    Ok(())
}

fn pool() -> Result<&'static PgPool, String> {
    POOL.get().ok_or_else(|| "base non initialisée".to_string())
}

pub async fn query_patients(recherche: &str) -> Result<Vec<crate::commands::patients::Patient>, String> {
    let pool = pool()?;
    let rows = sqlx::query_as::<_, crate::commands::patients::Patient>(
        "SELECT id, nom, prenoms FROM patient WHERE nom ILIKE $1 OR prenoms ILIKE $1 ORDER BY nom LIMIT 50",
    )
    .bind(format!("%{recherche}%"))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub async fn insert_document(doc: &crate::commands::documents::DocumentImport) -> Result<String, String> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO document (id, patient_id, nom_fichier, chemin_stockage, type) VALUES ($1, $2, $3, $4, $5)")
        .bind(&id)
        .bind(&doc.patient_id)
        .bind(&doc.nom_fichier)
        .bind(&doc.chemin)
        .bind(&doc.type_doc)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

pub async fn insert_document_ocr(
    id: &str,
    patient_id: Option<&str>,
    nom_fichier: &str,
    chemin: &str,
    type_doc: &str,
    ocr_texte: &str,
) -> Result<(), String> {
    let pool = pool()?;
    sqlx::query(
        "INSERT INTO document (id, patient_id, nom_fichier, chemin_stockage, type, \"ocrTexte\", tsv) \
         VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('french', $6))",
    )
    .bind(id)
    .bind(patient_id)
    .bind(nom_fichier)
    .bind(chemin)
    .bind(type_doc)
    .bind(ocr_texte)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn generer_courrier(req: &crate::commands::courriers::CourrierRequest) -> Result<crate::commands::courriers::CourrierGenere, String> {
    // Le contexte patient est chargé depuis la base, puis le module IA
    // (Mistral API ou Ollama local) génère le brouillon de courrier.
    let pool = pool()?;
    let patient: (String, String, String) = sqlx::query_as(
        "SELECT id, nom, prenoms FROM patient WHERE id = $1",
    )
    .bind(&req.patient_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let contenu = crate::ia::generer(&patient.1, &patient.2, &req.gabarit, &req.notes).await?;
    Ok(crate::commands::courriers::CourrierGenere { contenu })
}
