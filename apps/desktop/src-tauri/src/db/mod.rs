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

/// Analyse une date en AAAA-MM-JJ ou JJ/MM/AAAA (validation réelle du calendrier).
pub fn parse_date(s: &str) -> Result<chrono::NaiveDate, sqlx::Error> {
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        if d <= chrono::Local::now().date_naive() {
            return Ok(d);
        }
        return Err(sqlx::Error::Configuration("date de naissance dans le futur".into()));
    }
    let m: Vec<&str> = s.split('/').collect();
    if m.len() == 3 && m[0].len() == 2 && m[1].len() == 2 && m[2].len() == 4 {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%d/%m/%Y") {
            if d <= chrono::Local::now().date_naive() {
                return Ok(d);
            }
            return Err(sqlx::Error::Configuration("date de naissance dans le futur".into()));
        }
    }
    Err(sqlx::Error::Configuration("date invalide : formats attendus AAAA-MM-JJ ou JJ/MM/AAAA".into()))
}

pub fn pool() -> Result<&'static PgPool, sqlx::Error> {
    POOL.get().ok_or_else(|| sqlx::Error::Configuration("base non initialisée".into()))
}

pub async fn hash_mot_de_passe(identifiant: &str) -> Result<String, String> {
    let pool = pool().map_err(|e| e.to_string())?;
    let hash: (String,) = sqlx::query_as(
        "SELECT \"motDePasse\" FROM \"Praticien\" WHERE identifiant = $1 AND actif = true",
    )
    .bind(identifiant)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(hash.0)
}

