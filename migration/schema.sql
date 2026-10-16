
CREATE TYPE "Role" AS ENUM ('MEDECIN', 'SECRETAIRE', 'ADMIN');
CREATE TYPE "DocType" AS ENUM ('COURRIER', 'COMPTE_RENDU', 'ORDONNANCE', 'RESULTAT_EXAMEN', 'IMAGERIE', '********', 'FACTURE', 'AUTRE');
CREATE TABLE "Praticien" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "rpps" TEXT UNIQUE,
    "adeli" TEXT,
    "specialite" TEXT,
    "roles" "Role"[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "nirChiffre" TEXT,
    "sexe" TEXT,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "carteVitale" JSONB,
    "medecinTraitant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT REFERENCES "Patient"("id") ON DELETE SET NULL,
    "praticienId" TEXT,
    "motif" TEXT,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Consultation_patientId_date_idx" ON "Consultation"("patientId", "date");
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT REFERENCES "Patient"("id") ON DELETE SET NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "type" "DocType" NOT NULL DEFAULT 'AUTRE',
    "ocrTexte" TEXT,
    "tsv" tsvector,
    "nbPages" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "motsCles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);
CREATE INDEX "Document_patientId_idx" ON "Document"("patientId");
CREATE INDEX "Document_type_idx" ON "Document"("type");
CREATE TABLE "GabaritCourrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "libelle" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "type" "DocType" NOT NULL DEFAULT 'COURRIER'
);
CREATE TABLE "Courrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT REFERENCES "Patient"("id") ON DELETE SET NULL,
    "gabaritId" TEXT REFERENCES "GabaritCourrier"("id"),
    "sujet" TEXT,
    "contenu" TEXT NOT NULL,
    "aiGenere" BOOLEAN NOT NULL DEFAULT false,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validePar" TEXT
);
CREATE INDEX "Courrier_patientId_date_idx" ON "Courrier"("patientId", "date");
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cibleType" TEXT,
    "cibleId" TEXT,
    "detail" JSONB
);
-- Données de départ : gabarits de courriers
INSERT INTO "GabaritCourrier" ("id", "code", "libelle", "contenu") VALUES
    (gen_random_uuid()::text, 'adressage', 'Adressement spécialiste',
     'Docteur,\n\nJe vous adresse Madame/Monsieur [Nom] pour [motif d''adressage].\n\n[Examen clinique et antécédents pertinents]\n\nJe vous remercie de bien vouloir prendre en charge ce/tte patient(e) et reste à votre disposition pour tout complément d''information.\n\nVeuillez agréer, Docteur, l''expression de mes sentiments les meilleurs.'),
    (gen_random_uuid()::text, 'compte_rendu', 'Compte rendu de consultation',
     'Compte rendu de consultation du [date].\n\nMotif : [motif]\n\nHistorique :\n[antécédents]\n\nExamen clinique :\n[examen]\n\nConclusion :\n[conclusion]\n\nConduite à tenir :\n[traitement et suivi]'),
    (gen_random_uuid()::text, 'certificat', 'Certificat médical',
     'Je soussigné(e), Docteur [Nom du praticien], certifie avoir examiné ce jour Madame/Monsieur [Nom].\n\n[Observations]\n\nCertificat établi à la demande de l''intéressé(e) et remis en main propre pour faire valoir ce que de droit.');
