#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
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
            commands::documents::import_document,
            commands::courriers::generer_courrier_ia,
            commands::scan::lister_scanners,
            commands::scan::scan_masse,
            impression::imprimer_courrier,
            auth::connexion,
            auth::utilisateur_courant,
            auth::deconnexion,
            auth::creer_compte,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de MagicMed");
}
