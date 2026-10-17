-- Ponçage final v4 : la regex épouse le format réel ".) -6 1 -1 0 0 "ID" 0 18"
-- (nombres de signes alternés, pas deux négatifs consécutifs).

UPDATE "Consultation"
SET notes = regexp_replace(notes,
    '\s*\.\)\s*-?\d+\s+-?\d+\s+-?\d+\s+-?\d+\s+-?\d+\s*"?-?\d*"?\s*-?\d*\s*-?\d*',
    ' ', 'g')
WHERE notes LIKE '%.) -6 1 -1 0 0%';

-- notes vidées par le ponçage -> NULL
UPDATE "Consultation"
SET notes = NULL
WHERE notes LIKE '<p>%'
  AND trim(both from replace(replace(replace(notes, '<p>', ''), '</p>', ''), '<br>', '')
           ) IN ('', ' ', '&nbsp;');

-- vérification
SELECT COUNT(*) AS restants FROM "Consultation"
WHERE notes LIKE '%) -6 1 -1 0 0%';
