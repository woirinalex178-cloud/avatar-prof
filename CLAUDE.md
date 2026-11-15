# ⚠️ Mauvaise branche pour le site Sharing Cards

La production (table-des-doubles.vercel.app) se déploie **uniquement** depuis la branche **`claude/relaxed-galileo-u5yzct`**.
Cette branche-ci est en retard : ne pas y développer le site et **ne jamais la déployer**
(le 15/11, un déploiement fait depuis une branche périmée a effacé du site le forum, le classeur, les cotes et le scan récents).

Avant tout travail :
```
git fetch origin claude/relaxed-galileo-u5yzct && git checkout -B claude/relaxed-galileo-u5yzct origin/claude/relaxed-galileo-u5yzct
```
puis lire `table-des-doubles/REPRISE.md`. Le travail de la Gazette (fonction `blog`, migrations) y est déjà rapatrié.
