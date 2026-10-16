-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEDECIN', 'SECRETAIRE', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrdoType" AS ENUM ('SIMPLE', 'BI_ORDONNANCE', 'SECURISEE');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('COURRIER', 'COMPTE_RENDU', 'ORDONNANCE', 'RESULTAT_EXAMEN', 'IMAGERIE', 'CERTIFICAT', 'FACTURE', 'AUTRE');

-- CreateTable
CREATE TABLE "Praticien" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT,
    "motDePasse" TEXT,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "rpps" TEXT,
    "adeli" TEXT,
    "specialite" TEXT,
    "roles" "Role"[],
    "cabinetNom" TEXT,
    "cabinetAdresse" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Praticien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "nirChiffre" TEXT,
    "nirEmpreinte" TEXT,
    "sexe" TEXT,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "carteVitale" JSONB,
    "medecinTraitant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Antecedent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "annee" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Antecedent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traitement" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicament" TEXT NOT NULL,
    "posologie" TEXT NOT NULL,
    "duree" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),

    CONSTRAINT "Traitement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergie" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "gravite" TEXT NOT NULL,
    "reactions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allergie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "praticienId" TEXT,
    "motif" TEXT,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "nomFichier" TEXT NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "type" "DocType" NOT NULL DEFAULT 'AUTRE',
    "ocrTexte" TEXT,
    "tsv" tsvector,
    "scanOrigine" TEXT,
    "aTrier" BOOLEAN NOT NULL DEFAULT false,
    "nbPages" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "motsCles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GabaritCourrier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "type" "DocType" NOT NULL DEFAULT 'COURRIER',

    CONSTRAINT "GabaritCourrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courrier" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "gabaritId" TEXT,
    "sujet" TEXT,
    "contenu" TEXT NOT NULL,
    "aiGenere" BOOLEAN NOT NULL DEFAULT false,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validePar" TEXT,

    CONSTRAINT "Courrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ordonnance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "praticienId" TEXT,
    "type" "OrdoType" NOT NULL DEFAULT 'SIMPLE',
    "securisee" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ordonnance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "ordonnanceId" TEXT NOT NULL,
    "zone" TEXT NOT NULL DEFAULT 'A',
    "medicament" TEXT NOT NULL,
    "cip" TEXT,
    "posologie" TEXT NOT NULL,
    "duree" TEXT,
    "dureeJours" INTEGER,
    "substitution" BOOLEAN NOT NULL DEFAULT false,
    "renouvellements" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RendezVous" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "praticienId" TEXT,
    "debut" TIMESTAMP(3) NOT NULL,
    "dureeMin" INTEGER NOT NULL DEFAULT 20,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIE',
    "motif" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RendezVous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cibleType" TEXT,
    "cibleId" TEXT,
    "detail" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondant" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "specialite" TEXT,
    "adresse" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correspondant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstanteBio" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "unite" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstanteBio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Praticien_identifiant_key" ON "Praticien"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "Praticien_rpps_key" ON "Praticien"("rpps");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nirEmpreinte_key" ON "Patient"("nirEmpreinte");

-- CreateIndex
CREATE INDEX "Antecedent_patientId_idx" ON "Antecedent"("patientId");

-- CreateIndex
CREATE INDEX "Traitement_patientId_idx" ON "Traitement"("patientId");

-- CreateIndex
CREATE INDEX "Allergie_patientId_idx" ON "Allergie"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_date_idx" ON "Consultation"("patientId", "date");

-- CreateIndex
CREATE INDEX "Document_patientId_idx" ON "Document"("patientId");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE UNIQUE INDEX "GabaritCourrier_code_key" ON "GabaritCourrier"("code");

-- CreateIndex
CREATE INDEX "Courrier_patientId_date_idx" ON "Courrier"("patientId", "date");

-- CreateIndex
CREATE INDEX "Ordonnance_patientId_date_idx" ON "Ordonnance"("patientId", "date");

-- CreateIndex
CREATE INDEX "RendezVous_debut_idx" ON "RendezVous"("debut");

-- CreateIndex
CREATE INDEX "RendezVous_patientId_idx" ON "RendezVous"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Correspondant_nom_specialite_key" ON "Correspondant"("nom", "specialite");

-- CreateIndex
CREATE INDEX "ConstanteBio_patientId_date_idx" ON "ConstanteBio"("patientId", "date");

-- AddForeignKey
ALTER TABLE "Antecedent" ADD CONSTRAINT "Antecedent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traitement" ADD CONSTRAINT "Traitement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergie" ADD CONSTRAINT "Allergie_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courrier" ADD CONSTRAINT "Courrier_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courrier" ADD CONSTRAINT "Courrier_gabaritId_fkey" FOREIGN KEY ("gabaritId") REFERENCES "GabaritCourrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ordonnance" ADD CONSTRAINT "Ordonnance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_ordonnanceId_fkey" FOREIGN KEY ("ordonnanceId") REFERENCES "Ordonnance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendezVous" ADD CONSTRAINT "RendezVous_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstanteBio" ADD CONSTRAINT "ConstanteBio_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Données de départ : gabarits de courriers
INSERT INTO "GabaritCourrier" ("id", "code", "libelle", "contenu") VALUES
    (gen_random_uuid()::text, 'adressage', 'Adressage spécialiste',
     'Docteur,

Je vous adresse Madame/Monsieur [Nom] pour [motif d''adressage].

[Examen clinique et antécédents pertinents]

Je vous remercie de bien vouloir prendre en charge ce/tte patient(e) et reste à votre disposition pour tout complément d''information.

Veuillez agréer, Docteur, l''expression de mes sentiments les meilleurs.'),
    (gen_random_uuid()::text, 'compte_rendu', 'Compte rendu de consultation',
     'Compte rendu de consultation du [date].

Motif : [motif]

Historique :
[antécédents]

Examen clinique :
[examen]

Conclusion :
[conclusion]

Conduite à tenir :
[traitement et suivi]'),
    (gen_random_uuid()::text, 'certificat', 'Certificat médical',
     'Je soussigné(e), Docteur [Nom du praticien], certifie avoir examiné ce jour Madame/Monsieur [Nom].

[Observations]

Certificat établi à la demande de l''intéressé(e) et remis en main propre pour faire valoir ce que de droit.');