pub async fn charger_utilisateur(identifiant: &str) -> Result<crate::auth::Utilisateur, String> {
    let pool = pool().map_err(|e| e.to_string())?;
    sqlx::query_as::<_, crate::auth::Utilisateur>(
        "SELECT id, identifiant, nom, prenoms, roles[1]::text as role, rpps, \
         \"cabinetNom\" as cabinet_nom, \"cabinetAdresse\" as cabinet_adresse \
         FROM \"Praticien\" WHERE identifiant = $1 AND actif = true",
    )
    .bind(identifiant)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn creer_utilisateur(identifiant: &str, hash: &str, role: &str) -> Result<(), String> {
    let pool = pool().map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO \"Praticien\" (id, identifiant, \"motDePasse\", nom, prenoms, roles) \
         VALUES ($1, $2, $3, '', '', ARRAY[$4]::\"Role\"[])",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(identifiant)
    .bind(hash)
    .bind(role)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_patient(id: &str) -> Result<crate::commands::patients::PatientDetail, sqlx::Error> {
    let pool = pool()?;
    let mut p = sqlx::query_as::<_, crate::commands::patients::PatientDetail>(
        "SELECT id, nom, prenoms, \"dateNaissance\"::date as date_naissance, sexe, adresse, telephone, email, \"medecinTraitant\" as medecin_traitant, \"nirChiffre\" as nir \
         FROM \"Patient\" WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    // Le NIR est déchiffré uniquement à la lecture de la fiche.
    if let Some(nir_chiffre) = p.nir.take() {
        p.nir = crate::crypto::dechiffrer(&nir_chiffre).ok();
    }
    Ok(p)
}

pub async fn creer_patient(p: &crate::commands::patients::NouveauPatient) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    let dn: Option<chrono::NaiveDate> = match &p.date_naissance {
        Some(s) if !s.trim().is_empty() => Some(parse_date(s.trim())?),
        _ => None,
    };
    // NIR : jamais stocké en clair. Chiffré AES-256-GCM + empreinte
    // déterministe pour l'unicité/la recherche.
    let (nir_chiffre, nir_empreinte) = match &p.nir {
        Some(n) if !n.trim().is_empty() => {
            let c = crate::crypto::chiffrer(n.trim()).map_err(|e| sqlx::Error::Configuration(e.into()))?;
            let emp = crate::crypto::empreinte(n.trim());
            (Some(c), Some(emp))
        }
        _ => (None, None),
    };
    sqlx::query(
        "INSERT INTO \"Patient\" (id, nom, prenoms, \"dateNaissance\", sexe, adresse, telephone, email, \"medecinTraitant\", \"nirChiffre\", \"nirEmpreinte\", \"updatedAt\") \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())",
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
    .bind(nir_chiffre)
    .bind(nir_empreinte)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn list_consultations(patient_id: &str) -> Result<Vec<crate::commands::patients::Consultation>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::patients::Consultation>(
        "SELECT id, \"patientId\" as patient_id, motif, notes, date FROM \"Consultation\" WHERE \"patientId\" = $1 ORDER BY date DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_consultation(c: &crate::commands::patients::NouvelleConsultation) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"Consultation\" (id, \"patientId\", motif, notes) VALUES ($1, $2, $3, $4)",
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
        "SELECT id, categorie, libelle, annee, notes FROM \"Antecedent\" WHERE \"patientId\" = $1 ORDER BY categorie, annee",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_antecedent(a: &crate::commands::patients::NouvelAntecedent) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"Antecedent\" (id, \"patientId\", categorie, libelle, annee, notes) VALUES ($1, $2, $3, $4, $5, $6)",
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
        "SELECT id, medicament, posologie, duree, actif FROM \"Traitement\" WHERE \"patientId\" = $1 ORDER BY actif DESC, \"dateDebut\" DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_traitement(t: &crate::commands::patients::NouveauTraitement) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"Traitement\" (id, \"patientId\", medicament, posologie, duree) VALUES ($1, $2, $3, $4, $5)",
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
        "SELECT id, substance, gravite, reactions FROM \"Allergie\" WHERE \"patientId\" = $1 ORDER BY gravite DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn creer_allergie(a: &crate::commands::patients::NouvelleAllergie) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"Allergie\" (id, \"patientId\", substance, gravite, reactions) VALUES ($1, $2, $3, $4, $5)",
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
        "INSERT INTO \"Ordonnance\" (id, \"patientId\", type, securisee, date) VALUES ($1, $2, $3::\"OrdoType\", $4, now())",
    )
    .bind(&id)
    .bind(&o.patient_id)
    .bind(&o.r#type)
    .bind(o.securisee)
    .execute(&mut *tx)
    .await?;
    for (i, l) in o.lignes.iter().enumerate() {
        sqlx::query(
            "INSERT INTO \"Prescription\" (id, \"ordonnanceId\", zone, medicament, cip, posologie, duree, \"dureeJours\", substitution, renouvellements, position) \
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
        "SELECT id, \"patientId\" as patient_id, type::text as type, securisee, date FROM \"Ordonnance\" WHERE \"patientId\" = $1 ORDER BY date DESC",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
}

pub async fn get_prescriptions(ordonnance_id: &str) -> Result<Vec<crate::commands::ordonnances::PrescriptionLigne>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::ordonnances::PrescriptionLigne>(
        "SELECT id, zone, medicament, cip, posologie, duree, \"dureeJours\" as duree_jours, substitution, renouvellements, position \
         FROM \"Prescription\" WHERE \"ordonnanceId\" = $1 ORDER BY position",
    )
    .bind(ordonnance_id)
    .fetch_all(pool)
    .await
}

pub async fn insert_audit(
    user_id: &str,
    action: &str,
    cible_type: Option<&str>,
    cible_id: Option<&str>,
    detail: Option<serde_json::Value>,
) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    sqlx::query(
        "INSERT INTO \"AuditLog\" (ts, \"userId\", action, \"cibleType\", \"cibleId\", detail) \
         VALUES (now(), $1, $2, $3, $4, $5)",
    )
    .bind(user_id)
    .bind(action)
    .bind(cible_type)
    .bind(cible_id)
    .bind(detail)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_audit(limite: i64) -> Result<Vec<crate::audit::EntreeAudit>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::audit::EntreeAudit>(
        "SELECT id, ts, \"userId\" as user_id, action, \"cibleType\" as cible_type, \"cibleId\" as cible_id, detail \
         FROM \"AuditLog\" ORDER BY id DESC LIMIT $1",
    )
    .bind(limite)
    .fetch_all(pool)
    .await
}

pub async fn list_rdv_jour(jour: &str) -> Result<Vec<crate::commands::agenda::RendezVous>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::agenda::RendezVous>(
        "SELECT r.id, r.\"patientId\" as patient_id, p.nom as nom_patient, p.prenoms as prenoms_patient, \
         r.debut, r.\"dureeMin\" as duree_min, r.statut, r.motif \
         FROM \"RendezVous\" r JOIN \"Patient\" p ON p.id = r.\"patientId\" \
         WHERE r.debut::date = $1::date AND r.statut <> 'ANNULE' ORDER BY r.debut",
    )
    .bind(jour)
    .fetch_all(pool)
    .await
}

pub async fn creer_rdv(
    patient_id: &str,
    debut: chrono::DateTime<chrono::Utc>,
    duree_min: i32,
    motif: &Option<String>,
    notes: &Option<String>,
) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let conflit: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM \"RendezVous\" \
         WHERE debut::date = $1::date AND statut <> 'ANNULE' \
         AND ($2::timestamptz, $2::timestamptz + make_interval(mins => $3)) \
         OVERLAPS (debut, debut + make_interval(mins => \"dureeMin\"))",
    )
    .bind(debut)
    .bind(debut)
    .bind(duree_min)
    .fetch_optional(pool)
    .await?;
    if conflit.is_some() {
        return Err(sqlx::Error::Configuration("créneau déjà occupé".into()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"RendezVous\" (id, \"patientId\", debut, \"dureeMin\", statut, motif, notes) \
         VALUES ($1, $2, $3, $4, 'PLANIFIE', $5, $6)",
    )
    .bind(&id)
    .bind(patient_id)
    .bind(debut)
    .bind(duree_min)
    .bind(motif)
    .bind(notes)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn changer_statut_rdv(id: &str, statut: &str) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    sqlx::query("UPDATE \"RendezVous\" SET statut = $2 WHERE id = $1")
        .bind(id)
        .bind(statut)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn query_patients(recherche: &str) -> Result<Vec<crate::commands::patients::Patient>, String> {
    let pool = pool().map_err(|e| e.to_string())?;
    let rows = sqlx::query_as::<_, crate::commands::patients::Patient>(
        "SELECT id, nom, prenoms FROM \"Patient\" WHERE nom ILIKE $1 OR prenoms ILIKE $1 ORDER BY nom LIMIT 50",
    )
    .bind(format!("%{recherche}%"))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub async fn insert_document(doc: &crate::commands::documents::DocumentImport) -> Result<String, String> {
    let pool = pool().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"Document\" (id, \"patientId\", \"nomFichier\", \"cheminStockage\", type) VALUES ($1, $2, $3, $4, $5::\"DocType\")")
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
    let pool = pool().map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO \"Document\" (id, \"patientId\", \"nomFichier\", \"cheminStockage\", type, \"ocrTexte\", tsv) \
         VALUES ($1, $2, $3, $4, $5::\"DocType\", $6, to_tsvector('french', $6))",
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
    let pool = pool().map_err(|e| e.to_string())?;
    let patient: (String, String, String) = sqlx::query_as(
        "SELECT id, nom, prenoms FROM \"Patient\" WHERE id = $1",
    )
    .bind(&req.patient_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let contenu = crate::ia::generer(&patient.1, &patient.2, &req.gabarit, &req.notes).await?;
    Ok(crate::commands::courriers::CourrierGenere { contenu })
}
