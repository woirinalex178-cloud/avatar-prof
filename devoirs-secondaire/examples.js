// Contenus d'exemple, sans appel IA ni connexion ENT. Le programme complet reste à construire.
window.secondaireExamples = (date, profil) => {
  const frise = [
    { annee: 1789, label: '14 juillet 1789', texte: 'Prise de la Bastille' },
    { annee: 1789, label: '26 août 1789', texte: 'Déclaration des droits de l’homme et du citoyen' },
    { annee: 1792, label: '22 septembre 1792', texte: 'Début de la Première République' },
    { annee: 1804, label: '2 décembre 1804', texte: 'Sacre de Napoléon Ier' },
  ];
  return [{
    devoir: { matiere: 'Histoire', consigne: 'Exemple : replacer quatre repères de la Révolution et de l’Empire.', pour: date, source: 'demo', profil: { ...profil } },
    pack: {
      type: 'revision', titre: 'De la Révolution à l’Empire', duree_min: 5,
      fiche: { intro: 'Exemple illustratif : quatre repères pour comprendre des changements de régime.',
        sections: [{ titre: 'Un pouvoir qui change de mains', points: ['En 1789, la Révolution remet en cause la monarchie absolue et les privilèges.', 'En septembre 1792, la monarchie est abolie et la République commence.', 'En 1804, Napoléon Bonaparte devient empereur.'], exemple: 'Une frise permet de distinguer la succession des régimes et la durée entre les événements.' }],
        a_retenir: ['1789 : début de la Révolution française.', '1792 : début de la Première République.', '1804 : début du Premier Empire.'],
        astuce: 'Associe chaque date à un changement précis, puis explique-le avec tes mots.',
        pieges: ['La Révolution ne se résume pas à un événement unique.', 'Les droits proclamés en 1789 ne signifient pas une égalité politique effective pour toutes et tous.'],
        frise, personnages: [{ nom: 'Napoléon Bonaparte', wiki: 'Napoléon Ier', dates: '1769–1821', role: 'Général, Premier consul puis empereur des Français.', a_retenir: 'Il devient empereur en 1804 : un nouveau régime après la période révolutionnaire.' }], carte: null, visuels: true },
      questions: [
        { type: 'frise', niveau: 1, enonce: 'Complète les deux repères manquants.', items: frise, trous: [1, 2], explication: 'La Déclaration date de 1789 ; la République débute en 1792.' },
        { type: 'qcm', niveau: 1, enonce: 'En quelle année commence la Première République ?', choix: ['1789', '1792', '1804'], reponse: '1792', explication: 'La monarchie est abolie le 21 septembre 1792 ; le 22 marque le début de la République.' },
        { type: 'vraifaux', niveau: 2, enonce: 'Napoléon est déjà empereur lors de la prise de la Bastille.', reponse: 'Faux', explication: 'La Bastille est prise en 1789. Napoléon devient empereur en 1804.' },
      ],
    },
  }, {
    devoir: { matiere: 'Géographie', consigne: 'Exemple : situer Paris, Lyon et Marseille sur une carte muette.', pour: date, source: 'demo', profil: { ...profil } },
    pack: { type: 'exercice', titre: 'Trois villes, trois repères', duree_min: 4,
      fiche: { intro: 'Repère les villes sur la carte puis retrouve leurs noms dans l’exercice.', sections: [{ titre: 'Se repérer', points: ['Paris se trouve dans le nord de la France métropolitaine.', 'Lyon se situe dans le sud-est, au confluent du Rhône et de la Saône.', 'Marseille est un port méditerranéen.'], exemple: 'Compare la position de Marseille et de Lyon : Marseille est plus au sud.' }], a_retenir: ['Lis l’orientation et compare la position des villes.'], astuce: 'Repère d’abord le littoral et les grandes directions.', pieges: [], frise: [], personnages: [], visuels: true,
        carte: { titre: 'Paris, Lyon, Marseille', lieux: [{ nom: 'Paris', lat: 48.8566, lon: 2.3522 }, { nom: 'Lyon', lat: 45.764, lon: 4.8357 }, { nom: 'Marseille', lat: 43.2965, lon: 5.3698 }] } },
      questions: [{ type: 'carte', niveau: 1, enonce: 'Retrouve le nom de chaque ville numérotée.', lieux: [{ nom: 'Paris', lat: 48.8566, lon: 2.3522 }, { nom: 'Lyon', lat: 45.764, lon: 4.8357 }, { nom: 'Marseille', lat: 43.2965, lon: 5.3698 }], explication: 'Paris est au nord, Lyon dans le sud-est et Marseille sur le littoral méditerranéen.' }],
    },
  }];
};
