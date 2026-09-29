// Trophées, secrets, séries de jours et défis : tout se calcule à partir du classeur.
// Les données de progression locales (scans, jours, défis) restent sur l'appareil.
const LS = 'tdd_game';
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const save = g => { try { localStorage.setItem(LS, JSON.stringify(g)); } catch { } };
export const G = load();
G.seen ||= []; G.days ||= []; G.count ||= {}; G.flags ||= {};
const today = () => new Date().toISOString().slice(0, 10);

// ---------- événements comptés (scan, authentification, clics secrets…) ----------
export function track(ev, n = 1) {
  G.count[ev] = (G.count[ev] || 0) + n;
  if (ev === 'add') { const h = new Date().getHours(); if (h < 5) G.flags.night = 1; if (h >= 5 && h < 7) G.flags.early = 1; G.daily ||= {}; if (G.daily.d !== today()) G.daily = { d: today(), add: 0 }; G.daily.add++; }
  save(G);
}
export function flag(k) { G.flags[k] = 1; save(G); }
export function visit() {
  const d = today(); if (!G.days.includes(d)) { G.days.push(d); G.days = G.days.slice(-60); save(G); }
}
function streak() {
  let s = 0; const set = new Set(G.days); const d = new Date();
  for (; ; d.setDate(d.getDate() - 1)) { if (set.has(d.toISOString().slice(0, 10))) s++; else if (s || d.toISOString().slice(0, 10) !== today()) break; }
  return s;
}

// ---------- noms (FR + EN, pour les cartes de toutes les langues) ----------
const has = (st, ...names) => names.some(n => st.names.some(x => x.includes(n)));
const all = (st, groups) => groups.every(g => has(st, ...g));
const EEVEE = [['aquali', 'vaporeon'], ['voltali', 'jolteon'], ['pyroli', 'flareon'], ['mentali', 'espeon'], ['noctali', 'umbreon'], ['phyllali', 'leafeon'], ['givrali', 'glaceon'], ['nymphali', 'sylveon']];
const STARTERS = [['bulbizarre', 'bulbasaur'], ['salamèche', 'charmander'], ['carapuce', 'squirtle']];
const BIRDS = [['artikodin', 'articuno'], ['électhor', 'zapdos'], ['sulfura', 'moltres']];

// ---------- statistiques ----------
export function stats(rows, coll, profile) {
  const st = { uniq: 0, qty: 0, dbl: 0, value: 0, top: 0, langs: new Set(), sets: {}, series: new Set(), names: [], rar: {}, oldest: 9999, jp: 0, secretRare: 0, first: 0, n151: 0 };
  for (const r of rows) {
    const q = coll[r.id] || 0; if (!q) continue;
    st.uniq++; st.qty += q; st.dbl += q - 1; st.value += q * (r.price_eur || 0); st.top = Math.max(st.top, r.price_eur || 0);
    st.langs.add(r.lang); if (r.serie_id) st.series.add(r.serie_id); if (r.lang === 'ja') st.jp++;
    const s = st.sets[r.set_id] ||= { own: 0, total: r.set_total || 0 }; if (r.num && r.num <= s.total) s.own++;
    if (r.num && s.total && r.num > s.total) st.secretRare++;
    if (r.num === 1) st.first++; if (r.num === 151) st.n151++;
    if (r.released) st.oldest = Math.min(st.oldest, +r.released.slice(0, 4));
    st.names.push(`${r.name} ${r.name_fr || ''}`.toLowerCase());
    const ra = (r.rarity || '').toLowerCase(); st.rar[ra] = (st.rar[ra] || 0) + 1;
  }
  const pcts = Object.values(st.sets).map(s => s.total ? s.own / s.total : 0);
  st.bestPct = Math.max(0, ...pcts); st.setsHalf = pcts.filter(p => p >= .5).length; st.setsFull = pcts.filter(p => p >= 1).length;
  const rc = k => Object.entries(st.rar).filter(([r]) => r.includes(k)).reduce((a, [, n]) => a + n, 0);
  st.holo = rc('holo'); st.ultra = rc('ultra'); st.ir = rc('illustration'); st.sir = rc('special illustration') + rc('spéciale'); st.hyper = rc('hyper') + rc('secret') + rc('gold');
  st.trades = profile?.trades_done || 0; st.fil = profile?.filleuls || 0; st.streak = streak(); st.c = G.count; st.f = G.flags;
  return st;
}

