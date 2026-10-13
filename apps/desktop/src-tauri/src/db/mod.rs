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

pub fn hash_mot_de_passe(identifiant: &str) -> Result<String, String> {
    let pool = pool()?;
    let hash: (String,) = sqlx::query_as(
        "SELECT mot_de_passe FROM praticien WHERE identifiant = $1 AND actif = true",
    )
    .bind(identifiant)
    .fetch_one(pool)
    .map_err(|e| e.to_string())?;
    Ok(hash.0)
}

pub fn charger_utilisateur(identifiant: &str) -> Result<crate::auth::Utilisateur, String> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::auth::Utilisateur>(
        "SELECT id, identifiant, nom, prenoms, roles[1] as role, rpps, \
         cabinet_nom, cabinet_adresse \
         FROM praticien WHERE identifiant = $1 AND actif = true",
    )
    .bind(identifiant)
    .fetch_one(pool)
    .map_err(|e| e.to_string())
}

pub fn creer_utilisateur(identifiant: &str, hash: &str, role: &str) -> Result<(), String> {
    let pool = pool()?;
    sqlx::query(
        "INSERT INTO praticien (id, identifiant, mot_de_passe, nom, prenoms, roles) \
         VALUES ($1, $2, $3, '', '', ARRAY[$4]::role[])",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(identifiant)
    .bind(hash)
    .bind(role)
    .execute(pool)
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_patient(id: &str) -> Result<crate::commands::patients::PatientDetail, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::PatientDetail>(
        "SELECT id, nom, prenoms, \"dateNaissance\"::date as date_naissance, sexe, adresse, telephone, email, medecin_traitant \
         FROM patient WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
}

pub async fn creer_patient(p: &crate::commands::patients::NouveauPatient) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    let dn: Option<chrono::NaiveDate> = match &p.date_naissance {
        Some(s) if !s.trim().is_empty() => Some(s.parse::<chrono::NaiveDate>().map_err(|_| sqlx::Error::Configuration("date invalide (AAAA-MM-JJ)".into()))?),
        _ => None,
    };
    sqlx::query(
        "INSERT INTO patient (id, nom, prenoms, \"dateNaissance\", sexe, adresse, telephone, email, medecin_traitant) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&id)
    .bind(&p.nom)
    .bind(&p.prenoms)
    .bind(dn)
    .bind(&p.sexe)
    .bind(&p.adresse)
    .bind(&p.telephone)
    .bind(&p.email)
    .bind(&p.medecin_traitant)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn list_consultations(patient_id: &str) -> Result<Vec<crate::commands::patients::Consultation>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::Consultation>(
        "SELECT id, patient_id, motif, notes, date FROM consultation WHERE patient_id = $1 ORDER BY date DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_consultation(c: &crate::commands::patients::NouvelleConsultation) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO consultation (id, patient_id, motif, notes) VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(&c.patient_id)
    .bind(&c.motif)
    .bind(&c.notes)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn list_antecedents(patient_id: &str) -> Result<Vec<crate::commands::patients::Antecedent>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::Antecedent>(
        "SELECT id, categorie, libelle, annee, notes FROM antecedent WHERE patient_id = $1 ORDER BY categorie, annee",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_antecedent(a: &crate::commands::patients::NouvelAntecedent) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO antecedent (id, patient_id, categorie, libelle, annee, notes) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&id)
    .bind(&a.patient_id)
    .bind(&a.categorie)
    .bind(&a.libelle)
    .bind(a.annee)
    .bind(&a.notes)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn list_traitements(patient_id: &str) -> Result<Vec<crate::commands::patients::Traitement>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::Traitement>(
        "SELECT id, medicament, posologie, duree, actif FROM traitement WHERE patient_id = $1 ORDER BY actif DESC, date_debut DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_traitement(t: &crate::commands::patients::NouveauTraitement) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO traitement (id, patient_id, medicament, posologie, duree) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&id)
    .bind(&t.patient_id)
    .bind(&t.medicament)
    .bind(&t.posologie)
    .bind(&t.duree)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn list_allergies(patient_id: &str) -> Result<Vec<crate::commands::patients::Allergie>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::Allergie>(
        "SELECT id, substance, gravite, reactions FROM allergie WHERE patient_id = $1 ORDER BY gravite DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_allergie(a: &crate::commands::patients::NouvelleAllergie) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO allergie (id, patient_id, substance, gravite, reactions) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&id)
    .bind(&a.patient_id)
    .bind(&a.substance)
    .bind(&a.gravite)
    .bind(&a.reactions)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn creer_ordonnance(o: &crate::commands::ordonnances::NouvelleOrdonnance) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO ordonnance (id, patient_id, type, securisee, date) VALUES ($1, $2, $3, $4, now())",
    )
    .bind(&id)
    .bind(&o.patient_id)
    .bind(&o.r#type)
    .bind(o.securisee)
    .execute(&mut *tx)
    .await?;
    for (i, l) in o.lignes.iter().enumerate() {
        sqlx::query(
            "INSERT INTO prescription (id, ordonnance_id, zone, medicament, cip, posologie, duree, dureeJours, substitution, renouvellements, position) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&id)
        .bind(&l.zone)
        .bind(&l.medicament)
        .bind(&l.cip)
        .bind(&l.posologie)
        .bind(&l.duree)
        .bind(l.duree_jours)
        .bind(l.substitution)
        .bind(l.renouvellements)
        .bind(i as i32)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(id)
}

pub async fn list_ordonnances(patient_id: &str) -> Result<Vec<crate::commands::ordonnances::Ordonnance>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::ordonnances::Ordonnance>(
        "SELECT id, patient_id, type, securisee, date FROM ordonnance WHERE patient_id = $1 ORDER BY date DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn get_prescriptions(ordonnance_id: &str) -> Result<Vec<crate::commands::ordonnances::PrescriptionLigne>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::ordonnances::PrescriptionLigne>(
        "SELECT id, zone, medicament, cip, posologie, duree, \"dureeJours\" as duree_jours, substitution, renouvellements, position \
         FROM prescription WHERE ordonnance_id = $1 ORDER BY position",
    )
    .bind(ordonnance_id)
    .fetch_all(pool)
    .await
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
