# Céleste

Une interface de lecture **pour YouTube, sans format court**. Pensée pour qu'un
enfant puisse chercher et regarder des vidéos sans tomber dans le défilement
vertical sans fin.

Les vidéos sont de vraies vidéos YouTube, lues par le **lecteur YouTube officiel**
(iframe) : rien n'est téléchargé, copié ni ré-hébergé, et la vue compte
normalement pour le créateur. Céleste n'est que l'interface.

100 % statique (HTML/CSS/JS, aucune dépendance, aucun build, aucun serveur).

> Nom, logo et couleurs sont originaux : réutiliser la marque ou le logo de
> YouTube est interdit par les conditions de l'API Google (clé et connexion
> révocables). Le nom affiché se change dans Paramètres → **Nom affiché**.

## Les formats courts : rationnés, pas interdits

Partout dans l'application — accueil, recherche, abonnements, suggestions —
toute vidéo de **61 s ou moins**, ou marquée `#shorts`, est écartée avant
affichage. Pas de carrousel, pas de défilement vertical.

La seule porte d'entrée est **« Pause courte »**, une dose quotidienne :

- **durée réglable** (10 min par défaut, 0 = désactivé), remise à zéro chaque jour ;
- **le minuteur ne tourne que pendant la lecture**, et il est affiché en grand ;
- **une vidéo à la fois** : on passe à la suivante en le demandant, jamais par
  défilement — c'est ce geste-là qui rend le format sans fin ;
- à zéro, la lecture s'arrête et la page le dit ; retour aux vidéos longues.

Le temps restant s'affiche en permanence dans le menu.

## Le classement : pas celui du moteur

L'accueil ne reprend pas l'ordre proposé par YouTube. Il part des **chaînes
suivies** et de **centres d'intérêt** fixés dans les paramètres (sciences,
animaux, dessin, espace…), puis reclasse chaque vidéo (`ranker.js`) :

| Ce qui fait monter | Ce qui fait descendre |
| --- | --- |
| rapport j'aime/vues élevé (vrai signal de qualité) | titre qui crie : majuscules, `!!!`, émojis en rafale |
| catégories Éducation, Sciences, Tutos, Animaux | mots d'appât : « 24 h », défi, prank, « incroyable », « top 10 », réaction |
| durée de 4 à 25 min (un sujet traité) | moins de 2 min (fragment) ou plus de 50 min |
| chaînes déjà regardées ou suivies | viral creux : millions de vues, engagement faible |

Puis : **pas plus de 3 vidéos par chaîne**, jamais 3 d'affilée, et un léger
décalage quotidien pour que la page ne soit pas figée. Les recherches passent
en **SafeSearch strict**, et le filtre a trois niveaux (souple / normal /
strict — en strict, les appâts sont retirés, pas seulement relégués).

Tout est modifiable dans Paramètres, et la liste des mots d'appât est en clair
en haut de `ranker.js`.

## Code parent

Un code à 4–6 chiffres (Paramètres → Code parent) verrouille la page des
réglages : sans lui, elle peut elle-même rallonger sa dose de vidéos courtes.

## Les quatre façons de s'en servir

| Mode | Ce qu'il faut | Ce que tu obtiens |
| --- | --- | --- |
| **Clé serveur** | `YT_API_KEY` dans Vercel | tout le site marche sur **tous les appareils**, sans rien saisir |
| **Compte Google** | un ID client OAuth | tes abonnements, tes playlists, tes vidéos aimées |
| **Clé API locale** | une clé collée dans Paramètres | pareil, mais valable sur **ce navigateur** uniquement |
| **Liens** | rien | tu colles des liens YouTube : ils forment la bibliothèque (titres via oEmbed) |
| **Démo** | rien | catalogue local embarqué, pour voir l'interface hors ligne |

### 1. La clé, posée une fois pour toutes (recommandé)

1. `console.cloud.google.com` → créer un projet ;
2. API et services → activer **YouTube Data API v3** ;
3. Identifiants → **Créer une clé API** ;
4. Vercel → le projet → **Settings → Environment Variables** → nom `YT_API_KEY`,
   valeur = la clé, pour les trois environnements ;
5. **Redeploy** (Deployments → ⋯ → Redeploy).

