// Mes devoirs malins : devoirs (ONE / photo / fichier / texte) -> entraînement adapté généré par l'IA,
// sauvegardé et partagé entre appareils grâce au code famille.
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// État complet, identique sur tous les appareils après synchro.
let S = Object.assign({ devoirs: [], packs: {}, results: {}, deleted: {}, jours: [], fiches: {} }, store.get('etat', {}));
// reprise des anciennes clés (avant la synchro)
if (!S.devoirs.length && store.get('devoirs')) Object.assign(S, { devoirs: store.get('devoirs', []), packs: store.get('packs', {}), results: store.get('results', {}) });

const busy = new Set();
const KIND = { exercice: 'Petit exercice', revision: 'Révision', evaluation: 'Évaluation blanche' };
const MEDAL = r => (!r.score && r.best20 != null ? '🎯' : r.score / r.total >= .8 ? '🏆' : r.score / r.total >= .5 ? '🥈' : '💪');
const EMOJI = [[/math|calcul|fraction|g[ée]om|nombre|table|probl/i, '🔢'], [/dict[ée]e|orthog|conjug|gramm|vocab|fran[cç]/i, '✍️'],
  [/lecture|lire|livre|r[ée]cit/i, '📖'], [/po[ée]s|r[ée]citation/i, '🎭'], [/hist/i, '🏰'], [/g[ée]o/i, '🌍'],
  [/scien|svt|corps|plan[eè]te|anim|v[ée]g[ée]t/i, '🔬'], [/angl|english/i, '🇬🇧'], [/musi|chant/i, '🎵'], [/emc|civi/i, '🤝']];
const emojiOf = d => (EMOJI.find(([re]) => re.test(d.matiere + ' ' + d.consigne)) || [0, '📚'])[1];
const TIPS = ['Une photo de ton cahier et je prépare tout ! 📸', 'Apprendre un peu chaque jour, c\'est le secret des champions 🧠',
  'Lis bien le mémo avant de commencer 📌', 'Une erreur, c\'est une chance d\'apprendre ✨', 'Tu peux refaire un entraînement autant de fois que tu veux 🔁'];

const today = () => new Date().toLocaleDateString('sv');   // AAAA-MM-JJ, heure locale
const idOf = d => (d.pour + '|' + d.matiere + '|' + d.consigne).toLowerCase().replace(/\s+/g, ' ');
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const show = v => { ['pin', 'home', 'train', 'fiches', 'fiche'].forEach(n => $('#v-' + n).hidden = n !== v); scrollTo(0, 0); if (v !== 'pin') stats(); };
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SIZE = { exercice: 4, revision: 8, evaluation: 12 };
const status = t => { $('#status').textContent = t || ''; $('#status').hidden = !t; };

async function api(path, body) {
  const r = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-pin': store.get('pin', '') },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { store.set('pin', ''); show('pin'); }
  if (r.status === 413) throw new Error('Fichier trop lourd (4 Mo maximum)');
  if (!r.ok) throw new Error(d.error || 'Erreur ' + r.status);
  return d;
}

// ---------- Sauvegarde locale + synchro entre appareils ----------
let syncTimer, syncing = false, again = false;
function save() { store.set('etat', S); clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }

// Même fusion que le serveur (api/sync.js) : rien ne se perd entre appareils ni pendant une synchro.
const later = (x, y) => ((x?.at || 0) >= (y?.at || 0) ? x : y);
function merge(a = {}, b = {}) {
  const deleted = { ...a.deleted, ...b.deleted }, devoirs = {};
  for (const d of [...(a.devoirs || []), ...(b.devoirs || [])]) if (d?.id && !deleted[d.id]) devoirs[d.id] = d;
  const pick = (x = {}, y = {}, all) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter(id => all || devoirs[id]).map(id => [id, later(x[id], y[id])]));
  return { devoirs: Object.values(devoirs).sort((p, q) => p.pour.localeCompare(q.pour)), packs: pick(a.packs, b.packs),
    results: pick(a.results, b.results), deleted, fiches: pick(a.fiches, b.fiches, true), profil: later(a.profil, b.profil),
    jours: [...new Set([...(a.jours || []), ...(b.jours || [])])].sort().slice(-60) };
}

async function sync() {
  if (!store.get('pin', '')) return;
  if (syncing) { again = true; return; }
  syncing = true; $('#cloud').className = 'pill cloud busy';
  try {
    const r = await api('sync', S);
    if (!r.off) {
      // Fusion (et non remplacement) : garde ce qui a été ajouté pendant l'aller-retour (ex. devoirs ONE).
      const local = S; S = merge(r, local); store.set('etat', S);
      if (S.devoirs.length !== r.devoirs.length || Object.keys(S.packs).length !== Object.keys(r.packs || {}).length) again = true;
    }
    $('#cloud').className = 'pill cloud' + (r.off ? ' off' : '');
    $('#cloud').title = r.off ? 'Synchro non configurée' : 'Sauvegardé sur tous les appareils';
    if (!$('#v-home').hidden) render();
    if (document.activeElement !== $('#commune')) $('#commune').value = S.profil?.commune || '';
    if (!$('#v-fiches').hidden) renderFiches();
    prepareAll();
  } catch { $('#cloud').className = 'pill cloud off'; $('#cloud').title = 'Hors ligne : sauvegardé sur cet appareil'; }
  finally { syncing = false; if (again) { again = false; sync(); } }
}

function addDevoirs(list) {
  let n = 0;
  for (const d of list || []) {
    if (!d.consigne) continue;
    const x = { matiere: d.matiere || 'Devoir', consigne: d.consigne, pour: d.pour || today(), source: d.source || 'cahier' };
    x.id = idOf(x);
    if (!S.devoirs.some(o => o.id === x.id)) { S.devoirs.push(x); delete S.deleted[x.id]; n++; }
  }
  const limit = new Date(Date.now() - 7 * 864e5).toLocaleDateString('sv');   // 7 jours d'historique
  S.devoirs = S.devoirs.filter(d => d.pour >= limit).sort((a, b) => a.pour.localeCompare(b.pour));
  save(); render(); prepareAll();
  return n;
}

