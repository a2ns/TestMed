# Cahier des charges — Exigences médecin généraliste & conformité

Statut de couverture du socle actuel (✅ fait, 🟡 partiel, ❌ à faire).

## 1. Exercice quotidien du généraliste

| Besoin | Statut | Détail |
|---|---|---|
| Fiche patient complète (antécédents, traitements, allergies) | ❌ | Modèle présent, écran fiche patient à construire |
| Historique des consultations | 🟡 | Table en base, écran manquant |
| Ordonnances (y compris bi-ordonnance, sécurisée) | ❌ | Prioritaire : prescription avec CIP/UCD, durée, posologie |
| Certificats médicaux | 🟡 | Gabarit IA présent, génération dédiée à faire |
| Courriers / adressage spécialiste | ✅ | Rédaction IA + impression + archivage GED |
| Gestion de l'agenda / rendez-vous | ❌ | Absent — indispensable au quotidien |
| Recette / règlements (chèques, CB, chèque santé) | ❌ | Absent |
| Comptes rendus, protocoles, surveillance | ❌ | Écrans à construire |
| Recherche globale patient/document | 🟡 | tsvector en base, recherche IHM à brancher |

## 2. Facturation Sécurisée Vitale (FSV) — obligatoire

| Exigence | Statut |
|---|---|
| Contrat GIE SESAM-Vitale + lecteur certifié + CPS | ❌ (externe, à fournir par le cabinet) |
| Lecture carte Vitale (B2), création/modif/suppression FSE | 🟡 | Ossature FFI + commandes prêtes ; branchement final après contrat GIE |
| Lots FSE, télétransmission, rejets, DAV/AC | ❌ |
| DMF (droits et missions en vigueur) | ❌ |
| ALD, affections longue durée | ❌ |

⚠️ Sans FSV, le logiciel ne peut pas facturer l'Assurance Maladie.
C'est la brique réglementaire la plus lourde : elle exige le contrat
GIE, l'environnement FSV et un poste Windows.

## 3. DMP / téléservices

| Exigence | Statut |
|---|---|
| Inscription DMP, alimentation (CR, ordonnances) | 🟡 | Client + commandes posées ; habilitation requise |
| DICT (images) — actuellement Service d'accès aux images (SAI) | ❌ |
| CCDA / messagerie sécurisée MSSanté | ❌ |
| Synthèse médicale (contenu minimale) | ❌ |

## 4. Données de santé — conformité

| Exigence | Statut | Détail |
|---|---|---|
| RGPD : registre de traitement, minimisation | 🟡 | Doc présente, registre à formaliser |
| Hébergement si cloud | ✅ | Architecture on-premise cabinet (aucun cloud requis) |
| Chiffrement des données sensibles (NIR, santé) au repos | ❌ | `nirChiffre` prévu, chiffrement à implémenter |
| Chiffrement des échanges | 🟡 | Réseau cabinet à sécuriser (TLS/Tunnel) |
| Journal d'audit (traçabilité des accès) | 🟡 | Table `AuditLog` en base, alimentation systématique à câbler |
| Authentification nominative + rôles | ✅ | Login bcrypt + sessions + rôles |
| Sauvegarde chiffrée | ✅ | pg_dump + gzip + AES-256-GCM, rétention auto, écran admin |
| Chiffrement NIR au repos | ✅ | AES-256-GCM + empreinte déterministe |
| Journal d'audit | ✅ | Connexions, accès patients, ordonnances, IA, scan, recherche |
| Sauvegarde chiffrée testée | ❌ | Stratégie de sauvegarde à documenter et outiller |
| Conservation / archivage (20 ans DPI patient) | 🟡 | GED versionnée, politique à formaliser |
| Bloque-pub / antivirus / durcissement poste | ❌ | Guide de sécurisation à écrire |

## 5. Sécurité logicielle

| Exigence | Statut |
|---|---|
| Vérification d'intégrité du module IA (aucune fuite externe) | ✅ | OCR local ; IA configurable, option Ollama local |
| Contrôle qualité avant mise en production | ❌ | Tests automatisés à ajouter |
| Mise à jour du logiciel (auto-update Tauri) | 🟡 | Tauri updater intégré, à activer |
| Gestion des droits fins par écran (secrétaire vs médecin) | 🟡 | Rôles en base, application à câbler |

## 6. Priorités recommandées

1. **Fiche patient + écrans consultation/ordonnance** (le cœur du métier)
2. **Agenda / rendez-vous**
3. **FSV / facturation** (contrat GIE + FSV + poste Windows — long délai, à lancer dès maintenant)
4. **Audit log systématique + chiffrement NIR**
5. **DMP + MSSanté** (téléservices)
6. **Sauvegardes chiffrées + guide durcissement**
