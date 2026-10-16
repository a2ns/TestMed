#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod ia;

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
            commands::patients::creer_patient,
            commands::documents::import_document,
            commands::documents::list_documents,
            commands::courriers::generer_courrier_ia,
            commands::courriers::reformuler_courrier_ia,
            commands::courriers::relire_courrier_ia,
            commands::courriers::enregistrer_courrier,
            commands::courriers::list_courriers,
            commands::courriers::valider_courrier,
            commands::dashboard::statistiques,
            commands::reconciliation::list_fiches_orphelines,
            commands::reconciliation::list_occurrences_patients,
            commands::reconciliation::lier_fiche,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de MagicMed");
}
