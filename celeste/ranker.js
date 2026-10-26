/* Classement maison : on ne reprend pas l'ordre proposé par le moteur.
   Objectif : remonter ce qui est construit et expliqué, faire redescendre
   l'appât à clic, et garantir de la variété. Tout est réglable dans Paramètres. */
(function (global) {
  'use strict';

  /* Appâts à clic les plus courants (fr + en). Liste volontairement courte :
     mieux vaut rater un cas que punir une vidéo honnête. */
  var BAIT = [
    'tu ne vas pas y croire', 'vous ne devinerez jamais', 'incroyable', 'choc', 'choquant',
    'personne ne', 'secret', 'interdit', 'censur', 'arnaque', 'gratuit',
    'je teste', 'defi', 'challenge', 'prank', 'troll', '24h', '24 h', 'pendant 24',
    'a 3h du matin', '3h du mat', 'ne regardez pas', 'la verite sur', 'ils cachent',
    'plus jamais', 'ma reaction', 'je reagis', 'clickbait', 'gone wrong', 'you wont believe',
    'top 10', 'top 5', 'tier list', 'draw my life', 'storytime', 'je claque', 'j achete',
    'le pire', 'le plus cher', 'millionnaire', 'riche'
  ];

  /* Catégories YouTube qui nourrissent plutôt qu'elles n'occupent. */
  var GOOD_CATEGORIES = {
    27: 1,    // Éducation
    28: 1,    // Science et technologie
    26: 0.7,  // Howto et style (tutos, bricolage)
    15: 0.6,  // Animaux
    19: 0.5,  // Voyages et événements
    29: 0.5,  // Associations et solidarité
    10: 0.3,  // Musique
    20: -0.3, // Jeux vidéo
    24: -0.4, // Divertissement
    22: -0.2  // Personnes et blogs (vlogs)
  };

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* Un titre qui crie : majuscules, ponctuation en rafale, émojis à la pelle. */
  function shoutiness(title) {
    var letters = title.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (!letters) { return 0; }
    var caps = (title.match(/[A-ZÀ-Þ]/g) || []).length / letters.length;
    var bangs = (title.match(/[!?]/g) || []).length;
    var emojis = (title.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
    return Math.min(1, (caps > 0.6 ? 0.6 : 0) + Math.min(0.3, bangs * 0.12) + Math.min(0.4, emojis * 0.12));
  }

  function baitHits(text) {
    var t = fold(text);
    return BAIT.filter(function (w) { return t.indexOf(w) !== -1; }).length;
  }

  /* Rapport j'aime / vues : bien meilleur signal que les vues brutes, qui ne
     disent que « ça a été poussé ». 5 % est déjà excellent. */
  function engagement(v) {
    if (!v.views || !v.likes) { return 0.25; }
    return Math.max(0, Math.min(1, (v.likes / v.views) / 0.05));
  }

  /* Une vidéo construite dure quelques minutes ; trop courte = fragment,
     trop longue = inregardable pour un enfant. */
  function lengthScore(seconds) {
    if (!seconds) { return 0; }
    if (seconds < 120) { return -0.4; }
    if (seconds < 240) { return 0.15; }
    if (seconds <= 1500) { return 0.45; }
    if (seconds <= 3000) { return 0.2; }
    return -0.25;
  }

  /* Petit décalage stable par vidéo et par jour : la page change un peu chaque
     jour sans jamais devenir un tirage au sort. */
  function dailyJitter(id) {
    var seed = fold(id + new Date().toISOString().slice(0, 10));
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) % 1000; }
    return (h / 1000 - 0.5) * 0.3;
  }

  function score(video, ctx) {
    ctx = ctx || {};
    var strength = ctx.strength === undefined ? 1 : ctx.strength; // sévérité du filtre
    var text = video.title + ' ' + (video.description || '').slice(0, 160);

    var bait = Math.min(1, baitHits(text) * 0.45) + shoutiness(video.title);
    var category = GOOD_CATEGORIES[video.category] || 0;
    var affinity = (ctx.favouriteChannels && video.channelId &&
      ctx.favouriteChannels.indexOf(video.channelId) !== -1) ? 0.5 : 0;
    var hollowViral = (video.views > 2e6 && engagement(video) < 0.3) ? -0.5 : 0;

    var s = 1
      + 0.9 * engagement(video)
      + 0.6 * category
      + lengthScore(video.duration)
      + affinity
      + hollowViral
      - 1.4 * bait * strength
      + dailyJitter(video.id);

    return { value: s, bait: bait, engagement: engagement(video), category: category };
  }

  /* Variété : pas plus de deux vidéos d'affilée de la même chaîne, et au plus
     trois par chaîne sur la page. Sinon une seule chaîne mange tout. */
  function diversify(list, perChannel) {
    perChannel = perChannel || 3;
    var count = {};
    var kept = [];
    var spill = [];
    list.forEach(function (v) {
      var c = v.channelId || v.channelTitle || '?';
      count[c] = (count[c] || 0) + 1;
      if (count[c] <= perChannel) { kept.push(v); } else { spill.push(v); }
    });
    var out = [];
    kept.forEach(function (v) {
      var prev = out[out.length - 1];
      var prev2 = out[out.length - 2];
      if (prev && prev2 && prev.channelId === v.channelId && prev2.channelId === v.channelId) {
        spill.push(v);   // repoussée plus bas : trois d'affilée, ça suffit
        return;
      }
      out.push(v);
    });
    return out.concat(spill);
  }

  var Ranker = {
    score: score,
    baitHits: baitHits,
    shoutiness: shoutiness,
    engagement: engagement,

    /* Trie une liste et retire les pires appâts quand le filtre est serré. */
    rank: function (list, ctx) {
      ctx = ctx || {};
      var scored = list.map(function (v) {
        var s = score(v, ctx);
        return { v: v, s: s.value, bait: s.bait };
      });
      var limit = ctx.strength >= 1.5 ? 0.6 : (ctx.strength <= 0.5 ? 2 : 0.95);
      var kept = scored.filter(function (x) { return x.bait < limit; });
      if (kept.length < Math.min(6, scored.length)) { kept = scored; }
      kept.sort(function (a, b) { return b.s - a.s; });
      return diversify(kept.map(function (x) { return x.v; }), ctx.perChannel);
    },

    /* Mélange plusieurs sources (abonnements, centres d'intérêt) sans qu'une
       seule prenne toute la place. */
    interleave: function (lists) {
      var out = [];
      var seen = {};
      var max = Math.max.apply(null, lists.map(function (l) { return l.length; }).concat([0]));
      for (var i = 0; i < max; i++) {
        lists.forEach(function (l) {
          var v = l[i];
          if (v && !seen[v.id]) { seen[v.id] = 1; out.push(v); }
        });
      }
      return out;
    }
  };

  global.Ranker = Ranker;
})(typeof window === 'undefined' ? globalThis : window);

if (typeof module !== 'undefined') { module.exports = globalThis.Ranker; }
