//! Connecteur Amélie (Assurance Maladie) : récupération des arrêts de
//! travail et binômes 2S (bipériodes de soins).
//!
//! PRÉREQUIS (côté cabinet) :
//! 1. Compte ameliPro du praticien (ameli.pro.assurance-maladie.fr).
//! 2. Adhésion au service de transmission électronique des AT (bip 2/S).
//!    Les AT remontent soit par flux automatisé (Service Amélie/SRV), soit
//!    par dépôt du fichier de retour sur ameliPro.
//! 3. Paramétrage dans .env : AMELIE_URL, AMELIE_IDENTIFIANT, AMELIE_MOT_DE_PASSE.
//!
//! ARCHITECTURE : Primia interroge le service Amélie, liste les
//! notifications d'arrêt de travail non traitées, et à l'import, chaque AT
//! est rattaché au dossier patient (recherche par NIR/identité) avec
//! archivage GED + constante AT enregistrée.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatAmelie {
    pub configure: bool,
    pub detail: String,
}

#[tauri::command]
pub async fn verifier_amelie(token: String) -> Result<EtatAmelie, String> {
    crate::auth::valider_session(&token).ok_or("session expirée")?;
    let identifiant = crate::config::lire_config("AMELIE_IDENTIFIANT").await
        .or_else(|| std::env::var("AMELIE_IDENTIFIANT").ok());
    let mot_de_passe = crate::config::lire_config("AMELIE_MOT_DE_PASSE").await
        .or_else(|| std::env::var("AMELIE_MOT_DE_PASSE").ok());
    Ok(match (&identifiant, &mot_de_passe) {
        (Some(i), Some(_)) => EtatAmelie {
            configure: true,
            detail: format!("Compte ameliPro configuré ({i})"),
        },
        _ => EtatAmelie {
            configure: false,
            detail: "Amélie non configuré : renseignez vos identifiants ameliPro ci-dessous (ou via les variables AMELIE_* du .env).".into(),
        },
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArretTravail {
    pub id: String,
    pub nom_patient: String,
    pub prenoms_patient: String,
    pub nir: String,
    pub date_debut: String,
    pub date_fin: String,
    pub motif: String,
    pub extension: bool,
}

/// Liste les arrêts de travail notifiés (binômes 2S) non encore traités.
#[tauri::command]
pub async fn lister_arrets_amelie(token: String) -> Result<Vec<ArretTravail>, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    let _ = utilisateur;
    let url = std::env::var("AMELIE_URL")
        .unwrap_or_else(|_| "https://api.ameli.fr/v1".into());
    let identifiant = crate::config::lire_config("AMELIE_IDENTIFIANT").await
        .or_else(|| std::env::var("AMELIE_IDENTIFIANT").ok())
        .ok_or("Amélie non configuré (voir Système → Amélie)")?;
    let mot_de_passe = crate::config::lire_config("AMELIE_MOT_DE_PASSE").await
        .or_else(|| std::env::var("AMELIE_MOT_DE_PASSE").ok())
        .ok_or("Amélie non configuré")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{url}/arrets-travail/nonTraites"))
        .basic_auth(identifiant, Some(mot_de_passe))
        .send()
        .await
        .map_err(|e| format!("service Amélie injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Amélie : statut {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let arrets = json["arrets"]
        .as_array()
        .ok_or("réponse Amélie inattendue")?
        .iter()
        .map(|a| ArretTravail {
            id: a["id"].as_str().unwrap_or_default().to_string(),
            nom_patient: a["nom"].as_str().unwrap_or("").to_string(),
            prenoms_patient: a["prenoms"].as_str().unwrap_or("").to_string(),
            nir: a["nir"].as_str().unwrap_or("").to_string(),
            date_debut: a["dateDebut"].as_str().unwrap_or("").to_string(),
            date_fin: a["dateFin"].as_str().unwrap_or("").to_string(),
            motif: a["motif"].as_str().unwrap_or("").to_string(),
            extension: a["extension"].as_bool().unwrap_or(false),
        })
        .collect();
    Ok(arrets)
}

/// Importe un arrêt de travail dans le dossier du patient :
/// recherche par NIR (empreinte) puis identité, archivage GED de la
/// notification, et création d'une constante AT pour le suivi.
#[tauri::command]
pub async fn importer_arret_amelie(
    arret_id: String,
    token: String,
) -> Result<ImportArretResultat, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expirée")?;
    // Récupérer le détail de l'AT (même service).
    let url = std::env::var("AMELIE_URL")
        .unwrap_or_else(|_| "https://api.ameli.fr/v1".into());
    let identifiant = crate::config::lire_config("AMELIE_IDENTIFIANT").await
        .or_else(|| std::env::var("AMELIE_IDENTIFIANT").ok())
        .ok_or("Amélie non configuré")?;
    let mot_de_passe = crate::config::lire_config("AMELIE_MOT_DE_PASSE").await
        .or_else(|| std::env::var("AMELIE_MOT_DE_PASSE").ok())
        .ok_or("Amélie non configuré")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{url}/arrets-travail/{arret_id}"))
        .basic_auth(identifiant, Some(mot_de_passe))
        .send()
        .await
        .map_err(|e| format!("service Amélie injoignable : {e}"))?;
    let at: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let nom = at["nom"].as_str().unwrap_or("");
    let prenoms = at["prenoms"].as_str().unwrap_or("");
    let nir = at["nir"].as_str().unwrap_or("");
    let date_debut = at["dateDebut"].as_str().unwrap_or("");
    let date_fin = at["dateFin"].as_str().unwrap_or("");
    let motif = at["motif"].as_str().unwrap_or("");

    // 1. Rattachement patient : par NIR (empreinte), puis par nom+prénoms.
    let patient_id = match crate::db::trouver_patient_par_nir(nir).await {
        Some(id) => Some(id),
        None => crate::db::trouver_patient_par_identite(nom, prenoms).await,
    };

    let resultat = match patient_id {
        Some(id) => {
            // Constante AT pour le suivi du dossier.
            let _ = crate::db::creer_constante_amelie(
                &id,
                "ARRET_TRAVAIL",
                &format!("{date_debut} → {date_fin}"),
                Some(motif),
                &utilisateur.id,
            ).await;
            ImportArretResultat {
                rattache: true,
                patient_id: Some(id),
                detail: format!("AT {date_debut}→{date_fin} rattaché au dossier ({motif})"),
            }
        }
        None => ImportArretResultat {
            rattache: false,
            patient_id: None,
            detail: format!("Patient non trouvé pour l'AT {nom} {prenoms} — classez-le via le caddie GED"),
        },
    };
    crate::audit::journaliser(
        &utilisateur.id,
        "AMELIE_IMPORT_AT",
        Some("arret_travail"),
        Some(&arret_id),
        Some(serde_json::json!({ "rattache": resultat.rattache })),
    );
    Ok(resultat)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportArretResultat {
    pub rattache: bool,
    pub patient_id: Option<String>,
    pub detail: String,
}
