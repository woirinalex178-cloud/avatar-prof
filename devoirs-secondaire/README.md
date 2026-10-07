# Devoirs Malins — Collège & Lycée

Première base de travail, dérivée de `devoirs-auto` au commit
`abf23f21f7d7e496e9038a5bb5aa3babd6491dc1` de `woirinalex178-cloud/avatar-prof`.
Ce commit est celui du déploiement Vercel `devoirs-malins` consulté le 7 octobre 2026.
La copie est dans `devoirs-secondaire`, sur `codex/devoirs-malins-secondaire`.
L'application primaire et ses fichiers restent inchangés.

## Disponible dans cette base

- Profil de la 6e à la terminale ; voie générale, technologique ou professionnelle au lycée.
- Le profil est enregistré sur l'appareil et attaché à chaque nouveau devoir ; les prompts de génération utilisent sa classe au lieu du CM2 fixe.
- Imports hérités : photo, PDF, image, texte ; génération de fiches et questions avec Gemini, à configurer et tester avec une vraie clé.
- Bibliothèque par matière, recherche, impression, fiches de personnages, cartes sans noms et frises à trous, reprises de l'application primaire.
- Quiz corrigés, niveaux de difficulté, suivi des meilleurs scores et entraînement « Objectif 20/20 » hérités.
- Mini-labo électrique interactif : prédiction, ouverture/fermeture du circuit, observation et explication ; utilisable sans IA.
- Exemples fictifs d'histoire et de géographie accessibles sans code depuis l'écran d'accueil.
- Stockage local préfixé et identifiant de sauvegarde distante distincts de la version primaire.
- Point d'entrée `/api/integrations` prêt à accueillir les connecteurs.

## Ce qui n'est pas encore réalisé

Cette base n'est pas une application multiélève prête à commercialiser. Le code d'accès et la sauvegarde hérités correspondent à **un déploiement privé pour un élève**. La sélection de classe n'est pas un système de comptes. Les spécialités, séries et filières précises restent à modéliser.

Pronote et les autres ENT ne sont **pas connectés**. Le code n'en demande ni n'en stocke les identifiants. ONE est conservé comme adaptateur hérité optionnel, non validé dans cette copie. Aucune synchronisation automatique n'est activée dans `vercel.json`.

Les fonctions de génération IA et de sauvegarde distante sont reprises du socle mais n'ont pas été testées avec des services réels dans cette session. Aucun secret ni contenu d'élève n'a été copié. La persistance locale peut disparaître si le navigateur efface ses données. Le modèle de données Supabase et ses fonctions RPC ne figurent pas dans le dépôt source : les vérifier avant de configurer la sauvegarde. Le code ne crée ni ne modifie de base distante.

Les quiz sont un entraînement guidé. Les évaluations blanches avec correction différée, durée, barème et réponses rédigées, le suivi de maîtrise par compétence, les schémas à légender et les autres mini-jeux restent à développer. Les contenus générés ne garantissent pas à eux seuls une conformité au programme officiel : il faut un référentiel par niveau et des contenus vérifiés.

## Tester

Depuis `devoirs-secondaire` :

```sh
npm test
python3 -m http.server 8000
```

Ouvrir `http://localhost:8000`, puis « Découvrir les exemples sans connexion ».
Le serveur Python sert seulement les écrans et les exemples ; il n'exécute pas les API.
Les cartes et portraits ont besoin d'un accès Internet à CARTO/OpenStreetMap et Wikipédia.

Pour les API : créer un **nouveau projet Vercel** avec ce dossier comme Root Directory,
puis configurer les variables de `.env.example` dans ce nouveau projet. Ne pas changer la racine
du projet primaire. Aucun projet ni déploiement n'a été créé pour cette copie.

## Connexions et tâche quotidienne

1. Choisir un premier établissement et préciser l'ENT et le mode d'authentification.
2. Valider une voie d'intégration autorisée : partenariat éditeur ou adaptateur adapté au contexte.
3. Implémenter l'adaptateur en lecture seule, les erreurs de session, les devoirs modifiés/supprimés,
   les pièces jointes, la déduplication et un statut de dernière synchronisation fiable.
4. Tester avec un compte pilote consenti ; ne pas demander de mot de passe dans un chat.
5. Ajouter comptes individuels, stockage serveur des sessions chiffré, séparation des données,
   révocation et suppression de compte avant d'ouvrir à plusieurs familles.
6. Activer ensuite une tâche serveur quotidienne et la reprise des échecs. Un déclenchement
   ne doit pas marquer le devoir « fait » sur l'ENT ni modifier les données de l'établissement.

`api/cron.js` est conservé comme base pour le pilote privé : secret requis, connecteur actif
et sauvegarde configurée. Il n'est pas planifié. Son profil provient de `STUDENT_CLASS` et
`STUDENT_TRACK` ; les réglages du navigateur ne configurent pas cette tâche serveur.
Les sessions longues et la génération de nombreux devoirs demanderont une file de tâches.

Sources consultées le 7 octobre 2026 :

- [INDEX ÉDUCATION — connecteurs partenaires](https://www.index-education.com/fr/pronote-info326-connecteurs-partenaires.php) : intégrations activées par les établissements, selon les services partenaires.
- [pronotepy — connexion et devoirs](https://pronotepy.readthedocs.io/en/stable/quickstart.html) : piste technique communautaire, à évaluer et tester ; pas un connecteur officiel ni une compatibilité universelle.

Voir [PROJET.md](PROJET.md) pour le parcours cible et les prochaines étapes.
