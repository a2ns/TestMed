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

// ---------- Patients ----------

pub async fn query_patients(recherche: &str) -> Result<Vec<crate::commands::patients::Patient>, String> {
    let pool = pool()?;
    let rows = sqlx::query_as::<_, crate::commands::patients::Patient>(
        "SELECT id, nom, prenoms FROM "Patient" WHERE nom ILIKE $1 OR prenoms ILIKE $1 ORDER BY nom LIMIT 50",
    )
    .bind(format!("%{recherche}%"))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub async fn creer_patient(req: &crate::commands::patients::PatientNouveau) -> Result<crate::commands::patients::Patient, String> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query_as::<_, crate::commands::patients::Patient>(
        "INSERT INTO "Patient" (id, nom, prenoms, \"dateNaissance\", sexe, telephone, email, \"medecinTraitant\")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, nom, prenoms",
    )
    .bind(&id)
    .bind(&req.nom)
    .bind(&req.prenoms)
    .bind(
        req.date_naissance
            .as_deref()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()),
    )
    .bind(&req.sexe)
    .bind(&req.telephone)
    .bind(&req.email)
    .bind(&req.medecin_traitant)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn contexte_patient(patient_id: &str) -> Result<crate::ia::ContextePatient, String> {
    let pool = pool()?;
    let p: (String, String, Option<chrono::NaiveDate>, Option<String>, Option<String>) =
        sqlx::query_as(
            "SELECT nom, prenoms, \"dateNaissance\", sexe, \"medecinTraitant\" FROM "Patient" WHERE id = $1",
        )
        .bind(patient_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let consultations: Vec<(chrono::NaiveDateTime, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT date, motif, notes FROM "Consultation" WHERE \"patientId\" = $1 ORDER BY date DESC LIMIT 5",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(crate::ia::ContextePatient {
        nom: p.0,
        prenoms: p.1,
        date_naissance: p.2.map(|d| d.format("%d/%m/%Y").to_string()),
        sexe: p.3,
        medecin_traitant: p.4,
        dernieres_consultations: consultations
            .into_iter()
            .map(|c| crate::ia::ConsultationResume {
                date: c.0.format("%d/%m/%Y").to_string(),
                motif: c.1,
                notes: c.2,
            })
            .collect(),
    })
}

// ---------- Documents (GED) ----------

pub async fn insert_document(doc: &crate::commands::documents::DocumentImport) -> Result<String, String> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO "Document" (id, \"patientId\", \"nomFichier\", \"cheminStockage\", type) VALUES ($1, $2, $3, $4, $5)")
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

pub async fn list_documents(patient_id: Option<&str>) -> Result<Vec<crate::commands::documents::DocumentRow>, String> {
    let pool = pool()?;
    let rows = sqlx::query_as::<_, crate::commands::documents::DocumentRow>(
        "SELECT id, \"patientId\", \"nomFichier\", type, \"createdAt\" FROM "Document"
         WHERE ($1::text IS NULL OR \"patientId\" = $1) ORDER BY \"createdAt\" DESC LIMIT 200",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ---------- Courriers ----------

pub async fn enregistrer_courrier(req: &crate::commands::courriers::CourrierSauvegarde) -> Result<crate::commands::courriers::CourrierRow, String> {
    let pool = pool()?;
    let row = sqlx::query_as::<_, crate::commands::courriers::CourrierRow>(
        "INSERT INTO "Courrier" (id, \"patientId\", sujet, contenu, \"aiGenere\", statut, date)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING id, \"patientId\", sujet, contenu, \"aiGenere\", statut, date",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&req.patient_id)
    .bind(&req.sujet)
    .bind(&req.contenu)
    .bind(req.ai_genere)
    .bind(if req.valide { "VALIDE" } else { "BROUILLON" })
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(row)
}

pub async fn list_courriers(patient_id: Option<&str>) -> Result<Vec<crate::commands::courriers::CourrierRow>, String> {
    let pool = pool()?;
    let rows = sqlx::query_as::<_, crate::commands::courriers::CourrierRow>(
        "SELECT id, \"patientId\", sujet, contenu, \"aiGenere\", statut, date FROM "Courrier"
         WHERE ($1::text IS NULL OR \"patientId\" = $1) ORDER BY date DESC LIMIT 200",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub async fn valider_courrier(id: &str) -> Result<(), String> {
    let pool = pool()?;
    sqlx::query("UPDATE courrier SET statut = 'VALIDE' WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Réconciliation des fiches orphelines ----------

pub async fn fiches_orphelines()
-> Result<Vec<crate::commands::reconciliation::FicheOrpheline>, String> {
    let pool = pool()?;
    let consultations: Vec<crate::commands::reconciliation::FicheOrpheline> = sqlx::query_as(
        "SELECT id, 'Consultation' AS kind, CAST(date AS VARCHAR(10)) AS date,
                motif AS sujet, LEFT(COALESCE(notes, ''), 120) AS extrait
         FROM "Consultation" WHERE "patientId" IS NULL ORDER BY date DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let courriers: Vec<crate::commands::reconciliation::FicheOrpheline> = sqlx::query_as(
        "SELECT id, 'Courrier' AS kind, CAST(date AS VARCHAR(10)) AS date,
                sujet, LEFT(contenu, 120) AS extrait
         FROM "Courrier" WHERE "patientId" IS NULL ORDER BY date DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut fiches = consultations;
    fiches.extend(courriers);
    Ok(fiches)
}

pub async fn occurrences_patients()
-> Result<Vec<crate::commands::reconciliation::OccurrencePatient>, String> {
    let pool = pool()?;
    let rows = sqlx::query_as::<_, crate::commands::reconciliation::OccurrencePatient>(
        "SELECT p.id, p.nom, p.prenoms, COUNT(c.id) AS occurrences
         FROM "Patient" p
         JOIN "Consultation" c ON c."patientId" = p.id
         GROUP BY p.id, p.nom, p.prenoms
         ORDER BY COUNT(c.id) DESC LIMIT 100",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub async fn lier_fiche(kind: &str, fiche_id: &str, patient_id: &str) -> Result<(), String> {
    let pool = pool()?;
    let table = match kind {
        "Consultation" => "Consultation",
        "Courrier" => "Courrier",
        _ => return Err(format!("type de fiche inconnu : {kind}")),
    };
    let requete = format!(
        "UPDATE \"{table}\" SET \"patientId\" = $1 WHERE id = $2 AND \"patientId\" IS NULL"
    );
    let res = sqlx::query(&requete)
        .bind(patient_id)
        .bind(fiche_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("fiche introuvable ou déjà rattachée".to_string());
    }
    Ok(())
}

// ---------- Statistiques tableau de bord ----------

pub async fn statistiques() -> Result<crate::commands::dashboard::Stats, String> {
    let pool = pool()?;
    let (patients_total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM "Patient"")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (documents_total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM "Document"")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (courriers_brouillons,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM "Courrier" WHERE statut = 'BROUILLON'")
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (courriers_valides,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM "Courrier" WHERE statut = 'VALIDE'")
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (consultations_total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM \"Consultation\"")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (non_lies,): (i64,) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM \"Consultation\" WHERE \"patientId\" IS NULL) + (SELECT COUNT(*) FROM \"Courrier\" WHERE \"patientId\" IS NULL)",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(crate::commands::dashboard::Stats {
        patients_total,
        documents_total,
        consultations_total,
        courriers_brouillons,
        courriers_valides,
        non_lies,
    })
}