// ---------- Affichage ----------
const fmt = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const daysTo = iso => Math.round((new Date(iso + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);

function streak() {
  const set = new Set(S.jours); let n = 0;
  const d = new Date(); if (!set.has(today())) d.setDate(d.getDate() - 1);   // la série tient jusqu'à ce soir
  while (set.has(d.toLocaleDateString('sv'))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function stats() {
  $('#stars').textContent = Object.values(S.results).reduce((a, r) => a + (r.score || 0) + (r.best20 || 0), 0);
  $('#streak').textContent = streak();
}

function render() {
  stats();
  const ul = $('#list'); ul.replaceChildren();
  const up = S.devoirs.filter(d => d.pour >= today());
  $('#empty').hidden = up.length > 0;
  let jour = '';
  for (const d of up) {
    if (d.pour !== jour) {   // un titre par jour : « 📅 Demain · mardi 6 octobre »
      jour = d.pour; const k = daysTo(jour);
      const rel = k === 0 ? "Aujourd'hui" : k === 1 ? 'Demain' : `Dans ${k} jours`;
      ul.append(el('li', 'dayhead' + (k <= 1 ? ' soon' : ''), `📅 ${rel} · ${fmt(jour)}`));
    }
    const p = S.packs[d.id], r = S.results[d.id], j = daysTo(d.pour);
    const li = el('li', 'item' + (p ? ' k-' + p.type : ''));
    const when = el('span', 'when ' + (j <= 1 ? 'soon' : j <= 3 ? 'mid' : 'far'),
      '⏰ ' + (j === 0 ? "Pour aujourd'hui" : j === 1 ? 'Pour demain' : 'Pour ' + fmt(d.pour)));
    li.append(el('span', 'emoji', emojiOf(d)), el('h3', null, d.matiere), el('p', null, d.consigne), when);
    const foot = el('div', 'foot');
    if (p) {
      foot.append(el('span', 'tag', `${KIND[p.type] || 'Entraînement'} · ${p.duree_min || '?'} min`));
      if (r) foot.append(el('span', 'medal', MEDAL(r)));
      foot.append(el('span', 'grow'));
      const f = el('button', 'btn alt sm', '📘 Fiche'); f.onclick = () => openFiche(d.id, 'home');
      const b = el('button', 'btn sm', r ? '🔁 Rejouer' : "C'est parti !"); b.onclick = () => train(d);
      foot.append(f, b);
      if (p.type === 'evaluation') {
        const g = el('button', 'btn goal sm', r?.best20 != null ? `🎯 ${r.best20}/20` : '🎯 Objectif 20/20');
        g.onclick = () => train(d, true); foot.append(g);
      }
    } else if (busy.has(d.id)) {
      foot.innerHTML = '<span class="small mut"><i class="spin"></i> 🦉 Je prépare ta mission…</span><span class="grow"></span>';
    } else {
      foot.append(el('span', 'grow'));
      const b = el('button', 'btn alt', 'Préparer'); b.onclick = () => prepare(d); foot.append(b);
    }
    const del = el('button', 'ghost', '🗑️'); del.title = 'Supprimer'; del.setAttribute('aria-label', 'Supprimer');
    del.onclick = () => {
      if (!confirm('Supprimer ce devoir ?')) return;
      S.devoirs = S.devoirs.filter(x => x.id !== d.id); delete S.packs[d.id]; delete S.results[d.id];   // la fiche reste dans la bibliothèque
      S.deleted[d.id] = Date.now(); save(); render();
    };
    foot.append(del);
    li.append(foot); ul.append(li);
  }
}

async function prepare(d) {
  if (busy.has(d.id) || S.packs[d.id]) return;
  busy.add(d.id); render();
  try {
    const p = { ...(await api('generate', { action: 'make', devoir: d, profil: S.profil })), at: Date.now() };
    S.packs[d.id] = p;
    S.fiches[d.id] = { matiere: d.matiere, consigne: d.consigne, titre: p.titre, type: p.type, fiche: { ...ficheOf(p), visuels: 2 }, date: today(), at: Date.now() };
    save();
  }
  catch (e) { status('⚠️ ' + e.message); }
  busy.delete(d.id); render();
}

// Automatique : prépare chaque devoir à venir, un par un (quota gratuit).
async function prepareAll() {
  for (const d of S.devoirs.filter(d => d.pour >= today() && !S.packs[d.id])) await prepare(d);
}

async function syncOne() {
  try {
    const r = await api('one');
    const n = addDevoirs(r.devoirs);
    if (n) status(`🏫 ${n} nouveau(x) devoir(s) depuis ONE ✔`);
    else if (r.info && r.info !== 'ONE non configuré') console.info(r.info);
  } catch (e) { status('🏫 ONE : ' + e.message); }
}

// ---------- Ajout : photo / fichier / texte ----------
function compress(file) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: img.width * s, height: img.height * s });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = ko; img.src = URL.createObjectURL(file);
  });
}
const readAs = (file, how) => new Promise((ok, ko) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r[how](file);
});

async function lire({ fichier, extra = '' } = {}) {
  const texte = [$('#txt').value.trim(), extra].filter(Boolean).join('\n');
  if (!fichier && !texte) return;
  status(fichier ? '🦉 Je lis ton document…' : '🦉 Je lis ton texte…');
  try {
    const r = await api('generate', { action: 'read', image: fichier, texte });
    const n = addDevoirs((r.devoirs || []).map(d => ({ ...d, source: fichier ? 'fichier' : 'texte' })));
    if (n) $('#txt').value = '';
    status(n ? `🎉 ${n} devoir(s) trouvé(s) ! Je prépare tes missions…`
      : '🤔 Je n\'ai pas trouvé de nouveau devoir. Écris-le avec tes mots juste en dessous.');
  } catch (err) { status('⚠️ ' + err.message); }
}

async function onFile(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    if (f.type.startsWith('image/')) return lire({ fichier: await compress(f) });
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      if (f.size > 3e6) return status('⚠️ PDF trop lourd (3 Mo maximum). Fais plutôt une capture d\'écran.');
      return lire({ fichier: await readAs(f, 'readAsDataURL') });
    }
    if (f.type.startsWith('text/') || /\.txt$/i.test(f.name)) return lire({ extra: (await readAs(f, 'readAsText')).slice(0, 4000) });
    status('⚠️ Format non lu. Utilise une photo, un PDF ou un fichier texte.');
  } catch { status('⚠️ Impossible de lire ce fichier.'); }
}
$('#photo').onchange = onFile;
$('#file').onchange = onFile;
$('#f-txt').onsubmit = e => { e.preventDefault(); lire(); };

