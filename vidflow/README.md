# Vidflow

Plateforme de vidéos à la demande, dans l'esprit des grands sites de streaming
**sans aucun format court** : ici, une seule chose, des vidéos qu'on regarde.

Les vidéos sont **de vraies vidéos YouTube**, lues par le **lecteur YouTube
officiel** (iframe) : rien n'est téléchargé, copié ni ré-hébergé, et la vue
compte normalement pour le créateur. Vidflow n'est que l'interface.

100 % statique (HTML/CSS/JS, aucune dépendance, aucun build, aucun serveur) :
ouvre `index.html` ou déploie le dossier tel quel.

## Les trois modes

| Mode | Déclencheur | Ce que tu obtiens |
| --- | --- | --- |
| **YouTube** | une clé API YouTube Data v3 dans Paramètres | tendances, recherche, chaînes, abonnements, commentaires, vues et likes réels |
| **Liens** | aucune clé, mais des liens YouTube collés | ta bibliothèque personnelle ; titre et chaîne récupérés via oEmbed (sans clé) |
| **Démo** | ni l'un ni l'autre | catalogue local embarqué, pour voir l'interface hors ligne |

### Obtenir la clé (gratuit, ~2 min)

1. `console.cloud.google.com` → créer un projet ;
2. API et services → activer **YouTube Data API v3** ;
3. Identifiants → **Créer une clé API** ;
4. la coller dans Vidflow → Paramètres. Elle reste dans ton navigateur.

Quota gratuit : 10 000 unités/jour (une recherche = 100, une liste de vidéos = 1).
Vidflow met les réponses en cache 30 min pour l'économiser, et affiche un
message clair quand le quota est atteint.

## Sans Shorts, vraiment

Le filtre est appliqué à la source, sur chaque liste : toute vidéo de **61 s ou
moins**, ou marquée `#shorts`, est écartée avant affichage. Aucun onglet, aucun
carrousel, aucune lecture verticale.

## Ce qu'il y a dedans

| Zone | Détail |
| --- | --- |
| Accueil | Filtres par catégorie, « Reprendre la lecture », grille responsive |
| Vidéo | Lecteur YouTube officiel, j'aime / je n'aime pas, abonnement, partage, enregistrement, description dépliable, commentaires (ajout, like, suppression), suggestions, lecture auto, file d'attente |
| Navigation | Tendances, Abonnements, Historique, À regarder plus tard, Vidéos que j'aime, Playlists, Paramètres |
| Chaîne | Bannière, onglets Vidéos / Playlists / À propos, abonnement |
| Recherche | Suggestions au clavier (↑ ↓), résultats vidéos + chaînes |
| Confort | Thème clair/sombre, menu rétractable (rail), mini-lecteur persistant, reprise de lecture, notifications d'abonnements, raccourcis clavier |

Raccourcis : `espace`/`k` lecture-pause, `←`/`→` ±5 s, `j`/`l` ±10 s, `m` muet,
`f` plein écran, `<`/`>` vitesse, `/` recherche.

## Données

Tout est local : clé API, abonnements, historique, likes, playlists, notes et
progression de lecture vivent dans le `localStorage` du navigateur
(`Paramètres → Tout effacer` pour repartir de zéro). Aucun compte, aucun suivi.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `yt.js` | API YouTube Data v3 + oEmbed, cache, filtre Shorts |
| `catalog.js` | couche unique au-dessus des trois modes |
| `player.js` | lecteur partagé (iframe YouTube ou `<video>`) et mini-lecteur |
| `app.js` | routeur et vues |
| `data.js` | catalogue de démo hors ligne |

Le mini-lecteur superpose le lecteur à un conteneur fixe plutôt que de le
déplacer dans le DOM : déplacer une iframe la rechargerait et couperait le son.

## Vérification

Une passe automatisée (Playwright headless, API et lecteur simulés) couvre 28
parcours : les trois modes, le montage du lecteur, le filtrage des Shorts, les
commentaires, le mini-lecteur, les abonnements, le message de quota dépassé et
l'absence de scroll horizontal en mobile.

## Licence / marques

Interface originale : nom, logo, palette et textes sont propres à Vidflow —
aucune marque ni ressource graphique d'une plateforme existante n'est reprise.
Les vidéos restent chez YouTube et sont lues via son lecteur officiel, seule
façon autorisée de les diffuser ailleurs ; les contourner (téléchargement,
suppression des publicités) n'est ni fait ni prévu ici.
