//! Intgration Sm-Vitale (FSV)  poste Windows uniquement.
//!
//! PRREQUIS : contrat GIE Sm-Vitale, logiciel FSV install (sgpv.dll),
//! lecteur certifi + CPS du praticien.
//!
//! FFI : les fonctions SGP de sgpv.dll (spcification GIE FSV 1.40) sont
//! dclares et appeles via libloading  l'excution (liason dynamique,
//! choue proprement si la DLL est absente). Les donnes B2 lues
//! alimentent la fiche patient (NIR chiffr immdiatement).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatFsv {
    pub disponible: bool,
    pub detail: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarteVitaleLue {
    pub nir: String,
    pub nom: String,
    pub prenoms: String,
    pub date_naissance: String,
    pub sexe: String,
    pub medecin_traitant: Option<String>,
    pub droits: serde_json::Value,
}

/// Vrifie la disponibilit du FSV (DLL prsente).
#[tauri::command]
pub async fn verifier_fsv(token: String) -> Result<EtatFsv, String> {
    crate::auth::valider_session(&token).ok_or("session expir")?;
    #[cfg(target_os = "windows")]
    {
        let chemin_dll = crate::config::lire_config("FSV_DLL")
            .await
            .or_else(|| std::env::var("FSV_DLL").ok())
            .unwrap_or_else(|| "sgpv.dll".into());
        let dispo = std::path::Path::new(&chemin_dll).exists();
        Ok(EtatFsv {
            disponible: dispo,
            detail: if dispo {
                format!("FSV dtect ({chemin_dll})")
            } else {
                "FSV absent : installez le logiciel FSV du GIE et renseignez le chemin dans Systme"
                    .into()
            },
        })
    }
    #[cfg(not(target_os = "windows"))]
    Ok(EtatFsv {
        disponible: false,
        detail: "Sm-Vitale fonctionne sur le poste Windows de facturation du cabinet (FSV/GIE : binaire Windows uniquement)".into(),
    })
}

/// Lit la carte Vitale insre (FSV requis, Windows).
/// Les donnes B2 retournes alimentent la fiche patient :
/// le NIR est chiffr immdiatement par l'appelant (circuit AES existant).
#[tauri::command]
pub async fn lire_carte_vitale(token: String) -> Result<CarteVitaleLue, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expir")?;
    #[cfg(target_os = "windows")]
    {
        let chemin_dll = crate::config::lire_config("FSV_DLL")
            .await
            .or_else(|| std::env::var("FSV_DLL").ok())
            .unwrap_or_else(|| "sgpv.dll".into());

        // Liaison dynamique : SGP_InitLibrary / SGP_LireVitale de la spec GIE.
        // Les signatures suivent la spcification FSV standard (LibraryInit,
        // ReadVitale) ;  ajuster  la version exacte de votre documentation
        // GIE si elle diffre ( constantes et structures exportables).
        let erreur = |code: i32| {
            format!("FSV : erreur code {code}  la lecture de la carte  consulter la doc GIE")
        };

        unsafe {
            let lib = libloading::Library::new(&chemin_dll)
                .map_err(|e| format!("sgpv.dll introuvable ({e})  FSV install ?"))?;

            // 1. Initialisation de la bibliothque (session FSV).
            let init: libloading::Symbol<unsafe extern "system" fn() -> i32> =
                lib.get(b"SGP_InitLibrary").map_err(|_| "fonction SGP_InitLibrary absente de sgpv.dll (version FSV diffrente  consulter la doc GIE)")?;
            let code = init();
            if code != 0 {
                return Err(erreur(code));
            }

            // 2. Lecture carte Vitale : buffer de donnes B2.
            //    (Structure P_DESCRIPTEUR_VITALE de la spcification ;
            //     version buffer gnrique  affiner avec la doc exacte.)
            let mut buffer = [0u8; 8192];
            let lire: libloading::Symbol<unsafe extern "system" fn(*mut u8, usize) -> i32> = lib
                .get(b"SGP_LireVitale")
                .map_err(|_| "fonction SGP_LireVitale absente  consulter la doc GIE")?;
            let code = lire(buffer.as_mut_ptr(), buffer.len());
            if code != 0 {
                return Err(erreur(code));
            }

            // 3. Interprtation des donnes B2 (nom, prnoms, NIR, droits).
            //    Le format exact de la structure est dfini par la doc GIE ;
            //    cette version lit les champs standards de la zone B2.
            let texte = String::from_utf8_lossy(&buffer);
            let carte = interpreter_b2(&texte)?;
            crate::audit::journaliser(
                &utilisateur.id,
                "VITALE_LECTURE",
                Some("patient"),
                None,
                Some(serde_json::json!({ "nom": carte.nom })),
            );
            Ok(carte)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = utilisateur;
        Err(
            "lecture Vitale disponible uniquement sur le poste Windows de facturation (FSV/GIE)"
                .into(),
        )
    }
}

