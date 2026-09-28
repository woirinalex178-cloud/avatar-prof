// Mes devoirs malins : devoirs (ONE / photo / saisie) -> entraînement adapté généré par l'IA.
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let devoirs = store.get('devoirs', []);   // {id, matiere, consigne, pour, source}
let packs = store.get('packs', {});       // id -> entraînement généré
let results = store.get('results', {});   // id -> {score, total}
const busy = new Set();
const KIND = { exercice: 'Petit exercice', revision: 'Révision', evaluation: 'Évaluation blanche' };
const today = () => new Date().toISOString().slice(0, 10);
const idOf = d => (d.pour + '|' + d.matiere + '|' + d.consigne).toLowerCase().replace(/\s+/g, ' ');
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const show = v => ['pin', 'home', 'train'].forEach(n => $('#v-' + n).hidden = n !== v);
const status = t => $('#status').textContent = t || '';

async function api(path, body) {
  const r = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-pin': store.get('pin', '') },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { store.set('pin', ''); show('pin'); }
  if (!r.ok) throw new Error(d.error || 'Erreur ' + r.status);
  return d;
}

function save() { store.set('devoirs', devoirs); store.set('packs', packs); store.set('results', results); }

function addDevoirs(list) {
  let n = 0;
  for (const d of list || []) {
    if (!d.consigne) continue;
    const x = { matiere: d.matiere || 'Devoir', consigne: d.consigne, pour: d.pour || today(), source: d.source || 'cahier' };
    x.id = idOf(x);
    if (!devoirs.some(o => o.id === x.id)) { devoirs.push(x); n++; }
  }
  // on garde 7 jours d'historique
  const limit = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  devoirs = devoirs.filter(d => d.pour >= limit).sort((a, b) => a.pour.localeCompare(b.pour));
  save(); render(); prepareAll();
  return n;
}

const fmt = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function render() {
  const ul = $('#list'); ul.replaceChildren();
  const up = devoirs.filter(d => d.pour >= today());
  $('#empty').hidden = up.length > 0;
  for (const d of up) {
    const p = packs[d.id], r = results[d.id];
    const li = el('li', 'item' + (p ? ' k-' + p.type : ''));
    li.append(el('h3', null, d.matiere), el('p', null, d.consigne), el('p', 'small mut', 'Pour ' + fmt(d.pour)));
    const foot = el('div', 'foot');
    if (p) {
      foot.append(el('span', 'tag', `${KIND[p.type] || 'Entraînement'} · ${p.duree_min || '?'} min`));
      const b = el('button', 'btn', r ? `Refaire (${r.score}/${r.total})` : "S'entraîner");
      b.onclick = () => train(d);
      foot.append(b);
    } else if (busy.has(d.id)) {
      foot.innerHTML = '<span class="small mut"><i class="spin"></i> Préparation…</span>';
    } else {
      const b = el('button', 'btn alt', 'Préparer'); b.onclick = () => prepare(d); foot.append(b);
    }
    const del = el('button', 'ghost small', '✕'); del.title = 'Supprimer';
    del.onclick = () => { devoirs = devoirs.filter(x => x !== d); delete packs[d.id]; save(); render(); };
    foot.append(del);
    li.append(foot); ul.append(li);
  }
}

async function prepare(d) {
  if (busy.has(d.id) || packs[d.id]) return;
  busy.add(d.id); render();
  try { packs[d.id] = await api('generate', { action: 'make', devoir: d }); save(); }
  catch (e) { status('⚠️ ' + e.message); }
  busy.delete(d.id); render();
}

// Automatique : prépare chaque devoir à venir, un par un (quota gratuit).
async function prepareAll() {
  for (const d of devoirs.filter(d => d.pour >= today() && !packs[d.id])) await prepare(d);
}

async function syncOne() {
  status('Lecture du cahier de textes ONE…');
  try {
    const r = await api('one');
    const n = addDevoirs(r.devoirs);
    status(r.info || (n ? `${n} nouveau(x) devoir(s) depuis ONE` : 'ONE : rien de nouveau'));
  } catch (e) { status('ONE indisponible : ' + e.message); }
}

// Photo du cahier papier -> compressée -> lue par l'IA.
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

