-- Ponçage final : blocs de paramètres ".) -6 1 -1 0 0 "NNNNN" 0 18" où qu'ils soient.
-- Format réel observé : " .) -6 1 -1 0 0 \"126863\" 0 18" (quote autour de l'ID).

-- 1. retirer le motif partout où il apparaît (format exact)
UPDATE "Consultation"
SET notes = regexp_replace(notes,
    '\s*\.?\)\s?-\d\s?-\d\s?\d\s?\d\s?"\d+"\s?\d\s?\d*', '', 'g')
WHERE notes LIKE '%.) -6 1 -1 0 0%';

-- 2. variante possible : sans quotes autour de l'ID
UPDATE "Consultation"
SET notes = regexp_replace(notes,
    '\s*\.?\)\s?-\d\s?-\d\s?\d\s?\d\s?\d+\s?\d\s?\d+', '', 'g')
WHERE notes LIKE '%.) -6 1 -1 0 0%';

-- 3. notes devenues vides après ponçage -> NULL
UPDATE "Consultation"
SET notes = NULL
WHERE notes LIKE '<p>%'
  AND trim(both from replace(replace(replace(notes, '<p>', ''), '</p>', ''), '<br>', '')
           ) IN ('', ' ', '&nbsp;');

-- 4. vérification
SELECT COUNT(*) AS restants FROM "Consultation"
WHERE notes LIKE '%.) -6 1 -1 0 0%';