// ---------- Entraînement ----------
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.]+/g, ' ').replace(/\b(le|la|les|l|un|une|des)\b/g, '').replace(/\s+/g, ' ').trim();
const BRAVO = ['Bravo ! ', 'Super ! ', 'Génial ! ', 'Exactement ! ', 'Tu gères ! '];

// Tire des questions variées : d'abord les moins vues, ordre progressif, propositions mélangées.
function draw(p, n) {
  p.vus ||= {};
  const idx = shuffle(p.questions.map((_, i) => i)).sort((a, b) => (p.vus[a] || 0) - (p.vus[b] || 0)).slice(0, n);
  idx.forEach(i => p.vus[i] = (p.vus[i] || 0) + 1);
  p.at = Date.now();
  return idx.map(i => ({ ...p.questions[i], choix: shuffle(p.questions[i].choix || []) }))
    .sort((a, b) => (a.niveau || 2) - (b.niveau || 2));
}

// Ajoute de nouvelles questions à la banque (jamais les mêmes).
async function more(d, n = 12) {
  const r = await api('generate', { action: 'more', profil: S.profil, devoir: d, deja: S.packs[d.id].questions.map(q => q.enonce), n });
  const p = S.packs[d.id];   // relu après l'attente : la synchro a pu remplacer l'objet
  if (!p) return;
  const seen = new Set(p.questions.map(q => norm(q.enonce)));
  for (const q of r.questions || []) if (q.enonce && !seen.has(norm(q.enonce))) { seen.add(norm(q.enonce)); p.questions.push(q); }
  p.vus ||= {}; p.at = Date.now(); save();
}
const unseen = p => p.questions.filter((_, i) => !(p.vus || {})[i]).length;

