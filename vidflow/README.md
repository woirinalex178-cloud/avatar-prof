# Vidflow

Plateforme de vidéos à la demande, dans l'esprit des grands sites de streaming
**sans aucun format court** : ici, une seule chose, des vidéos qu'on regarde.

100 % statique (HTML/CSS/JS, aucune dépendance, aucun build, aucun serveur) :
ouvre `index.html` ou déploie le dossier tel quel.

## Ce qu'il y a dedans

| Zone | Détail |
| --- | --- |
| Accueil | Filtres par catégorie, « Reprendre la lecture », grille responsive |
| Vidéo | Lecteur, j'aime / je n'aime pas, abonnement, partage, enregistrement, description dépliable, commentaires (ajout, like, suppression), suggestions, lecture auto, file d'attente |
| Navigation | Tendances, Abonnements, Historique, À regarder plus tard, Vidéos que j'aime, Playlists, Paramètres |
| Chaîne | Bannière, onglets Vidéos / Playlists / À propos, abonnement |
| Recherche | Suggestions au clavier (↑ ↓), résultats vidéos + chaînes |
| Confort | Thème clair/sombre, menu rétractable (rail), mini-lecteur persistant, reprise de lecture, notifications d'abonnements, raccourcis clavier |

Raccourcis : `espace`/`k` lecture-pause, `←`/`→` ±5 s, `j`/`l` ±10 s, `m` muet,
`f` plein écran, `<`/`>` vitesse, `/` recherche.

## Données

Tout est local : abonnements, historique, likes, playlists, commentaires et
progression de lecture vivent dans le `localStorage` du navigateur
(`Paramètres → Tout effacer` pour repartir de zéro). Aucun compte, aucun suivi.

## Mettre tes propres vidéos

Tout le catalogue est dans `data.js` :

- `CHANNELS` — les chaînes (nom, teinte, abonnés, description) ;
- `ROWS` — les vidéos `[titre, chaîne, catégorie, durée (s), vues, âge (jours), tags]` ;
- `CLIPS` — les URL des fichiers lus.

Les clips fournis sont des fichiers de test publics, uniquement pour la démo :
remplace `CLIPS` par tes propres MP4 (ou un flux HLS) et le reste suit.
Les vignettes sont générées en CSS à partir de la chaîne : rien à héberger.

## Vérification

Une passe automatisée (Playwright headless) couvre les 21 parcours clés :
navigation, abonnement, like, commentaire, enregistrement, recherche, thème,
absence de scroll horizontal en mobile.

## Licence / marques

Projet original : nom, logo, palette, catalogue et textes sont propres à Vidflow.
Aucune marque, aucun logo ni asset d'une plateforme existante n'est utilisé.
