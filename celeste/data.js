/* Catalogue de démonstration.
   Les clips sont des fichiers de test publics ; remplace `src` par tes propres
   vidéos (ou une URL HLS) pour un vrai catalogue. Aucun format court ici. */
(function (global) {
  'use strict';

  var CLIPS = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4'
  ];

  var CHANNELS = [
    { id: 'atelier', name: 'Atelier Pixel', hue: 258, subs: 1284000, verified: true,
      about: 'Tutoriels de création numérique : design, montage, motion design. Nouvelle vidéo chaque mardi.' },
    { id: 'labo', name: 'Labo Curieux', hue: 150, subs: 892000, verified: true,
      about: 'La science expliquée simplement, avec des expériences filmées à la maison.' },
    { id: 'cuisine', name: 'Cuisine Lente', hue: 22, subs: 410000, verified: false,
      about: 'Recettes de saison, sans précipitation. Marché le samedi, cuisine le dimanche.' },
    { id: 'moteur', name: 'Moteur & Bitume', hue: 4, subs: 2130000, verified: true,
      about: 'Essais auto, mécanique et road-trips. On démonte, on explique, on roule.' },
    { id: 'sons', name: 'Sons du Studio', hue: 288, subs: 657000, verified: false,
      about: 'MAO, mixage, mastering. Des sessions complètes du vide au morceau fini.' },
    { id: 'rando', name: 'Horizon Libre', hue: 196, subs: 318000, verified: false,
      about: 'Randonnée, bivouac, matériel testé en conditions réelles.' },
    { id: 'code', name: 'Code sans Chichi', hue: 212, subs: 1540000, verified: true,
      about: 'Développement web expliqué calmement : JavaScript, CSS, architecture.' },
    { id: 'archi', name: 'Villes & Formes', hue: 46, subs: 205000, verified: false,
      about: 'Architecture, urbanisme et histoire des villes en documentaires courts.' }
  ];

  var CATEGORIES = ['Musique', 'Jeux vidéo', 'Cuisine', 'Science', 'Automobile',
    'Informatique', 'Nature', 'Architecture', 'Actualités', 'Sport'];

  /* [titre, chaîne, catégorie, durée (s), vues, jours avant aujourd'hui, tags] */
  var ROWS = [
    ['Monter une vidéo propre en 20 minutes', 'atelier', 'Informatique', 1142, 842000, 3, ['montage', 'tutoriel']],
    ['Composition : la règle que tout le monde oublie', 'atelier', 'Informatique', 736, 331000, 11, ['design']],
    ['Motion design : 6 animations utiles', 'atelier', 'Informatique', 1520, 128000, 26, ['animation', 'design']],
    ['Pourquoi le ciel devient rouge au coucher du soleil', 'labo', 'Science', 612, 1960000, 2, ['physique', 'lumière']],
    ['On fabrique une pile avec trois citrons', 'labo', 'Science', 884, 745000, 9, ['chimie', 'expérience']],
    ['Le son voyage-t-il dans le vide ?', 'labo', 'Science', 455, 2410000, 40, ['physique']],
    ['Pain au levain : la recette sans balance', 'cuisine', 'Cuisine', 1335, 298000, 5, ['boulangerie']],
    ['Soupe de courge rôtie, version du dimanche', 'cuisine', 'Cuisine', 702, 86000, 13, ['automne', 'recette']],
    ['Essai complet : la compacte sportive de référence', 'moteur', 'Automobile', 1890, 3120000, 1, ['essai', 'auto']],
    ['Route et chemin : le break passe-partout', 'moteur', 'Automobile', 1420, 1180000, 7, ['essai', '4x4']],
    ['Quelle voiture pour 1 000 € ?', 'moteur', 'Automobile', 2040, 4680000, 21, ['occasion']],
    ['Freinage : ce que la pédale raconte', 'moteur', 'Automobile', 980, 512000, 34, ['mécanique']],
    ['Mixer une batterie qui respire', 'sons', 'Musique', 1655, 402000, 4, ['mixage', 'mao']],
    ['Composer sans inspiration : 3 départs qui marchent', 'sons', 'Musique', 1098, 221000, 16, ['composition']],
    ['Bivouac à 2 000 m : le matériel qui a tenu', 'rando', 'Nature', 1264, 560000, 6, ['bivouac', 'matériel']],
    ['Trois jours sur les crêtes, sans réseau', 'rando', 'Nature', 2310, 187000, 19, ['randonnée']],
    ['JavaScript : comprendre enfin les promesses', 'code', 'Informatique', 1480, 2240000, 2, ['javascript']],
    ['CSS moderne : oublier les hacks de 2015', 'code', 'Informatique', 1210, 1340000, 10, ['css']],
    ['Architecture front : où ranger quoi', 'code', 'Informatique', 1760, 690000, 29, ['architecture']],
    ['Débugger comme un enquêteur', 'code', 'Informatique', 905, 455000, 47, ['debug']],
    ['Les villes qui ont effacé la voiture', 'archi', 'Architecture', 1395, 820000, 8, ['urbanisme']],
    ['Béton, verre, erreur : les tours des années 70', 'archi', 'Architecture', 1620, 240000, 23, ['histoire']],
    ['Le stade, machine à foule', 'archi', 'Sport', 1140, 176000, 52, ['sport', 'urbanisme']],
    ['Retro-gaming : réparer une manette qui dérive', 'atelier', 'Jeux vidéo', 848, 967000, 15, ['réparation', 'jeux']]
  ];

  function slug(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 42);
  }

  var DAY = 86400000;
  var now = Date.now();

  var VIDEOS = ROWS.map(function (row, i) {
    var title = row[0];
    return {
      id: slug(title) + '-' + i,
      title: title,
      channelId: row[1],
      category: row[2],
      duration: row[3],
      views: row[4],
      published: now - row[5] * DAY,
      tags: row[6],
      src: CLIPS[i % CLIPS.length],
      hue: (CHANNELS.filter(function (c) { return c.id === row[1]; })[0] || {}).hue || 258,
      likes: Math.round(row[4] * 0.041),
      description: 'Dans cette vidéo : ' + title.toLowerCase() +
        '.\n\nSommaire\n00:00 Introduction\n01:30 Le principe\n06:10 Mise en pratique\n' +
        Math.floor(row[3] / 120) + ':00 Conclusion\n\n' +
        'Pour soutenir la chaîne : abonne-toi et laisse un commentaire, ça aide beaucoup.\n' +
        'Tous les fichiers de démonstration sont libres de droits.'
    };
  });

  var COMMENT_SEEDS = [
    ['Nina R.', 'Clair, calme, sans blabla. Exactement ce que je cherchais.', 212, 1],
    ['Yacine', 'Le passage à 06:10 m’a débloqué un truc, merci !', 97, 2],
    ['Claire D.', 'Tu pourrais faire une suite plus avancée ?', 54, 3],
    ['Marc', 'Je regarde en 1,25× et c’est parfait.', 31, 5],
    ['Sofia', 'La qualité du son s’est vraiment améliorée ces derniers mois.', 18, 8],
    ['Pierre-Louis', 'Petite coquille dans le chapitrage, mais rien de grave.', 7, 11]
  ];

  function commentsFor(video) {
    var n = 3 + (video.title.length % 4);
    return COMMENT_SEEDS.slice(0, n).map(function (c, i) {
      return {
        id: video.id + '-c' + i,
        author: c[0],
        text: c[1],
        likes: c[2],
        published: now - c[3] * DAY,
        replies: i === 0
          ? [{ id: video.id + '-r0', author: 'Vidflow', text: 'Merci pour ton retour !', likes: 12, published: now - DAY }]
          : []
      };
    });
  }

  global.DB = {
    channels: CHANNELS,
    videos: VIDEOS,
    categories: CATEGORIES,
    commentsFor: commentsFor,
    channel: function (id) {
      return CHANNELS.filter(function (c) { return c.id === id; })[0] || null;
    },
    video: function (id) {
      return VIDEOS.filter(function (v) { return v.id === id; })[0] || null;
    }
  };
})(window);
