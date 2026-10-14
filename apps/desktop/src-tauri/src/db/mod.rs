use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::OnceLock;

static POOL: OnceLock<PgPool> = OnceLock::new();

pub async fn init(database_url: &str) -> Result<(), sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    // Autofix : colonnes des évolutions récentes du schéma que
    // `prisma db push` peut manquer. Idempotent (IF NOT EXISTS).
    let _ = sqlx::query(
        "ALTER TABLE \"Praticien\" ADD COLUMN IF NOT EXISTS telephone TEXT",
    )
    .execute(&pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE \"Praticien\" ADD COLUMN IF NOT EXISTS email TEXT",
    )
    .execute(&pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE \"Document\" ADD COLUMN IF NOT EXISTS \"aTrier\" BOOLEAN NOT NULL DEFAULT false",
    )
    .execute(&pool)
    .await;
    // Tables des évolutions récentes (créées si absentes).
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS \"Correspondant\" (id TEXT PRIMARY KEY, nom TEXT NOT NULL, specialite TEXT, adresse TEXT, email TEXT, telephone TEXT, \"createdAt\" TIMESTAMP NOT NULL DEFAULT now())",
    )
    .execute(&pool)
    .await;
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS \"ConstanteBio\" (id TEXT PRIMARY KEY, \"patientId\" TEXT NOT NULL REFERENCES \"Patient\"(id) ON DELETE CASCADE, type TEXT NOT NULL, valeur TEXT NOT NULL, unite TEXT, date TIMESTAMP NOT NULL DEFAULT now())",
    )
    .execute(&pool)
    .await;

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
         \"cabinetNom\" as cabinet_nom, \"cabinetAdresse\" as cabinet_adresse, telephone, email \
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

pub async fn supprimer_rdv(id: &str) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    sqlx::query("DELETE FROM \"RendezVous\" WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn modifier_rdv(
    id: &str,
    debut: chrono::DateTime<chrono::Utc>,
    duree_min: i32,
    motif: &Option<String>,
) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    // Conflit vérifié en excluant le RDV lui-même.
    let conflit: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM \"RendezVous\" \
         WHERE id <> $4 AND debut::date = $1::date AND statut <> 'ANNULE' \
         AND ($2::timestamptz, $2::timestamptz + make_interval(mins => $3)) \
         OVERLAPS (debut, debut + make_interval(mins => \"dureeMin\"))",
    )
    .bind(debut)
    .bind(debut)
    .bind(duree_min)
    .bind(id)
    .fetch_optional(pool)
    .await?;
    if conflit.is_some() {
        return Err(sqlx::Error::Configuration("créneau déjà occupé".into()));
    }
    sqlx::query(
        "UPDATE \"RendezVous\" SET debut = $2, \"dureeMin\" = $3, motif = $4 WHERE id = $1",
    )
    .bind(id)
    .bind(debut)
    .bind(duree_min)
    .bind(motif)
    .execute(pool)
    .await?;
    Ok(())
}


/// Détecte le patient destinataire d'un document à partir de son texte OCR :
/// cherche un patient dont nom ET prénom apparaissent dans le texte.
/// Retourne (patient_id, confiance) ; (None, 0.0) si aucun ne correspond.
pub async fn detecter_patient(texte_ocr: &str) -> Result<(Option<String>, f64), String> {
    let pool = pool().map_err(|e| e.to_string())?;
    let texte = texte_ocr.to_lowercase();
    // Candidats : tous les patients (cabinet < 10k : charge acceptable).
    let patients: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, nom, prenoms FROM \"Patient\"",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for (id, nom, prenoms) in patients {
        let nom_l = nom.to_lowercase();
        let prenoms_l = prenoms.to_lowercase();
        if texte.contains(&nom_l) && !prenoms_l.is_empty() && texte.contains(&prenoms_l) {
            return Ok((Some(id), 0.9));
        }
    }
    Ok((None, 0.0))
}