// ---------- trophées ----------
// [id, icône, nom, description, palier, test, progression?]  palier : 1 bronze, 2 argent, 3 or, 4 légendaire. secret = description cachée (énigme affichée)
const T = (id, ic, name, desc, tier, test, prog, riddle) => ({ id, ic, name, desc, tier, test, prog, riddle });
const P = (cur, max) => [Math.min(cur, max), max];
export const BADGES = {
  'Collection': [
    T('c1', '🃏', 'Première carte', 'Ajoute ta première carte.', 1, s => s.uniq >= 1, s => P(s.uniq, 1)),
    T('c50', '📚', 'Classeur entamé', '50 cartes différentes.', 1, s => s.uniq >= 50, s => P(s.uniq, 50)),
    T('c250', '🗃️', 'Collectionneur', '250 cartes différentes.', 2, s => s.uniq >= 250, s => P(s.uniq, 250)),
    T('c1000', '🏛️', 'Conservateur', '1 000 cartes différentes.', 3, s => s.uniq >= 1000, s => P(s.uniq, 1000)),
    T('c5000', '🐉', 'Encyclopédie vivante', '5 000 cartes différentes.', 4, s => s.uniq >= 5000, s => P(s.uniq, 5000)),
    T('d1', '♊', 'Premier double', 'Possède une carte en 2 exemplaires.', 1, s => s.dbl >= 1, s => P(s.dbl, 1)),
    T('d50', '🎴', 'Montagne de doubles', '50 doubles à échanger.', 2, s => s.dbl >= 50, s => P(s.dbl, 50)),
    T('v100', '💶', 'Petit trésor', 'Collection estimée à 100 €.', 1, s => s.value >= 100, s => P(Math.round(s.value), 100)),
    T('v1000', '💰', 'Coffre-fort', 'Collection estimée à 1 000 €.', 3, s => s.value >= 1000, s => P(Math.round(s.value), 1000)),
    T('v10k', '👑', 'Dragon sur son trésor', 'Collection estimée à 10 000 €.', 4, s => s.value >= 10000, s => P(Math.round(s.value), 10000))
  ],
  'Extensions': [
    T('s50', '🌗', 'Mi-parcours', 'Complète une extension à 50 %.', 1, s => s.bestPct >= .5, s => P(Math.round(s.bestPct * 100), 50)),
    T('s90', '🎯', 'Presque !', 'Complète une extension à 90 %.', 2, s => s.bestPct >= .9, s => P(Math.round(s.bestPct * 100), 90)),
    T('s100', '🏆', 'Set complet', 'Complète une extension à 100 %.', 3, s => s.setsFull >= 1, s => P(Math.round(s.bestPct * 100), 100)),
    T('s5', '🏅', 'Maître des extensions', '5 extensions complètes.', 4, s => s.setsFull >= 5, s => P(s.setsFull, 5)),
    T('sh5', '🧭', 'Explorateur', '5 extensions à moitié remplies.', 2, s => s.setsHalf >= 5, s => P(s.setsHalf, 5)),
    T('se5', '🗺️', 'Voyageur des époques', 'Des cartes de 5 séries différentes.', 2, s => s.series.size >= 5, s => P(s.series.size, 5))
  ],
  'Langues': [
    T('l2', '🗣️', 'Polyglotte', 'Des cartes dans 2 langues.', 1, s => s.langs.size >= 2, s => P(s.langs.size, 2)),
    T('l4', '🌍', 'Globe-trotter', 'Des cartes dans 4 langues.', 2, s => s.langs.size >= 4, s => P(s.langs.size, 4)),
    T('l7', '🛸', 'Citoyen du monde', 'Des cartes dans les 7 langues.', 4, s => s.langs.size >= 7, s => P(s.langs.size, 7)),
    T('jp10', '🗾', 'Nippon', '10 cartes japonaises.', 2, s => s.jp >= 10, s => P(s.jp, 10))
  ],
  'Raretés': [
    T('r_holo', '✨', 'Ça brille !', 'Une carte holographique.', 1, s => s.holo >= 1),
    T('r_ultra', '💎', 'Ultra', 'Une Ultra Rare.', 2, s => s.ultra >= 1),
    T('r_ir', '🎨', 'Amateur d\'art', '5 Illustrations Rares.', 2, s => s.ir >= 5, s => P(s.ir, 5)),
    T('r_sir', '🖼️', 'Galerie privée', 'Une Illustration Spéciale Rare.', 3, s => s.sir >= 1),
    T('r_top', '🔥', 'Pièce maîtresse', 'Une carte cotée 100 € ou plus.', 3, s => s.top >= 100, s => P(Math.round(s.top), 100))
  ],
  'Pokémon': [
    T('p_pika', '⚡', 'Pika pika !', 'Un Pikachu dans ton classeur.', 1, s => has(s, 'pikachu')),
    T('p_char', '🔥', 'Fan de Dracaufeu', '3 Dracaufeu différents.', 2, s => s.names.filter(n => n.includes('dracaufeu') || n.includes('charizard')).length >= 3, s => P(s.names.filter(n => n.includes('dracaufeu') || n.includes('charizard')).length, 3)),
    T('p_start', '🌱', 'Trio de Kanto', 'Bulbizarre, Salamèche et Carapuce.', 2, s => all(s, STARTERS))
  ],
  'Échanges': [
    T('t1', '🤝', 'Première poignée de main', 'Termine une transaction.', 1, s => s.trades >= 1, s => P(s.trades, 1)),
    T('t10', '🏪', 'Marchand', '10 transactions terminées.', 2, s => s.trades >= 10, s => P(s.trades, 10)),
    T('t50', '🎩', 'Négociant légendaire', '50 transactions terminées.', 4, s => s.trades >= 50, s => P(s.trades, 50)),
    T('amb1', '📣', 'Ambassadeur', 'Parraine 1 collectionneur actif.', 1, s => s.fil >= 1, s => P(s.fil, 1)),
    T('amb5', '🎺', 'Ambassadeur d\'argent', '5 filleuls actifs.', 2, s => s.fil >= 5, s => P(s.fil, 5)),
    T('amb20', '👑', 'Ambassadeur légendaire', '20 filleuls actifs.', 4, s => s.fil >= 20, s => P(s.fil, 20)),
    T('scan10', '📷', 'Œil de lynx', 'Scanne 10 cartes.', 1, s => (s.c.scan || 0) >= 10, s => P(s.c.scan || 0, 10)),
    T('auth1', '🔍', 'Détective', 'Fais un contrôle d\'authenticité.', 1, s => (s.c.auth || 0) >= 1),
    T('st7', '📅', 'Assidu', 'Ouvre ton classeur 7 jours de suite.', 2, s => s.streak >= 7, s => P(s.streak, 7)),
    T('st30', '🗓️', 'Inarrêtable', '30 jours de suite.', 4, s => s.streak >= 30, s => P(s.streak, 30))
  ],
  'Secrets': [
    T('x_catch', '🫧', 'Attrapeur', 'Attrape 10 créatures qui traversent le site.', 3, s => (s.c.catch || 0) >= 10, s => P(s.c.catch || 0, 10), 'Certaines choses passent… si l\'on est assez vif.'),
    T('x_eevee', '🦊', 'Évolitions au complet', 'Les 8 évolutions d\'Évoli.', 4, s => all(s, EEVEE), null, 'Un petit renard aux huit destins…'),
    T('x_birds', '🐦', 'Trio céleste', 'Artikodin, Électhor et Sulfura.', 3, s => all(s, BIRDS), null, 'Glace, foudre et feu volent ensemble.'),
    T('x_gene', '🧬', 'Génétique', 'Mew et Mewtwo.', 3, s => has(s, 'mewtwo') && s.names.some(n => /\bmew\b/.test(n) && !n.includes('mewtwo')), null, 'L\'original et sa copie.'),
    T('x_magi', '🐟', 'Patience récompensée', 'Magicarpe et Léviator.', 2, s => has(s, 'magicarpe', 'magikarp') && has(s, 'léviator', 'gyarados'), null, 'Le plus faible deviendra le plus terrible.'),
    T('x_ditto', '🟣', 'Qui suis-je ?', 'Un Métamorph.', 2, s => has(s, 'métamorph', 'ditto'), null, 'Il peut devenir n\'importe qui.'),
    T('x_one', '1️⃣', 'Numéro un', 'Une carte n°1 d\'une extension.', 1, s => s.first >= 1, null, 'Tout commence quelque part.'),
    T('x_151', '🔢', 'Le compte est bon', 'Une carte portant le n°151.', 2, s => s.n151 >= 1, null, 'Le nombre mythique de la première génération.'),
    T('x_secret', '🌟', 'Au-delà du set', 'Une carte secrète (numéro plus grand que le total du set).', 3, s => s.secretRare >= 1, null, 'Son numéro dépasse le compte officiel.'),
    T('x_arch', '🦴', 'Archéologue', 'Une carte sortie avant 2003.', 3, s => s.oldest < 2003, null, 'Déterre une relique du siècle dernier.'),
    T('x_night', '🦉', 'Oiseau de nuit', 'Ajoute une carte entre minuit et 5 h.', 2, s => !!s.f.night, null, 'Certains collectionnent quand tout le monde dort.'),
    T('x_early', '🐓', 'Lève-tôt', 'Ajoute une carte entre 5 h et 7 h.', 2, s => !!s.f.early, null, 'Le premier réveillé a le meilleur booster.'),
    T('x_logo', '🎲', 'Curieux', 'Touche le logo 7 fois de suite.', 1, s => !!s.f.logo, null, 'Le logo cache quelque chose…'),
    T('x_trio', '🍀', 'Chanceux', 'Réussis le défi du jour 3 fois.', 2, s => (s.c.daily || 0) >= 3, null, 'Reviens chaque jour relever le défi.')
  ]
};
const LIST = Object.values(BADGES).flat();
const XP = [0, 10, 25, 60, 150];
export const TITLES = ['Dresseur débutant', 'Dresseur', 'Collectionneur', 'Champion d\'arène', 'Membre du Conseil 4', 'Maître des cartes', 'Légende vivante'];

