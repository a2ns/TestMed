-- Dédoublonnage des consultations : un seul exemplaire par (patient, date, texte).
-- Cause : les passes de rattrapage successives ont réécrit certaines consultations
-- sur de nouveaux UUIDs. On garde l'exemplaire au plus petit id (déterministe).

-- 1. vue des doublons : exemplaires à supprimer
WITH classes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "patientId", date::date, COALESCE(LEFT(notes, 200), '')
           ORDER BY id
         ) AS rang
  FROM "Consultation"
)
DELETE FROM "Consultation"
WHERE id IN (SELECT id FROM classes WHERE rang > 1);

-- 2. ponçage des notes qui ne sont QUE des artefacts (*TXT*, n..... Style)
UPDATE "Consultation"
SET notes = NULL
WHERE notes ~ '^\s*<p>\s*(\*TXT\*|[A-Za-z#]{1,3}\.{2,}\s*Style)\s*</p>\s*$';

-- 3. radiographie finale
SELECT CASE
  WHEN notes LIKE '<p>%' THEN 'HTML avec contenu'
  WHEN notes IS NULL THEN 'NULL'
  ELSE 'AUTRE'
END AS type, COUNT(*)
FROM "Consultation" GROUP BY 1;
