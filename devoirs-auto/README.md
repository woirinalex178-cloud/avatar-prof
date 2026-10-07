# Mes devoirs malins (CM2)

Devoirs de Céleste → entraînement adapté, **automatiquement**. Coût : **0 €**.

| Devoir détecté | Ce que l'app prépare |
|---|---|
| Exercice à faire | 4 questions d'échauffement (~5 min) |
| Leçon / poésie / tables à apprendre | Mémo + 8 questions (~10 min) |
| Évaluation / contrôle / dictée | Mémo + 14 questions progressives = évaluation blanche (~20 min) |

## 3 façons de récupérer les devoirs
1. **ONE (auto)** : à l'ouverture, l'app lit le « Cahier de textes » avec ton compte parent.
2. **📷 Photo du cahier papier** : Céleste photographie sa page, l'IA lit les devoirs.
3. **✏️ Texte libre** : « pour jeudi apprendre les fractions, évaluation vendredi… » — l'IA découpe en devoirs. Sert aussi à préciser une photo pas claire.

4. **📎 Fichier** : image, PDF ou texte (ex. une capture d'écran envoyée par une autre maman).

Chaque nouveau devoir est préparé tout seul : **fiche pédagogique** (cours, exemples, à retenir, astuce, pièges) + **banque de questions** qui change à chaque partie (l'IA en ajoute quand il en manque). Évaluations : mode **🎯 Objectif 20/20** (20 questions, les erreurs reviennent jusqu'à être réussies). Toutes les fiches restent dans **📚 Mes fiches** (classées par matière, recherche, impression).

**Visuels** (gratuits) : frise chronologique et portraits de personnages (Wikipédia, lien Vikidia) en histoire, carte (OpenStreetMap/CARTO) en géographie ; exercices **frise à trous** et **carte à trous**.

 Étoiles ⭐, série de jours 🔥, trophées et confettis pour motiver.

**Tous les appareils** : même code famille = mêmes devoirs et scores sur téléphone, tablette, ordi (sauvegarde Supabase gratuite, fusion automatique).

## Mise en ligne (~10 min)
1. Clé IA gratuite : https://aistudio.google.com/apikey
2. https://vercel.com/new → importer `avatar-prof` → **Root Directory** : `devoirs-auto`.
3. **Environment Variables** (voir `.env.example`) : `GEMINI_API_KEY`, `APP_PIN`, et si voulu `ONE_LOGIN`, `ONE_PASSWORD`.
4. Deploy → ouvrir le lien sur la tablette → *Ajouter à l'écran d'accueil*.

## Limites à connaître
- ONE n'a pas d'API publique : la synchro imite le navigateur. À vérifier dès que l'instit remplit le cahier de textes (si ça casse : photo ou saisie).
- Un compte ONE avec double authentification bloquera la synchro.
- Offre gratuite Gemini : largement suffisante pour quelques devoirs par jour.