export function evaluate(st) {
  const got = LIST.filter(b => { try { return b.test(st); } catch { return false; } });
  const xp = got.reduce((a, b) => a + XP[b.tier], 0) + st.uniq + st.dbl + st.trades * 20;
  const lvl = Math.floor(Math.sqrt(xp / 20)) + 1, cur = 20 * (lvl - 1) ** 2, nxt = 20 * lvl ** 2;
  return { got, ids: new Set(got.map(b => b.id)), xp, lvl, pct: Math.round((xp - cur) / (nxt - cur) * 100), title: TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 3))], total: LIST.length };
}
export function newlyUnlocked(ev) {
  const fresh = ev.got.filter(b => !G.seen.includes(b.id));
  if (fresh.length) { G.seen.push(...fresh.map(b => b.id)); save(G); }
  return fresh;
}

// ---------- défi du jour ----------
export function daily() {
  const n = [3, 5, 2, 4][new Date().getDay() % 4];
  G.daily ||= {}; if (G.daily.d !== today()) { G.daily = { d: today(), add: 0 }; save(G); }
  const done = G.daily.add >= n;
  if (done && !G.daily.ok) { G.daily.ok = 1; track('daily'); }
  return { n, cur: Math.min(G.daily.add, n), done };
}

// ---------- rendu ----------
const TIER = ['', 'Bronze', 'Argent', 'Or', 'Légendaire'];
export function renderTrophies(ev, st, esc) {
  return Object.entries(BADGES).map(([cat, list]) => {
    const n = list.filter(b => ev.ids.has(b.id)).length;
    return `<h2>${esc(cat)} <span class="mut small">${n}/${list.length}</span></h2><div class="trophies">${list.map(b => {
      const on = ev.ids.has(b.id), secret = b.riddle && !on, pr = !on && b.prog ? b.prog(st) : null;
      return `<div class="trophy t${b.tier} ${on ? 'on' : ''}"><div class="ti">${secret ? '❓' : b.ic}</div><div><b>${secret ? 'Trophée secret' : esc(b.name)}</b><span class="tier">${TIER[b.tier]}</span>
        <p>${secret ? '<i>« ' + esc(b.riddle) + ' »</i>' : esc(b.desc)}</p>${pr ? `<div class="xp"><i style="width:${Math.round(pr[0] / pr[1] * 100)}%"></i></div><small class="mut">${pr[0]} / ${pr[1]}</small>` : ''}</div></div>`;
    }).join('')}</div>`;
  }).join('');
}
export function celebrate(badges, esc) {
  if (!badges.length) return;
  const b = badges[0], box = document.createElement('div');
  box.className = 'unlock'; box.setAttribute('role', 'status');
  box.innerHTML = `<div class="burst">${Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * 25.7}deg;--d:${(i % 3) * 60}ms"></i>`).join('')}</div><div class="ti">${b.ic}</div><div><small>${badges.length > 1 ? badges.length + ' nouveaux trophées !' : 'Nouveau trophée !'}</small><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`;
  document.body.append(box); setTimeout(() => box.classList.add('out'), 3600); setTimeout(() => box.remove(), 4200);
}