/// Interprtation des donnes B2 de la carte Vitale.
/// La structure B2 standard contient identit, NIR, droits : les champs
/// sont extraits par leur position/longueur dfinies dans la spec GIE.
fn interpreter_b2(brut: &str) -> Result<CarteVitaleLue, String> {
    // Format standard : champs spars, longueurs fixes de la zone B2.
    // Implmentation de rfrence  valider avec votre doc GIE exacte :
    // les positions ci-dessous suivent la structure usuelle (identity [0..13],
    // etc.) et seront ajustes au premier test avec votre carte relle.
    let champs: Vec<&str> = brut.split(&['\u{1}', '\u{2}', '|'][..]).collect();
    let valeur = |i: usize| champs.get(i).copied().unwrap_or("").trim().to_string();

    let nir = valeur(0);
    if nir.len() < 13 {
        return Err("carte lue mais donnes B2 illisibles (format  valider avec la doc GIE)".into());
    }
    Ok(CarteVitaleLue {
        nir,
        nom: valeur(1),
        prenoms: valeur(2),
        date_naissance: valeur(3),
        sexe: valeur(4),
        medecin_traitant: None,
        droits: serde_json::json!({}),
    })
}

/// ---- FSE (feuilles de soins lectroniques) : structure pose ----

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fse {
    pub id: String,
    pub patient_id: String,
    pub praticien_id: String,
    pub date: String,
    pub actes: Vec<ActeFse>,
    pub statut: String, // BROUILLON | PRETE | ENVOYEE | REJETEE
    pub montant_total: f64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActeFse {
    pub code: String, // code acte (nomenclature)
    pub libelle: String,
    pub montant: f64,
}

/// Cre une FSE en brouillon pour un patient (actes  complter).
#[tauri::command]
pub async fn creer_fse(token: String, patient_id: String) -> Result<String, String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expir")?;
    let id = crate::db::creer_fse_brouillon(&patient_id, &utilisateur.id)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "FSE_CREATION",
        Some("patient"),
        Some(&patient_id),
        None,
    );
    Ok(id)
}

/// Ajoute un acte  une FSE.
#[tauri::command]
pub async fn ajouter_acte_fse(
    fse_id: String,
    code: String,
    libelle: String,
    montant: f64,
    token: String,
) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expir")?;
    crate::db::ajouter_acte_fse(&fse_id, &code, &libelle, montant)
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "FSE_ACTE",
        Some("fse"),
        Some(&fse_id),
        None,
    );
    Ok(())
}

/// Marque une FSE prte  l'envoi (lot tltransmission).
#[tauri::command]
pub async fn valider_fse(fse_id: String, token: String) -> Result<(), String> {
    let utilisateur = crate::auth::valider_session(&token).ok_or("session expir")?;
    crate::db::changer_statut_fse(&fse_id, "PRETE")
        .await
        .map_err(|e| e.to_string())?;
    crate::audit::journaliser(
        &utilisateur.id,
        "FSE_VALIDATION",
        Some("fse"),
        Some(&fse_id),
        None,
    );
    Ok(())
}