async function train(d, goal = false) {
  let p = S.packs[d.id];
  const n = goal ? 20 : Math.min(SIZE[p.type] || 8, p.questions.length);
  if (goal && p.questions.length < 20) {
    status('🦉 Je prépare 20 questions pour ton objectif 20/20…');
    try { await more(d, 20 - p.questions.length + 4); p = S.packs[d.id]; } catch (e) { return status('⚠️ ' + e.message); }
    status('');
  }
  const qs = draw(p, n);
  if (unseen(p) < n) more(d).catch(() => {});   // en arrière-plan : de quoi varier la prochaine fois
  save();

  let k = 0, score = 0, tries = 0;
  const queue = qs.map(q => ({ ...q, first: true }));
  show('train'); status('');
  $('#t-kind').textContent = goal ? '🎯 Objectif 20/20' : KIND[p.type] || 'Entraînement';
  $('#t-kind').className = 'tag k-' + p.type;
  $('#t-title').textContent = emojiOf(d) + ' ' + (p.titre || d.matiere);
  $('#t-kind').textContent += ' · ⏰ pour ' + (daysTo(d.pour) === 0 ? "aujourd'hui" : daysTo(d.pour) === 1 ? 'demain' : fmt(d.pour));
  const f = ficheOf(p), memo = $('#t-memo');
  memo.hidden = !f.a_retenir.length; memo.open = !goal;
  memo.querySelector('ul').replaceChildren(...f.a_retenir.map(m => el('li', null, m)));
  $('#t-fiche').onclick = () => openFiche(d.id, 'train');
  $('#t-end').hidden = true;

  const step = () => {
    const box = $('#t-q'); box.hidden = false; box.replaceChildren();
    const q = queue[k], left = queue.length - k;
    const head = el('div', 'q-head');
    head.append(el('span', null, q.first ? `Question ${qs.indexOf(qs.find(x => x.enonce === q.enonce)) + 1} / ${n}` : '🔁 On réessaie !'), el('span', null, `⭐ ${score}`));
    const bar = el('div', 'bar'), fill = el('i'), rocket = el('span', null, '🚀');
    fill.style.width = rocket.style.left = (Math.min(k, n) / Math.max(queue.length, n) * 100) + '%'; bar.append(fill, rocket);
    box.append(head, bar, el('p', 'q-text', q.enonce));

    const finish = (good, correction) => {
      if (good && q.first) score++;
      tries++;
      // Objectif 20/20 : une question ratée revient à la fin jusqu'à ce qu'elle soit réussie.
      if (!good && goal) queue.push({ ...q, first: false, choix: shuffle(q.choix || []) });
      box.querySelectorAll('button,input,select').forEach(x => x.disabled = true);
      const fb = el('div', 'fb ' + (good ? 'ok' : 'ko'));
      fb.append(el('strong', null, good ? BRAVO[tries % BRAVO.length] : `Presque ! ${correction} `), document.createTextNode(q.explication || ''));
      if (!good && goal) fb.append(el('div', 'small', '🔁 Cette question reviendra à la fin.'));
      const next = el('button', 'btn', k + 1 < queue.length ? 'Suivant →' : 'Voir mon score 🎉');
      next.onclick = () => { k++; k < queue.length ? step() : end(); };
      box.append(fb, next); next.focus();
    };
    const answer = (given, btn) => {
      const good = [q.reponse, ...(q.accepte || [])].some(a => norm(a) === norm(given));
      box.querySelectorAll('.choice').forEach(c => { if (norm(c.textContent) === norm(q.reponse)) c.classList.add('ok'); });
      if (btn && !good) btn.classList.add('ko');
      finish(good, `La réponse : ${q.reponse}.`);
    };
    // Frise / carte à trous : une liste déroulante par trou, on valide quand tout est rempli.
    const holes = (pairs, render) => {
      const opts = shuffle(pairs.map(x => x.attendu));
      const sels = pairs.map(() => {
        const sel = el('select', 'hole'); sel.append(el('option', null, '— choisis —'));
        opts.forEach(o => sel.append(Object.assign(el('option', null, o), { value: o })));
        sel.firstChild.value = ''; return sel;
      });
      render(sels);
      const ok = el('button', 'btn', 'Valider'); ok.disabled = true;
      sels.forEach(x => x.onchange = () => ok.disabled = sels.some(y => !y.value));
      ok.onclick = () => {
        let all = true;
        sels.forEach((x, i) => { const bon = x.value === pairs[i].attendu; all &&= bon; x.classList.add(bon ? 'ok' : 'ko');
          if (!bon) x.after(el('span', 'fix', '→ ' + pairs[i].attendu)); });
        finish(all, 'Regarde les corrections en vert ci-dessus.');
      };
      box.append(ok);
    };

    if (q.type === 'frise' && q.items?.length) {
      const tr = new Set(q.trous?.length ? q.trous : [1]);
      const pairs = q.items.map((it, i) => ({ i, attendu: it.texte })).filter(x => tr.has(x.i));
      holes(pairs, sels => box.append(friseNode(q.items, (it, i) => tr.has(i) ? sels[pairs.findIndex(x => x.i === i)] : null)));
    } else if (q.type === 'schema' && q.etapes?.length) {
      const tr = new Set(q.trous?.length ? q.trous : [1]);
      const pairs = q.etapes.map((e, i) => ({ i, attendu: e.nom })).filter(x => tr.has(x.i));
      holes(pairs, sels => box.append(schemaNode({ forme: q.forme, etapes: q.etapes.map(e => ({ ...e, desc: '' })) },
        (e, i) => tr.has(i) ? sels[pairs.findIndex(x => x.i === i)] : null)));
    } else if (q.type === 'ordre' && q.etapes?.length > 1) {
      // Jeu : toucher les étapes dans le bon ordre.
      const bon = q.etapes.map(e => e.nom);
      let mix = shuffle(q.etapes); while (q.etapes.length > 2 && mix.every((e, i) => e.nom === bon[i])) mix = shuffle(q.etapes);
      const pris = [], rep = el('ol', 'ordre-rep'), pool = el('div', 'choices'), ok = el('button', 'btn', 'Valider');
      const reset = el('button', 'btn alt', '↺ Recommencer'); ok.disabled = true;
      const draw = () => {
        rep.replaceChildren(...pris.map(e => el('li', null, `${e.icone || ''} ${e.nom}`)));
        pool.replaceChildren(...mix.filter(e => !pris.includes(e)).map(e => {
          const b = el('button', 'choice', `${e.icone || ''} ${e.nom}`); b.onclick = () => { pris.push(e); draw(); }; return b;
        }));
        ok.disabled = pris.length < mix.length;
      };
      reset.onclick = () => { pris.length = 0; draw(); };
      ok.onclick = () => {
        let all = true;
        [...rep.children].forEach((li, i) => { const b = pris[i].nom === bon[i]; all &&= b; li.classList.add(b ? 'ok' : 'ko'); });
        reset.disabled = true;
        finish(all, 'Le bon ordre : ' + bon.join(' → ') + '.');
      };
      box.append(el('p', 'small mut', '👆 Touche les étapes dans le bon ordre :'), rep, pool);
      const row = el('div', 'row'); row.append(reset, ok); box.append(row); draw();
    } else if (q.type === 'carte' && carteItems(carteOf(q)).length) {
      const m = el('div', 'map'); box.append(m);
      drawMap(m, q, { quiz: true }).then(items => {
        if (!items.length) return finish(false, 'Carte indisponible : passe à la suite.');
        holes(items.map(it => ({ attendu: it.nom })), sels => {
          const ul = el('ol', 'map-legend'); sels.forEach(x => { const li = el('li'); li.append(x); ul.append(li); }); box.append(ul);
        });
      });
    } else if (q.type === 'courte') {
      const fm = el('form', 'row'), inp = el('input'); inp.placeholder = 'Ta réponse'; inp.autocomplete = 'off';
      fm.append(inp, el('button', 'btn', 'Valider'));
      fm.onsubmit = e => { e.preventDefault(); if (inp.value.trim()) answer(inp.value); };
      box.append(fm); inp.focus();
    } else {
      const c = el('div', 'choices');
      for (const ch of q.type === 'vraifaux' ? ['Vrai', 'Faux'] : q.choix || []) {
        const b = el('button', 'choice', ch); b.onclick = () => answer(ch, b); c.append(b);
      }
      box.append(c);
    }
  };

  const end = () => {
    $('#t-q').hidden = true;
    const pct = score / n, old = S.results[d.id] || {};
    const r = { ...old, at: Date.now() };
    if (goal) r.best20 = Math.max(old.best20 ?? 0, score);
    else if (!old.total || score / n >= old.score / old.total) Object.assign(r, { score, total: n });   // meilleur score
    r.score ??= 0; r.total ??= n;
    S.results[d.id] = r;
    if (!S.jours.includes(today())) S.jours.push(today());
    save();
    const e = $('#t-end'); e.hidden = false; e.replaceChildren(
      el('p', 'trophy', pct === 1 && goal ? '🎯' : pct >= .8 ? '🏆' : pct >= .5 ? '🥈' : '💪'),
      el('p', 'score', `${score} / ${n}`),
      el('p', null, goal
        ? (pct === 1 ? 'OBJECTIF 20/20 ATTEINT ! Tu es incollable 🦉✨' : `Toutes les questions sont maintenant réussies 💪. Ton score du premier coup : ${score}/20. Rejoue pour viser 20/20 !`)
        : pct >= .8 ? 'Excellent, tu es prête ! 🦉 Plume est fière de toi.' : pct >= .5 ? 'Bien joué ! Relis la fiche et rejoue : les questions changent à chaque fois.' : 'Courage ! Relis la fiche, puis rejoue : de nouvelles questions t\'attendent.'));
    const again = el('button', 'btn alt', '🔁 Rejouer (nouvelles questions)'); again.onclick = () => train(d, goal);
    const fic = el('button', 'btn alt', '📘 Relire la fiche'); fic.onclick = () => openFiche(d.id, 'home');
    const row = el('div', 'row'); row.style.justifyContent = 'center'; row.append(again, fic);
    if (p.type === 'evaluation' && !goal) { const g = el('button', 'btn goal', '🎯 Objectif 20/20'); g.onclick = () => train(d, true); row.append(g); }
    const back = el('button', 'btn', 'Mes missions'); back.onclick = home; row.append(back);
    e.append(row);
    if (pct >= .8) confetti();
  };
  step();
}

// ---------- Fiches pédagogiques ----------
// Anciennes missions (sans fiche) : on en fabrique une à partir du mémo.
const ficheOf = p => {
  const f = p.fiche || {};
  return { intro: f.intro || '', sections: f.sections || [], a_retenir: f.a_retenir || p.memo || [], astuce: f.astuce || '', pieges: f.pieges || [],
    frise: f.frise || [], personnages: f.personnages || [], carte: f.carte || null, cartes: f.cartes || [], schema: f.schema || null, visuels: f.visuels };
};