/// Insertion avec indexation plein texte + flag caddie.
pub async fn insert_document_ocr_intelligent(
    id: &str,
    patient_id: Option<&str>,
    nom_fichier: &str,
    chemin: &str,
    type_doc: &str,
    ocr_texte: &str,
    a_trier: bool,
) -> Result<(), String> {
    let pool = pool().map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO \"Document\" (id, \"patientId\", \"nomFichier\", \"cheminStockage\", type, \"ocrTexte\", tsv, \"aTrier\") \
         VALUES ($1, $2, $3, $4, $5::\"DocType\", $6, to_tsvector('french', $6), $7)",
    )
    .bind(id)
    .bind(patient_id)
    .bind(nom_fichier)
    .bind(chemin)
    .bind(type_doc)
    .bind(ocr_texte)
    .bind(a_trier)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Documents en attente de classement (caddie).
pub async fn list_documents_a_trier() -> Result<Vec<crate::commands::recherche::ResultatDocument>, sqlx::Error> {
    let pool = pool()?;
    sqlx::query_as::<_, crate::commands::recherche::ResultatDocument>(
        "SELECT d.id, d.\"patientId\" as patient_id, p.nom as nom_patient, d.\"nomFichier\" as nom_fichier, d.type::text as type, \
         LEFT(d.\"ocrTexte\", 200) as extrait, d.\"createdAt\" as created_at \
         FROM \"Document\" d LEFT JOIN \"Patient\" p ON p.id = d.\"patientId\" \
         WHERE d.\"aTrier\" = true ORDER BY d.\"createdAt\" DESC LIMIT 100",
    )
    .fetch_all(pool)
    .await
}

/// Nombre de documents à trier (puce de notification).
pub async fn compter_a_trier() -> Result<i64, sqlx::Error> {
    let pool = pool()?;
    let (n,) = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM \"Document\" WHERE \"aTrier\" = true",
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
}

/// Classe un document : rattachement patient (+ type) et sortie du caddie.
pub async fn classer_document(document_id: &str, patient_id: &str, type_doc: Option<&str>) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    match type_doc {
        Some(t) => {
            sqlx::query(
                "UPDATE \"Document\" SET \"patientId\" = $2, type = $3::\"DocType\", \"aTrier\" = false WHERE id = $1",
            )
            .bind(document_id)
            .bind(patient_id)
            .bind(t)
            .execute(pool)
            .await?;
        }
        None => {
            sqlx::query(
                "UPDATE \"Document\" SET \"patientId\" = $2, \"aTrier\" = false WHERE id = $1",
            )
            .bind(document_id)
            .bind(patient_id)
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}


/// Supprime un document de la GED (fichier + ligne en base).
pub async fn supprimer_document(id: &str) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    // Chemin du fichier avant suppression de la ligne.
    let chemin: Option<(String,)> = sqlx::query_as(
        "SELECT \"cheminStockage\" FROM \"Document\" WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    sqlx::query("DELETE FROM \"Document\" WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    if let Some((chemin,)) = chemin {
        let _ = std::fs::remove_file(&chemin);
    }
    Ok(())
}

