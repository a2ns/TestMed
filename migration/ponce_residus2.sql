-- Ponçage complémentaire : blocs de paramètres en MILIEU de ligne
-- (résidus collés au texte : "  <br> .) -6 1 -1 0 0 "12375" 0 18<br> ")

-- 1. dans les consultations : retirer les motifs où qu'ils soient
UPDATE "Consultation"
SET notes = regexp_replace(notes,
    '\s*\.?\)\s?-?\d[\d\s"]{8,}(\d)\s*<br>', '<br>', 'g')
WHERE notes LIKE '%.) -%';

-- 2. nettoyage : lignes/paragraphes ne contenant PLUS que des résidus -> NULL
UPDATE "Consultation"
SET notes = NULL
WHERE notes LIKE '<p>%'
  AND trim(both from replace(replace(notes, '<p>', ''), '</p>', '')
           ) IN ('', '<br>', '<br><br>', ' ');

-- 3. vérification : combien en restent ?
SELECT COUNT(*) AS restants FROM "Consultation"
WHERE notes LIKE '%.) -6 1 -1 0 0%';