Tous les appareils en profitent aussitôt, et la clé n'apparaît jamais dans la
page : les appels passent par `/api/yt`, une fonction qui n'ouvre que les routes
de lecture de l'API, refuse les appels venus d'un autre site et met les réponses
en cache 30 min côté CDN (autant de quota économisé).

### 1 bis. La clé sur un seul appareil (dépannage)

1. `console.cloud.google.com` → créer un projet ;
2. API et services → activer **YouTube Data API v3** ;
3. Identifiants → **Créer une clé API** ;
4. la coller dans Paramètres. Quota : 10 000 unités/jour (recherche = 100,
   liste = 1). Les réponses sont gardées 30 min en cache ; si le quota tombe,
   un message clair le dit.

### 2. La connexion Google (gratuit aussi)

1. même projet → Identifiants → **ID client OAuth** → type « Application Web » ;
2. dans « Origines JavaScript autorisées », mettre l'adresse du site
   (`https://mon-site.vercel.app`, ou `http://localhost:5173` en test) ;
3. écran de consentement : **Externe**, puis ajouter le compte de l'enfant comme
   utilisateur de test (suffisant tant que l'appli n'est pas publiée) ;
4. coller l'ID client dans Paramètres → **Se connecter avec Google**.

Portée demandée : `youtube.readonly` — **lecture seule**. Céleste ne peut rien
publier, rien supprimer, rien modifier sur le compte. Le jeton vit en
`sessionStorage` et disparaît à la fermeture de l'onglet.

⚠️ La connexion ne marche pas depuis un fichier local (`file://`) : il faut
héberger la page (Vercel/Netlify/GitHub Pages, gratuit).

## Ce qu'il y a dedans

| Zone | Détail |
| --- | --- |
| Accueil | Filtres par catégorie YouTube, « Reprendre la lecture », grille responsive |
| Vidéo | Lecteur officiel, j'aime, abonnement, partage, enregistrement, description dépliable, commentaires YouTube + notes perso, suggestions, lecture auto |
| Navigation | Tendances, Abonnements, Historique, À regarder plus tard, Vidéos aimées, Playlists, Paramètres |
| Chaîne | Bannière, abonnés, onglets Vidéos / À propos |
| Recherche | Suggestions clavier, **recherche vocale** (micro), résultats vidéos + chaînes |
| Confort | Thème clair/sombre, menu rétractable, mini-lecteur persistant, reprise de lecture, raccourcis clavier |

Raccourcis : `espace`/`k` lecture-pause, `←`/`→` ±5 s, `j`/`l` ±10 s, `m` muet,
`f` plein écran, `<`/`>` vitesse, `/` recherche.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `ranker.js` | classement maison : qualité, anti-appât à clic, variété |
| `api/yt.js` | relais serveur : garde la clé, filtre les routes, met en cache |
| `auth.js` | connexion Google (Identity Services, modèle jeton, sans secret) |
| `yt.js` | API YouTube Data v3 + oEmbed, cache, filtre Shorts |
| `catalog.js` | couche unique au-dessus des quatre modes |
| `player.js` | lecteur partagé (iframe YouTube ou `<video>`) et mini-lecteur |
| `app.js` | routeur et vues |
| `data.js` | catalogue de démo hors ligne |

Le mini-lecteur superpose le lecteur à un conteneur fixe plutôt que de le
déplacer dans le DOM : déplacer une iframe la rechargerait et couperait le son.

## Données

ID client, clé locale éventuelle, abonnements locaux, historique, playlists, notes et
progression vivent dans le `localStorage` de ce navigateur ; le jeton Google
dans le `sessionStorage`. Aucun serveur, aucun suivi.
Paramètres → **Tout effacer** remet à zéro.

## Vérification

Une passe automatisée (Playwright headless, API Google, OAuth et lecteur
simulés) couvre 65 parcours (plus 13 tests unitaires du classement) : les modes (serveur, compte, clé locale, liens, démo), la
connexion et la déconnexion, les abonnements et playlists du compte, le montage du lecteur, le
filtrage des formats courts, la dose quotidienne et sa coupure, le code
parent, le reclassement (l'appât à clic ne remonte jamais), les commentaires,
le mini-lecteur, le message de quota dépassé et l'absence de scroll horizontal
en mobile.
