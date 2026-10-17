-- Ponçage in-place des artefacts MagicMed dans les notes existantes.
-- Déterministe : ne re-décode rien, ne réécrit que les motifs parasites.

-- 1. Motifs embarqués : HelloDoc(+IDs), *VID*/*IMG*, signets RichView
UPDATE "Consultation"
SET notes = regexp_replace(
         regexp_replace(
           regexp_replace(notes,
             'HelloDoc:?\)?[0-9-]*', '', 'g'),
           '\*VID\*|\*IMG\*', '', 'g'),
         'RVS?CleanBookMark', '', 'g')
WHERE notes LIKE '%HelloDoc%' OR notes LIKE '%*VID*%' OR notes LIKE '%CleanBookMark%';

-- 2. Blocs de paramètres numériques en début de ligne : ".) -6 1 -1 0 0 "80515" 0 18"
UPDATE "Consultation"
SET notes = regexp_replace(notes,
         '(?m)^\.?\)\s?-\d[\d\s"''-]+$', '', 'g')
WHERE notes ~ '^\.\)\s?-\d';

-- 3. Lignes devenues quasi vides après ponçage (<p>  <br>  </p>) -> NULL
UPDATE "Consultation"
SET notes = NULL
WHERE notes LIKE '<p>%'
  AND trim(both from replace(replace(notes, '<p>', ''), '</p>', '')
           ) IN ('', '<br>', '<br><br>', ' ');

-- 4. Ménage équivalent côté courriers (contenu NOT NULL -> chaîne vide)
UPDATE "Courrier"
SET contenu = regexp_replace(
         regexp_replace(
           regexp_replace(contenu,
             'HelloDoc:?\)?[0-9-]*', '', 'g'),
           '\*VID\*|\*IMG\*', '', 'g'),
         'RVS?CleanBookMark', '', 'g')
WHERE contenu LIKE '%HelloDoc%' OR contenu LIKE '%*VID*%' OR contenu LIKE '%CleanBookMark%';