function ficheNode(meta) {
  const f = meta.fiche, art = el('article', 'fiche k-' + (meta.type || ''));
  const head = el('header', 'fiche-head');
  head.append(el('small', null, `${emojiOf(meta)} ${meta.matiere}`), el('h1', null, meta.titre || meta.consigne));
  const body = el('div', 'fiche-body');
  if (f.intro) body.append(el('p', 'intro', f.intro));
  for (const sct of f.sections) {
    const div = el('section'); div.append(el('h3', null, sct.titre));
    const ul = el('ul'); (sct.points || []).forEach(t => ul.append(el('li', null, t))); div.append(ul);
    if (sct.exemple) { const ex = el('div', 'ex'); ex.append(el('b', null, 'Exemple : '), document.createTextNode(sct.exemple)); div.append(ex); }
    body.append(div);
  }
  const box = (cls, titre, items) => {
    if (!items?.length) return;
    const b = el('div', 'box ' + cls); b.append(el('h3', null, titre));
    if (items.length === 1) b.append(el('p', null, items[0]));
    else { const ul = el('ul'); items.forEach(t => ul.append(el('li', null, t))); b.append(ul); }
    body.append(b);
  };
  if (f.frise?.length) { const sct = el('section'); sct.append(el('h3', null, '🕰️ La frise chronologique'), friseNode(f.frise)); body.append(sct); }
  if (f.schema?.etapes?.length) {
    const sct = el('section'); sct.append(el('h3', null, '🔬 ' + (f.schema.titre || 'Le schéma')), schemaNode(f.schema));
    if (f.schema.wiki) {   // vrai schéma illustré (image principale de l'article Wikipédia)
      const fig = el('figure', 'wikifig'); sct.append(fig);
      wiki(f.schema.wiki).then(w => {
        if (!w.img) return fig.remove();
        const im = Object.assign(el('img'), { src: w.img.replace(/\/\d+px-/, '/640px-'), alt: f.schema.titre || '', loading: 'lazy' });
        im.onerror = () => fig.remove();
        fig.append(im, el('figcaption', null, 'Schéma illustré · Wikipédia'));
      });
    }
    body.append(sct);
  }
  if (f.personnages?.length) {
    const sct = el('section'); sct.append(el('h3', null, '👤 Les personnages importants'));
    const g = el('div', 'persos'); f.personnages.forEach(pp => g.append(persoCard(pp))); sct.append(g); body.append(sct);
  }
  for (const c of [...(f.cartes || []), ...(f.carte && !f.cartes?.length ? [f.carte] : [])]) {
    if (!carteItems(carteOf(c)).length && !FONDS[c.fond]) continue;
    const sct = el('section'), m = el('div', 'map');
    sct.append(el('h3', null, '🗺️ ' + (c.titre || 'La carte'))); sct.append(m);
    if (c.legende) sct.append(el('p', 'small mut', c.legende));
    body.append(sct);
    requestAnimationFrame(() => drawMap(m, c));
  }
  box('box-retenir', '⭐ À retenir', f.a_retenir);
  box('box-astuce', '🦉 L\'astuce de Plume', f.astuce ? [f.astuce] : []);
  box('box-pieges', '⚠️ Pièges à éviter', f.pieges);
  art.append(head, body);
  return art;
}

let ficheFrom = 'home';
function openFiche(id, from = 'fiches') {
  const meta = S.fiches[id] || (S.packs[id] && { ...S.devoirs.find(d => d.id === id), titre: S.packs[id].titre, type: S.packs[id].type, fiche: ficheOf(S.packs[id]) });
  if (!meta) return;
  ficheFrom = from;
  const box = $('#fiche-box'); box.replaceChildren(ficheNode(meta));
  const acts = el('div', 'fiche-actions');
  const d = S.devoirs.find(x => x.id === id && S.packs[id]);
  if (d) { const t = el('button', 'btn', "🚀 M'entraîner"); t.onclick = () => train(d); acts.append(t); }
  const pr = el('button', 'btn alt', '🖨️ Imprimer'); pr.onclick = () => print(); acts.append(pr);
  box.querySelector('.fiche').append(acts);
  show('fiche');
  enrichir(id, meta);
}

// Anciennes fiches d'histoire / géographie / sciences : on demande les visuels une seule fois.
async function enrichir(id, meta) {
  const f = meta.fiche || {}, cat = catOf(meta);
  const vieilleCarte = cat === 'Géographie' && f.visuels !== 2;   // cartes « atlas » (version 2)
  if (!vieilleCarte && (f.visuels || !['Histoire', 'Géographie', 'Sciences'].includes(cat) || f.frise?.length || f.carte || f.schema || (cat !== 'Sciences' && f.personnages?.length))) return;
  const d = S.devoirs.find(x => x.id === id) || { matiere: meta.matiere, consigne: meta.consigne };
  status('');
  const note = el('p', 'status', '🦉 J\'ajoute une frise, un schéma, des personnages ou une carte à ta fiche…'); $('#fiche-box').prepend(note);
  try {
    const v = await api('generate', { action: 'visuels', devoir: d, titre: meta.titre, profil: S.profil });
    const plus = { frise: v.frise || [], personnages: v.personnages || [], carte: null, cartes: v.cartes || (v.carte ? [v.carte] : []), schema: v.schema || null, visuels: 2 };
    S.fiches[id] = { ...S.fiches[id], ...meta, fiche: { ...f, ...plus }, at: Date.now() };
    const p = S.packs[id];
    if (p) {
      if (vieilleCarte) p.questions = p.questions.filter(q => q.type !== 'carte' || q.fond);   // anciennes cartes à points remplacées
      p.fiche = { ...(p.fiche || {}), ...plus }; p.questions.push(...(v.questions || [])); p.at = Date.now();
    }
    save();
    if (!$('#v-fiche').hidden) openFiche(id, ficheFrom);
  } catch { note.textContent = '⚠️ Visuels indisponibles pour le moment.'; }
}

// ---------- Visuels : frise, personnages (Wikipédia / Vikidia), cartes (OpenStreetMap) ----------
function friseNode(items, slot = () => null) {
  const ol = el('ol', 'frise');
  items.forEach((it, i) => {
    const li = el('li'); li.append(el('span', 'an', it.label || String(it.annee)));
    const sl = slot(it, i); li.append(sl || el('span', 'ev', it.texte)); ol.append(li);
  });
  return ol;
}

