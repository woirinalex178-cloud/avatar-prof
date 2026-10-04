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

async function sync() {
  if (!store.get('pin', '')) return;
  if (syncing) { again = true; return; }
  syncing = true; $('#cloud').className = 'pill cloud busy';
  try {
    const r = await api('sync', S);
    if (!r.off) { S = r; store.set('etat', S); }
    $('#cloud').className = 'pill cloud' + (r.off ? ' off' : '');
    $('#cloud').title = r.off ? 'Synchro non configurée' : 'Sauvegardé sur tous les appareils';
    if (!$('#v-home').hidden) render();
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
  for (const d of up) {
    const p = S.packs[d.id], r = S.results[d.id], j = daysTo(d.pour);
    const li = el('li', 'item' + (p ? ' k-' + p.type : ''));
    const when = el('span', 'when' + (j <= 1 ? ' soon' : ''), j === 0 ? "Pour aujourd'hui" : j === 1 ? 'Pour demain' : 'Pour ' + fmt(d.pour));
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
    const p = { ...(await api('generate', { action: 'make', devoir: d })), at: Date.now() };
    S.packs[d.id] = p;
    S.fiches[d.id] = { matiere: d.matiere, consigne: d.consigne, titre: p.titre, type: p.type, fiche: ficheOf(p), date: today(), at: Date.now() };
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
    if (n) status(`${n} nouveau(x) devoir(s) depuis ONE ✔`);
  } catch {}
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
  const r = await api('generate', { action: 'more', devoir: d, deja: S.packs[d.id].questions.map(q => q.enonce), n });
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

    const answer = (given, btn) => {
      const good = [q.reponse, ...(q.accepte || [])].some(a => norm(a) === norm(given));
      if (good && q.first) score++;
      tries++;
      // Objectif 20/20 : une question ratée revient à la fin jusqu'à ce qu'elle soit réussie.
      if (!good && goal) queue.push({ ...q, first: false, choix: shuffle(q.choix || []) });
      box.querySelectorAll('button,input').forEach(x => x.disabled = true);
      box.querySelectorAll('.choice').forEach(c => { if (norm(c.textContent) === norm(q.reponse)) c.classList.add('ok'); });
      if (btn && !good) btn.classList.add('ko');
      const fb = el('div', 'fb ' + (good ? 'ok' : 'ko'));
      fb.append(el('strong', null, good ? BRAVO[tries % BRAVO.length] : `Presque ! La réponse : ${q.reponse}. `), document.createTextNode(q.explication || ''));
      if (!good && goal) fb.append(el('div', 'small', '🔁 Cette question reviendra à la fin.'));
      const next = el('button', 'btn', k + 1 < queue.length ? 'Suivant →' : 'Voir mon score 🎉');
      next.onclick = () => { k++; k < queue.length ? step() : end(); };
      box.append(fb, next); next.focus();
    };

    if (q.type === 'courte') {
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
  return { intro: f.intro || '', sections: f.sections || [], a_retenir: f.a_retenir || p.memo || [], astuce: f.astuce || '', pieges: f.pieges || [] };
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
}
$('#fiche-back').onclick = () => (ficheFrom === 'fiches' ? showFiches() : ficheFrom === 'train' ? show('train') : home());

function renderFiches() {
  const q = norm($('#f-search').value);
  const all = Object.entries(S.fiches).sort((a, b) => b[1].date.localeCompare(a[1].date) || b[1].at - a[1].at);
  const list = all.filter(([, m]) => !q || norm(m.matiere + ' ' + m.titre + ' ' + m.consigne).includes(q));
  $('#f-empty').hidden = all.length > 0;
  $('#f-list').replaceChildren(...list.map(([id, m]) => {
    const li = el('li', 'item fitem k-' + (m.type || ''));
    li.append(el('span', 'emoji', emojiOf(m)), el('h3', null, m.titre || m.matiere), el('p', 'small mut', `${m.matiere} · ${new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`));
    li.onclick = () => openFiche(id, 'fiches');
    return li;
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

function home() { show('home'); $('#tip').textContent = TIPS[Math.random() * TIPS.length | 0]; render(); }
$('#back').onclick = home;
$('#f-pin').onsubmit = e => { e.preventDefault(); store.set('pin', $('#pin').value.trim()); start(); };

function start() {
  if (!store.get('pin', '')) return show('pin');
  home(); sync(); syncOne(); prepareAll();
}
start();
