# Comparaison Primia original → Primia

Source : softin.fr/magicmed, Quotidien du Médecin (05/12/2006).

| Fonctionnalité Primia original | Statut v2 | Notes |
|---|---|---|
| Ouverture simultanée de plusieurs dossiers | ❌ | V2 : un dossier à la fois (fenêtre unique). Multifenêtrage possible en phase 2 |
| Multifenêtrage ajustable/escamotable | ❌ | Idem — v2 privilégie une vue dense unique écran large |
| Annotations libres sur le dossier | 🟡 | Consultations avec notes ; annotations rapides à ajouter |
| Ordonnances multiples par dossier | ✅ | Historique ordonnances par patient |
| Courriers multiples par dossier | ✅ | + assistant IA (en plus de l'original) |
| Partage médecin/médecin, médecin/secrétaire | ✅ | Multi-poste PostgreSQL, rôles |
| Dossier déporté (Internet) | ❌ | Réseau local cabinet (on-premise, RGPD) |
| Constantes biologiques (indicateurs santé) | ❌ | À ajouter : poids, TA, glycémie… courbes |
| Gestionnaire de modèles de courriers | ✅ | Gabarits IA (adressage, compte rendu, certificat) |
| Liste des correspondants dans chaque formulaire | ❌ | **À ajouter** : carnet de correspondants réutilisable |
| Envoi mail en un clic + pièces jointes PDF | 🟡 | PDF générés ; envoi mail à brancher |
| GED Magicged (scan production, archivage) | ✅ | + OCR + recherche plein texte + caddie intelligent |
| — | ✅ | **Nouveautés v2** : IA (courriers, structuration notes, prescription assistée avec allergies), agenda moderne, chiffrement NIR, audit, sauvegarde chiffrée |

## Priorités issues de la comparaison

1. **Carnet de correspondants** : destinataires enregistrés, proposés dans courriers/ordonnances — gain de temps direct (chaque formulaire Primia original l'avait)
2. **Constantes biologiques** : saisie rapide + historique (TA, poids, glycémie)
3. **Annotations rapides** : note libre horodatée sans structure de consultation

## Postulat UX v2 (médecin, 15 min/patient, écran 21"+)

- **La journée est la porte d'entrée** : liste des RDV du jour, un clic = dossier
- **Le dossier affiche tout d'un coup d'œil** : allergies, traitements, dernière consultation visibles en permanence (colonne gauche), sans navigation
- **Aucune tâche à plus de 2 clics** depuis le dossier ouvert : consultation, ordonnance, courrier, document
- **Clavier** : Ctrl+K = retrouver un patient instantanément
