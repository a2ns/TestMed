#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audit;
mod auth;
mod commands;
mod crypto;
mod dmp;
mod fsv;
mod sauvegarde;
mod db;
mod ia;
mod impression;
mod ocr;
mod scan;

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            let url = std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://magicmed:magicmed@localhost:5432/magicmed".into());
            tauri::async_runtime::block_on(db::init(&url))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::patients::list_patients,
            commands::patients::get_patient,
            commands::patients::creer_patient,
            commands::patients::list_consultations,
            commands::patients::creer_consultation,
            commands::patients::list_antecedents,
            commands::patients::creer_antecedent,
            commands::patients::list_traitements,
            commands::patients::creer_traitement,
            commands::patients::list_allergies,
            commands::patients::creer_allergie,
            commands::ordonnances::creer_ordonnance,
            commands::ordonnances::list_ordonnances,
            commands::ordonnances::get_prescriptions,
            commands::agenda::list_rdv_jour,
            commands::agenda::creer_rdv,
            commands::agenda::changer_statut_rdv,
            commands::recherche::recherche_documents,
            commands::recherche::list_documents,
            commands::documents::import_document,
            commands::courriers::generer_courrier_ia,
            commands::scan::lister_scanners,
            commands::scan::scan_masse,
            impression::commande::imprimer_courrier,
            auth::connexion,
            auth::utilisateur_courant,
            auth::deconnexion,
            auth::creer_compte,
            audit::list_audit_log,
            sauvegarde::lancer_sauvegarde,
            sauvegarde::dechiffrer_sauvegarde,
            fsv::verifier_fsv,
            fsv::lire_carte_vitale,
            fsv::creer_fse,
            dmp::verifier_dmp,
            dmp::deposer_dmp,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de MagicMed");
}