/// Supprime une consultation (correction des doublons de saisie).
pub async fn supprimer_consultation(id: &str) -> Result<(), sqlx::Error> {
    let pool = pool()?;
    sqlx::query("DELETE FROM \"Consultation\" WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}


/// Chemin de stockage d'un document (pour ouverture dans l'app native).
pub async fn chemin_document(id: &str) -> Result<String, sqlx::Error> {
    let pool = pool()?;
    let (chemin,): (String,) = sqlx::query_as(
        "SELECT \"cheminStockage\" FROM \"Document\" WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(chemin)
}

/// Mise à jour de la fiche praticien (nom, coordonnées, cabinet).
#[tauri::command]
pub async fn maj_praticien(
    id: String,
    nom: String,
    prenoms: String,
    rpps: Option<String>,
    cabinet_nom: Option<String>,
    cabinet_adresse: Option<String>,
    telephone: Option<String>,
    email: Option<String>,
    token: String,
) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    if utilisateur.id != id && utilisateur.role != "ADMIN" {
        return Err("on ne peut modifier que sa propre fiche".into());
    }
    let pool = pool().map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE \"Praticien\" SET nom = $2, prenoms = $3, rpps = $4, \"cabinetNom\" = $5, \"cabinetAdresse\" = $6, telephone = $7, email = $8 WHERE id = $1",
    )
    .bind(&id)
    .bind(&nom)
    .bind(&prenoms)
    .bind(rpps)
    .bind(cabinet_nom)
    .bind(cabinet_adresse)
    .bind(telephone)
    .bind(email)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}


/// Contexte médical du patient pour l'IA : allergies + traitements actifs.
pub async fn contexte_patient_ia(patient_id: &str) -> Result<(Vec<String>, Vec<String>), String> {
    let pool = pool().map_err(|e| e.to_string())?;
    let allergies: Vec<(String,)> = sqlx::query_as(
        "SELECT substance FROM \"Allergie\" WHERE \"patientId\" = $1",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let traitements: Vec<(String,)> = sqlx::query_as(
        "SELECT medicament FROM \"Traitement\" WHERE \"patientId\" = $1 AND actif = true",
    )
    .bind(patient_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok((
        allergies.into_iter().map(|a| a.0).collect(),
        traitements.into_iter().map(|t| t.0).collect(),
    ))
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


/// Extrait la ville d'une adresse : dernier segment non vide, en retirant
/// le code postal s'il est collé (« 75000 Paris » → « Paris »).
fn extraire_ville(adresse: Option<&str>) -> Option<String> {
    let adr = adresse?.trim();
    let dernier = adr.rsplit(',').next()?.trim();
    let ville = dernier
        .split_whitespace()
        .skip_while(|m| m.chars().all(|c| c.is_ascii_digit()))
        .collect::<Vec<_>>()
        .join(" ");
    if ville.is_empty() { None } else { Some(ville) }
}
pub async fn generer_courrier(req: &crate::commands::courriers::CourrierRequest) -> Result<crate::commands::courriers::CourrierGenere, String> {
    // Contexte complet : patient (avec âge), praticien connecté (coordonnées).
    let pool = pool().map_err(|e| e.to_string())?;
    // PostgreSQL calcule l'âge directement (EXTRACT de date_diff).
    let patient: (String, String, Option<i32>) = sqlx::query_as(
        "SELECT nom, prenoms, DATE_PART('year', AGE(\"dateNaissance\"))::int FROM \"Patient\" WHERE id = $1",
    )
    .bind(&req.patient_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let age = patient.2;
    // La session garde un snapshot antérieur à la mise à jour de la fiche :
    // on recharge le praticien frais depuis la base.
    let session = crate::auth::valider_session(&req.token)
        .ok_or("session expirée")?;
    let praticien = charger_utilisateur(&session.identifiant).await
        .unwrap_or(session);
    let contenu = crate::ia::generer(&crate::ia::ContexteCourrier {
        nom_patient: patient.0.clone(),
        prenoms_patient: patient.1.clone(),
        age,
        nom_praticien: format!("Dr {} {}", praticien.prenoms, praticien.nom),
        cabinet: praticien.cabinet_nom.clone(),
        adresse_cabinet: praticien.cabinet_adresse.clone(),
        telephone_praticien: praticien.telephone.clone(),
        email_praticien: praticien.email.clone(),
        ville: extraire_ville(praticien.cabinet_adresse.as_deref()),
        date_jour: chrono::Local::now().format("%d/%m/%Y").to_string(),
        destinataire: req.destinataire.clone(),
        gabarit: req.gabarit.clone(),
        notes: req.notes.clone(),
    })
    .await?;
    Ok(crate::commands::courriers::CourrierGenere { contenu })
}