// Schéma : étapes reliées par des flèches (chaîne) ou en boucle (cycle).
function schemaNode(sc, slot = () => null) {
  const ol = el('ol', 'schema' + (sc.forme === 'cycle' ? ' cycle' : ''));
  sc.etapes.forEach((e, i) => {
    const li = el('li'); li.append(el('span', 'ico', e.icone || '🔹'));
    const t = el('div'); t.append(slot(e, i) || el('b', null, e.nom)); if (e.desc && !slot(e, i)) t.append(el('small', null, e.desc));
    li.append(t); ol.append(li);
  });
  if (sc.forme === 'cycle') ol.append(el('li', 'boucle', '🔁 … et le cycle recommence'));
  return ol;
}

const wikiCache = store.get('wiki', {});
async function wiki(titre) {
  if (wikiCache[titre]) return wikiCache[titre];
  const get = t => fetch('https://fr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_'))).then(r => r.ok ? r.json() : null);
  let w = await get(titre).catch(() => null);
  if (!w || w.type === 'disambiguation') {   // titre approximatif -> recherche
    const r = await fetch(`https://fr.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(titre)}`).then(r => r.json()).catch(() => null);
    const t = r?.query?.search?.[0]?.title; if (t) w = await get(t).catch(() => null);
  }
  const out = w ? { img: w.thumbnail?.source || '', extrait: w.extract || '', url: w.content_urls?.desktop?.page || '', desc: w.description || '' } : {};
  wikiCache[titre] = out; store.set('wiki', wikiCache);
  return out;
}

function persoCard(pp) {
  const b = el('button', 'perso'), img = el('span', 'portrait', '👤');
  b.append(img, el('b', null, pp.nom), el('small', null, pp.dates || pp.role || ''));
  wiki(pp.wiki || pp.nom).then(w => {
    if (!w.img) return;
    const im = Object.assign(el('img'), { src: w.img, alt: '', loading: 'lazy' });
    im.onerror = () => img.replaceChildren('👤'); img.replaceChildren(im);
  });
  b.onclick = () => openPerso(pp);
  return b;
}

async function openPerso(pp) {
  const dlg = $('#perso'), box = dlg.querySelector('.perso-box');
  box.replaceChildren(el('p', 'mut', '🦉 Je cherche…')); dlg.showModal();
  const w = await wiki(pp.wiki || pp.nom);
  const head = el('div', 'perso-head');
  if (w.img) head.append(Object.assign(el('img'), { src: w.img, alt: pp.nom }));
  const t = el('div'); t.append(el('h2', null, pp.nom), el('p', 'mut', [pp.dates, w.desc].filter(Boolean).join(' · '))); head.append(t);
  const links = el('div', 'row');
  links.append(Object.assign(el('a', 'btn alt', '📗 Vikidia (pour les enfants)'), { href: 'https://fr.vikidia.org/w/index.php?search=' + encodeURIComponent(pp.nom), target: '_blank', rel: 'noopener' }));
  if (w.url) links.append(Object.assign(el('a', 'btn alt', '🌐 Wikipédia'), { href: w.url, target: '_blank', rel: 'noopener' }));
  box.replaceChildren(head, el('p', 'role', pp.role || ''), el('p', null, w.extrait || ''), links);
}

let leafletP;
function loadLeaflet() {   // (pas « leaflet » : la bibliothèque écrase window.leaflet)
  return leafletP ||= new Promise((ok, ko) => {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: base + 'leaflet.min.css' }));
    const sc = Object.assign(document.createElement('script'), { src: base + 'leaflet.min.js' });
    sc.onload = () => ok(window.L); sc.onerror = ko; document.head.append(sc);
  });
}
// ---------- Cartes d'atlas : vrais contours (régions, départements, pays), mers, fleuves, massifs ----------
// Données libres intégrées à l'app (dossier geo/, voir tools/build-geo.py) : pas de clé, pas de service extérieur.
const FONDS = { france_regions: 'fr-regions', france_departements: 'fr-departements', europe: 'europe', monde: 'monde' };
const geoCache = {};
const geo = n => geoCache[n] ||= fetch(`geo/${n}.json`).then(r => r.json());
const CONTINENTS = { europe: 'Europe', afrique: 'Africa', asie: 'Asia', 'amerique du nord': 'North America', 'amerique du sud': 'South America',
  oceanie: 'Oceania', antarctique: 'Antarctica', amerique: 'North America' };
const CONT_LBL = { Europe: [52, 15], Africa: [5, 20], Asia: [45, 90], 'North America': [45, -100], 'South America': [-15, -60], Oceania: [-25, 135], Antarctica: [-80, 0] };
const PALETTE = ['#ff8fab', '#ffc857', '#7bdff2', '#b8f2a6', '#c8b6ff', '#ffb38a', '#90e0ef', '#f4a7d3'];
const nomGeo = s => norm(String(s || '').replace(/^(r[ée]gion|d[ée]partement|massif|mont[s]?|fleuve|mer|oc[ée]an)\s+(de\s+|du\s+|des\s+|d')?/i, '')).replace(/\bst\b/g, 'saint');
const memeNom = (a, b) => { a = nomGeo(a); b = nomGeo(b); return a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))); };
// Nom exact d'abord (« Alpes » ≠ « Alpes de Transylvanie »), sinon nom approchant.
const exact = (fc, nom) => fc?.features.find(x => nomGeo(x.properties.nom) === nomGeo(nom));
const trouve = (fc, nom) => exact(fc, nom) || fc?.features.find(x => memeNom(x.properties.nom, nom));

// Anciennes cartes (que des points) : on choisit un fond adapté.
function carteOf(c) {
  if (!c) return null;
  const k = { ...c, zones: c.zones || [], fleuves: c.fleuves || [], mers: c.mers || [], lieux: (c.lieux || []).filter(l => isFinite(l.lat) && isFinite(l.lon)) };
  if (!FONDS[k.fond]) {
    const inFr = k.lieux.every(l => l.lat > 41 && l.lat < 51.5 && l.lon > -5.5 && l.lon < 10);
    const inEu = k.lieux.every(l => l.lat > 34 && l.lat < 72 && l.lon > -25 && l.lon < 45);
    k.fond = inFr ? 'france_regions' : inEu ? 'europe' : 'monde';
  }
  return k;
}
// Éléments à nommer, dans l'ordre des numéros de la carte à trous.
const carteItems = c => [...c.zones.map(x => ({ ...x, k: 'zone' })), ...c.fleuves.map(x => ({ ...x, k: 'fleuve' })),
  ...c.mers.map(x => ({ ...x, k: 'mer' })), ...c.lieux.map(x => ({ ...x, k: 'lieu' }))];