// Photo et/ou texte libre -> l'IA en extrait la liste des devoirs.
async function lire(image) {
  const texte = $('#txt').value.trim();
  if (!image && !texte) return;
  status(image ? 'Je lis ta photo…' : 'Je lis ton texte…');
  try {
    const r = await api('generate', { action: 'read', image, texte });
    const n = addDevoirs((r.devoirs || []).map(d => ({ ...d, source: image ? 'photo' : 'texte' })));
    if (n) $('#txt').value = '';
    status(n ? `${n} devoir(s) trouvé(s) ✔ Je prépare tes entraînements…`
      : 'Aucun nouveau devoir trouvé. Écris-le avec tes mots dans la zone de texte.');
  } catch (err) { status('⚠️ ' + err.message); }
}

$('#photo').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) lire(await compress(f));
};
$('#f-txt').onsubmit = e => { e.preventDefault(); lire(); };

// ---------- Entraînement ----------
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.]+/g, ' ').replace(/\b(le|la|les|l|un|une|des)\b/g, '').replace(/\s+/g, ' ').trim();

function train(d) {
  const p = packs[d.id];
  let i = 0, score = 0;
  show('train'); scrollTo(0, 0);
  $('#t-kind').textContent = KIND[p.type] || 'Entraînement';
  $('#t-kind').className = 'tag k-' + p.type;
  $('#t-title').textContent = p.titre || d.matiere;
  const memo = $('#t-memo'); memo.hidden = !p.memo?.length;
  memo.querySelector('ul').replaceChildren(...(p.memo || []).map(m => el('li', null, m)));
  $('#t-end').hidden = true;

  const step = () => {
    const box = $('#t-q'); box.hidden = false; box.replaceChildren();
    const q = p.questions[i], n = p.questions.length;
    const head = el('div', 'q-head'); head.append(el('span', null, `Question ${i + 1} / ${n}`), el('span', null, `⭐ ${score}`));
    const bar = el('div', 'bar'); bar.append(el('i')); bar.firstChild.style.width = (i / n * 100) + '%';
    box.append(head, bar, el('p', 'q-text', q.enonce));

    const answer = (given, btn) => {
      const good = [q.reponse, ...(q.accepte || [])].some(a => norm(a) === norm(given));
      if (good) score++;
      box.querySelectorAll('button,input').forEach(x => x.disabled = true);
      box.querySelectorAll('.choice').forEach(c => { if (norm(c.textContent) === norm(q.reponse)) c.classList.add('ok'); });
      if (btn && !good) btn.classList.add('ko');
      const fb = el('div', 'fb ' + (good ? 'ok' : 'ko'));
      fb.append(el('strong', null, good ? 'Bravo ! ' : `Presque… Réponse : ${q.reponse}. `), document.createTextNode(q.explication || ''));
      const next = el('button', 'btn', i + 1 < n ? 'Suivant →' : 'Voir mon score');
      next.onclick = () => { i++; i < n ? step() : end(); };
      box.append(fb, next); next.focus();
    };

    if (q.type === 'courte') {
      const f = el('form', 'row'), inp = el('input'); inp.placeholder = 'Ta réponse'; inp.autocomplete = 'off';
      f.append(inp, el('button', 'btn', 'Valider'));
      f.onsubmit = e => { e.preventDefault(); if (inp.value.trim()) answer(inp.value); };
      box.append(f); inp.focus();
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
    const n = p.questions.length, pct = score / n;
    results[d.id] = { score, total: n }; save();
    const e = $('#t-end'); e.hidden = false; e.replaceChildren(
      el('p', 'score', `${score} / ${n}`),
      el('p', null, pct >= .8 ? '🏆 Excellent, tu es prête !' : pct >= .5 ? '👍 Bien ! Relis le mémo et refais-le.' : '💪 Relis la leçon et le mémo, puis réessaie.'));
    const again = el('button', 'btn alt', 'Refaire'); again.onclick = () => train(d);
    const fresh = el('button', 'btn alt', 'Nouvelles questions');
    fresh.onclick = () => { delete packs[d.id]; save(); home(); prepare(d); };
    const back = el('button', 'btn', 'Retour aux devoirs'); back.onclick = home;
    const row = el('div', 'row'); row.style.justifyContent = 'center'; row.append(again, fresh, back); e.append(row);
  };
  step();
}

function home() { show('home'); render(); }
$('#back').onclick = home;
$('#sync').onclick = syncOne;
$('#f-pin').onsubmit = e => { e.preventDefault(); store.set('pin', $('#pin').value.trim()); start(); };

function start() {
  if (!store.get('pin', '')) return show('pin');
  home(); syncOne(); prepareAll();
}
start();
