-- Nettoyage des libellés d'antécédents issus de résidus de feuille de style
-- (les commentaires RichView ne contenant QUE du style décodent en "Z.....  Style").

-- 1. Libellés qui ne sont que du style -> libellé générique selon la catégorie
UPDATE "Antecedent"
SET libelle = CASE categorie
                WHEN 'MEDICAL' THEN 'Antécédent médical (non précisé)'
                WHEN 'CHIRURGICAL' THEN 'Antécédent chirurgical (non précisé)'
                WHEN 'FAMILIAL' THEN 'Antécédent familial (non précisé)'
                ELSE libelle END
WHERE libelle ~ '^[#A-Za-z.?!]{1,8}\.{2,}\s*Style' OR libelle ~ 'Style\s*$'
  AND length(libelle) < 25;

-- 2. idem côté allergies : substance styleée -> générique
UPDATE "Allergie"
SET substance = 'Allergie (non précisée)'
WHERE substance ~ '^[#A-Za-z.?!]{1,8}\.{2,}\s*Style' OR substance ~ 'Style\s*$'
  AND length(substance) < 25;

-- 3. stats après nettoyage
SELECT categorie,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE libelle LIKE '%(non précisé)') AS generiques
FROM "Antecedent" GROUP BY categorie ORDER BY 2 DESC;