async function drawMap(div, carte, { quiz = false } = {}) {
  const c = carteOf(carte);
  try {
    const L = await loadLeaflet();
    const [fond, pays, reliefs, fleuves, mers] = await Promise.all([geo(FONDS[c.fond]), geo(c.fond === 'monde' ? 'monde' : 'europe'),
      c.fond === 'monde' ? null : geo('reliefs'), c.fleuves.length ? geo('fleuves') : null, geo('mers')]);
    div.classList.add('atlas');
    const map = L.map(div, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true }).setView([46.6, 2.4], 5);   // vue de départ (requise pour placer les points)
    map.attributionControl.setPrefix('').addAttribution('Données © IGN/Etalab, Natural Earth');
    const tags = [];
    const tag = (layer, i, it) => {
      tags.push({ layer, it, txt: quiz ? String(i + 1) : it.nom });
      if (!quiz && it.info) layer.bindPopup(`<b>${String(it.nom).replace(/</g, '')}</b><br>${String(it.info).replace(/</g, '')}`);
    };
    // Étiquette posée sur la partie VISIBLE de l'élément (les Alpes ou une mer débordent de la France).
    const poser = () => tags.forEach(({ layer, it, txt }) => {
      const v = map.getBounds();
      let pos;
      if (it.pos) pos = L.latLng(it.pos);   // point d'étiquette officiel (pays) ou fixe (continent)
      else if (it.k === 'lieu') pos = layer.getLatLng();
      else if (it.k === 'fleuve') {
        const pts = layer.getLayers().flatMap(l => l.getLatLngs().flat(3)).filter(p => v.contains(p));
        pos = pts[Math.floor(pts.length / 2)];
      } else {
        // Plus grand morceau visible (évite la Guyane pour la France, les îles…).
        const parts = layer.getLayers().flatMap(l => (l.getLatLngs ? (Array.isArray(l.getLatLngs()[0]?.[0]) ? l.getLatLngs() : [l.getLatLngs()]) : []))
          .map(poly => L.latLngBounds(poly.flat(2))).filter(pb => pb.isValid() && pb.intersects(v));
        const aire = pb => (pb.getNorth() - pb.getSouth()) * (pb.getEast() - pb.getWest());
        const b = parts.sort((x, y) => aire(y) - aire(x))[0] || layer.getBounds(), s = Math.max(b.getSouth(), v.getSouth()), n = Math.min(b.getNorth(), v.getNorth());
        const w = Math.max(b.getWest(), v.getWest()), e = Math.min(b.getEast(), v.getEast());
        if (s < n && w < e) pos = L.latLng((s + n) / 2, (w + e) / 2);
      }
      if (pos) L.tooltip({ permanent: true, direction: it.k === 'lieu' ? 'right' : 'center', className: 'lbl ' + it.k + (quiz ? ' num' : ''), offset: it.k === 'lieu' ? [6, 0] : [0, 0] })
        .setLatLng(pos).setContent(txt).addTo(map);
    });
    const bounds = [];
    // 1. Terres autour (gris) puis le fond de la leçon (régions / départements / pays) avec ses frontières.
    if (c.fond.startsWith('france')) L.geoJSON(pays, { style: { color: '#b9b2a6', weight: .6, fillColor: '#efe9df', fillOpacity: 1 }, interactive: false }).addTo(map);
    const fondL = L.geoJSON(fond, { style: { color: '#6d6a8f', weight: c.fond === 'france_departements' ? .6 : 1, fillColor: '#fffdf8', fillOpacity: 1 }, interactive: false }).addTo(map);
    // 2. Éléments de la leçon : zones (régions, départements, pays, massifs) coloriées, fleuves, mers, villes.
    let col = 0; const drawn = [];
    carteItems(c).forEach(it => {
      let layer;
      if (it.k === 'zone') {
        // Ordre : nom exact (région, pays, massif), puis continent (« Afrique » ≠ « Afrique du Sud »), puis nom approchant.
        const cont = CONTINENTS[nomGeo(it.nom)];
        const f = !cont && (exact(fond, it.nom) || exact(pays, it.nom) || (!exact(reliefs, it.nom) && (trouve(fond, it.nom) || trouve(pays, it.nom))));
        const r = !cont && !f && trouve(reliefs, it.nom);
        if (cont) {   // continent : tous ses pays coloriés ensemble
          const fs = pays.features.filter(x => x.properties.continent === cont && x.properties.nom !== 'Russie');   // Russie : à cheval sur 2 continents
          it.pos = CONT_LBL[cont];
          if (fs.length) layer = L.geoJSON({ type: 'FeatureCollection', features: fs }, { style: { color: '#4b3fbf', weight: .8, fillColor: PALETTE[col++ % PALETTE.length], fillOpacity: .8 } });
        } else if (f) { if (f.properties.lx != null) it.pos = [f.properties.ly, f.properties.lx]; }
        if (f) layer = L.geoJSON(f, { style: { color: '#4b3fbf', weight: 1.5, fillColor: PALETTE[col++ % PALETTE.length], fillOpacity: .85 } });
        else if (r) layer = L.geoJSON(r, { style: { color: '#8a5a2b', weight: 1, fillColor: '#c99a6b', fillOpacity: .75, dashArray: '3' } });
      } else if (it.k === 'fleuve') {
        const f = trouve(fleuves, it.nom);
        if (f) layer = L.geoJSON(f, { style: { color: '#1f6fd1', weight: 3.5, opacity: .95 } });
      } else if (it.k === 'mer') {
        const f = trouve(mers, it.nom);
        if (f) layer = L.geoJSON(f, { style: { color: '#5aa9e6', weight: 1, fillColor: '#8cc8f2', fillOpacity: .55 } });
      } else {
        layer = L.circleMarker([it.lat, it.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#e9506b', fillOpacity: 1 });
      }
      if (!layer) return;   // nom inconnu des données : on l'ignore plutôt que d'afficher faux
      layer.addTo(map); tag(layer, drawn.length, it); drawn.push(it);
      bounds.push(it.k === 'lieu' ? L.latLngBounds([[it.lat, it.lon], [it.lat, it.lon]]) : layer.getBounds());
    });
    // Cadrage : la France entière pour les fonds France, sinon les éléments de la leçon.
    const EUROPE = L.latLngBounds([35, -11], [62, 32]);   // sans les îles lointaines (Canaries, outre-mer…)
    const b = c.fond.startsWith('france') ? fondL.getBounds() : c.fond === 'europe' ? c.lieux.reduce((a, l) => a.extend([l.lat, l.lon]), EUROPE) : bounds.reduce((a, x) => a.extend(x), bounds[0] ? L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()) : fondL.getBounds());
    // Département(s) à situer : on zoome dessus, avec les voisins autour.
    const zonesB = c.fond === 'france_departements' && bounds.length ? bounds.reduce((a, x) => a.extend(x), L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast())) : null;
    map.fitBounds(zonesB ? zonesB.pad(1.2) : b, { padding: [12, 12] });
    poser();
    return drawn;   // pour la carte à trous : seuls les éléments réellement dessinés sont demandés
  } catch (e) { console.warn('carte', e); div.replaceChildren(el('p', 'mut small', 'Carte indisponible hors connexion.')); return []; }
}
$('#fiche-back').onclick = () => (ficheFrom === 'fiches' ? showFiches() : ficheFrom === 'train' ? show('train') : home());

const CATS = [['Maths', /math|calcul|fraction|g[ée]om[ée]trie|nombre|table|probl|mesure/i], ['Français', /fran[cç]|dict[ée]e|orthog|conjug|gramm|vocab|lecture|po[ée]s|homophon|r[ée]daction/i],
  ['Histoire', /hist/i], ['Géographie', /g[ée]og/i], ['Sciences', /scien|svt|techno/i], ['Langues', /angl|allem|espagn|ital|langue/i]];
const CAT_EMO = { Maths: '🔢', Français: '✍️', Histoire: '🏰', Géographie: '🌍', Sciences: '🔬', Langues: '🗣️', Autres: '📚' };
const catOf = m => (CATS.find(([, re]) => re.test(m.matiere)) || CATS.find(([, re]) => re.test(m.consigne || '')) || ['Autres'])[0];
let catSel = 'Toutes';

function renderFiches() {
  const q = norm($('#f-search').value);
  const all = Object.entries(S.fiches).sort((a, b) => b[1].date.localeCompare(a[1].date) || b[1].at - a[1].at);
  const cats = [...new Set(all.map(([, m]) => catOf(m)))];
  if (catSel !== 'Toutes' && !cats.includes(catSel)) catSel = 'Toutes';
  $('#f-cats').replaceChildren(...['Toutes', ...cats].map(c => {
    const b = el('button', 'chip' + (c === catSel ? ' on' : ''), `${CAT_EMO[c] || '🗂️'} ${c} (${c === 'Toutes' ? all.length : all.filter(([, m]) => catOf(m) === c).length})`);
    b.onclick = () => { catSel = c; renderFiches(); }; return b;
  }));
  const list = all.filter(([, m]) => (catSel === 'Toutes' || catOf(m) === catSel) && (!q || norm(m.matiere + ' ' + m.titre + ' ' + m.consigne).includes(q)));
  $('#f-empty').hidden = all.length > 0;
  let cur = '';
  $('#f-list').replaceChildren(...[...list].sort((a, b) => catOf(a[1]).localeCompare(catOf(b[1]))).flatMap(([id, m]) => {
    const c = catOf(m), out = [];
    if (c !== cur) { cur = c; out.push(el('li', 'dayhead', `${CAT_EMO[c]} ${c}`)); }
    const li = el('li', 'item fitem k-' + (m.type || ''));
    li.append(el('span', 'emoji', emojiOf(m)), el('h3', null, m.titre || m.matiere), el('p', 'small mut', `${m.matiere} · ${new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`));
    li.onclick = () => openFiche(id, 'fiches');
    out.push(li); return out;
  }));
}
function showFiches() { show('fiches'); renderFiches(); }
$('#go-fiches').onclick = showFiches;
$('#f-search').oninput = renderFiches;
document.querySelectorAll('.to-home').forEach(b => b.onclick = home);

// Fiches des missions déjà préparées avant cette version.
for (const d of S.devoirs) if (S.packs[d.id] && !S.fiches[d.id]) {
  const p = S.packs[d.id];
  S.fiches[d.id] = { matiere: d.matiere, consigne: d.consigne, titre: p.titre, type: p.type, fiche: ficheOf(p), date: d.pour, at: p.at || Date.now() };
}

// Petite pluie de confettis (sans bibliothèque).
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#6d5dfc', '#ff6fa8', '#ffc23d', '#2fc79b', '#2f9be6'];
  const bits = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height / 2,
    v: 2 + Math.random() * 4, r: Math.random() * 6.3, s: 6 + Math.random() * 6, c: cols[Math.random() * 5 | 0] }));
  let t = 0;
  (function f() {
    x.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.y += b.v; b.x += Math.sin((t + b.r * 20) / 15); b.r += .1;
      x.save(); x.translate(b.x, b.y); x.rotate(b.r); x.fillStyle = b.c; x.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); x.restore();
    }
    if (++t < 200) requestAnimationFrame(f); else x.clearRect(0, 0, c.width, c.height);
  })();
}

// Explication des compteurs du haut.
$('#stars').parentElement.onclick = () => { home(); status('⭐ Tes étoiles : une étoile par bonne réponse du premier coup (meilleur score de chaque mission).'); };
$('#streak').parentElement.onclick = () => { home(); status('🔥 Ta série : le nombre de jours d\'affilée où tu t\'es entraînée. Entraîne-toi chaque jour pour la faire grandir ! Un jour sans entraînement et elle repart à zéro.'); };
$('#cloud').onclick = () => { home(); status('☁️ ' + $('#cloud').title); };

// Réglage : la commune de Céleste (cartes « mon lieu de vie » en géographie).
$('#commune').value = S.profil?.commune || '';
$('#commune').onchange = e => { S.profil = { commune: e.target.value.trim(), at: Date.now() }; save(); status('📍 Commune enregistrée : les prochaines cartes en tiendront compte.'); };

function home() { show('home'); $('#tip').textContent = TIPS[Math.random() * TIPS.length | 0]; render(); }
$('#back').onclick = home;
$('#f-pin').onsubmit = e => { e.preventDefault(); store.set('pin', $('#pin').value.trim()); start(); };

function start() {
  if (!store.get('pin', '')) return show('pin');
  home(); sync(); syncOne(); prepareAll();
}
start();
