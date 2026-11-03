Warning: truncated output (original token count: 35058)
Total output lines: 1326

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { openAuth } from './auth.js';
import { recognize, loadRecog } from './recog.js';
import { startCam, fileToCard, toBlob, readCard, rank, thumb, frameDiff, isBlank, splitPage } from './scan.js';
import * as Game from './game.js';
import { renderLegal } from './legal.js';
import { playIntro } from './intro.js';
import { initCritters, critterSVG, CRITTER_NAMES, HUES } from './critters.js';
import { renderGuide } from './guide.js';
import { initFx, refreshFx } from './fx.js';
playIntro();

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const S = { user: null, profile: null, sets: [], cards: {}, bySet: {}, set: null, lang: 'fr', coll: {}, fee: 0.0001, filter: 'all', pseudos: {}, prog: {} };
const LANGS = { fr: 'Français', en: 'Anglais (US/UK)', ja: 'Japonais', 'zh-cn': 'Chinois simplifié', 'zh-tw': 'Chinois traditionnel (Taïwan / Hong Kong)', de: 'Allemand', it: 'Italien', es: 'Espagnol', pt: 'Portugais' };
const flag = l => `<span class="lang">${({ ja: 'JP', 'zh-cn': 'ZH-CN', 'zh-tw': 'ZH-TW' })[l] || l.toUpperCase()}</span>`;
const COND = { NM: ['Near Mint', 'Comme neuve, aucun défaut visible', 1], EX: ['Excellent', 'Micro-défauts (léger blanchiment)', .85], GD: ['Bon', 'Usure visible, coins/bords marqués', .65], PL: ['Joué', 'Pliure, rayure ou usure forte', .4] };
const STEPS = ['Offre', 'Acceptée', 'Payée', 'Expédiée', 'Reçue', 'Terminée'];

// ---------- utilitaires ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const eur = v => v == null ? '—' : Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: v < 10 ? 2 : 0 });
const view = $('#view'), dlg = $('#dlg'), dbody = $('#dbody');
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 3200); }
function modal(html) { dbody.innerHTML = html; if (!dlg.open) dlg.showModal(); }
const close = () => dlg.open && dlg.close();
const errMsg = e => (e?.message || String(e)).replace(/^.*?Interdit/, 'Interdit');
const img = (c, big) => c?.image ? `<img class="cimg" loading="lazy" src="${c.image}/${big ? 'high' : 'low'}.webp" alt="${esc(nm(c))}">` : `<div class="ph"><span>${esc(c?.name || '?')}</span></div>`;
const nm = c => c?.name_fr || c?.name || '?';
const jp = c => c?.name_fr ? `<small class="jp">${esc(c.name)}</small>` : '';
const setName = s => s ? (s.name_fr || s.name) : '';
const stars = p => p?.reviews_count ? `★ ${p.rating} (${p.reviews_count})` : 'nouveau';
const authBadge = l => l.auth_score != null ? `<span class="pill ${l.auth_score >= 75 ? 'p-NM' : l.auth_score >= 50 ? 'p-GD' : 'p-PL'}" title="Contrôle photo d'authenticité">IA ${l.auth_score}</span>` : '';
const photoUrl = p => sb.storage.from('photos').getPublicUrl(p).data.publicUrl;
const color = s => `hsl(${[...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360} 70% 70%)`;
const av = (p, pr) => pr?.avatar ? `<div class="av crit th-${pr.theme || 'felt'}">${critterSVG(+pr.avatar[0], +pr.avatar[2])}</div>` : `<div class="av" style="background:${color(p || '?')}">${esc((p || '?').slice(0, 2).toUpperCase())}</div>`;
const who = (id, p) => `<a class="who" href="#/membre/${id}">${esc(p?.pseudo || '?')}</a>`;
const needAccount = () => { if (S.profile) return false; toast('Crée ton compte (18+) pour faire ça'); location.hash = '#/compte'; return true; };

// Filtre anti-coordonnées (retour immédiat ; la base de données bloque aussi)
function contactViolation(t) {
  if (!t) return null;
  const s = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\s+at\s+|arobase)\s*[a-z0-9-]+\s*(\.|\s+point\s+|\s+dot\s+)\s*[a-z]{2,}/.test(s)) return 'adresse e-mail';
  if (/(https?:\/\/|www\.|\.(com|fr|net|org|io|me|be|ch|gg|ly)\b)/.test(s)) return 'lien externe';
  if (/(\d[\s.\-/]*){9,}/.test(s) || /(\+|00)\s*3[23]/.test(s) || /\bzero\s+(six|sept)\b/.test(s)) return 'numéro de téléphone';
  if (/\b(whats\s*app|wa\.me|snap\s*chat|snap|insta|instagram|telegram|discord|messenger|facebook|fb|signal|tiktok|twitter|leboncoin|vinted|ebay|paypal|lydia|wero|paylib|iban|rib|virement|western\s*union|gmail|hotmail|outlook|yahoo|icloud|numero|mon\s+num|tel|telephone|appelle|sms|mp\s+moi|en\s+direct|hors\s+(appli|app|site|plateforme)|en\s+dehors|main\s+propre|cash|especes|liquide)\b/.test(s)) return 'coordonnées ou transaction hors appli';
  if (/(^|\s)@[a-z0-9_.]{3,}/.test(s)) return 'pseudo de réseau social';
  return null;
}
function guardInput(el, out) {
  const v = contactViolation(el.value);
  out.textContent = v ? `Interdit : ${v}. Tout se passe dans l'appli, c'est ce qui te protège.` : '';
  return !v;
}

// ---------- données ----------
async function loadCatalog() {
  const page = n => sb.from('sets').select('id,lang,code,name,name_fr,serie_id,serie_name,total,card_count,released').gt('card_count', 0).order('released', { ascending: false, nullsFirst: false }).order('id').range(n * 1000, n * 1000 + 999);
  const [a, b, c, { data: st }] = await Promise.all([page(0), page(1), page(2), sb.from('settings').select('*').single()]);
  S.sets = [...(a.data || []), ...(b.data || []), ...(c.data || [])]; S.fee = st?.fee_rate ?? S.fee; S.st = st || {};
  try { S.lang = localStorage.getItem('tdd_lang') || S.lang; } catch { }
  pickDefaultSet();
}
function pickDefaultSet() { if (!S.sets.some(s => s.id === S.set && s.lang === S.lang)) S.set = S.sets.find(s => s.lang === S.lang)?.id || null; }
function remember(list) { for (const c of list || []) S.cards[c.id] = c; }
async function loadSet(id) {
  if (!id || S.bySet[id]) return;
  const { data } = await sb.from('cards').select('*').eq('set_id', id).order('num', { nullsFirst: false }).order('local_id').limit(1000);
  S.bySet[id] = data || []; remember(data);
}
async function loadProgress() {
  if (!S.profile) return;
  const { data } = await sb.rpc('my_progress');
  S.prog = Object.fromEntries((data || []).map(r => [r.set_id, r.owned]));
}
const GUEST = 'tdd_guest';
const guestColl = () => { try { return JSON.parse(localStorage.getItem(GUEST)) || {}; } catch { return {}; } };
async function loadCollection() {
  if (!S.profile) { S.coll = guestColl(); return; }
  const { data } = await sb.from('collection').select('card_id,qty');
  S.coll = Object.fromEntries((data || []).map(r => [r.card_id, r.qty]));
  await loadProgress();
}
async function setQty(id, q) {
  q = Math.max(0, Math.min(99, q)); S.coll[id] = q;
  if (!S.profile) { try { localStorage.setItem(GUEST, JSON.stringify(S.coll)); } catch { } return; }
  const r = q ? await sb.from('collection').upsert({ user_id: S.user.id, card_id: id, qty: q }) : await sb.from('collection').delete().eq('card_id', id).eq('user_id', S.user.id);
  if (r.error) toast(r.error.message, true);
}
async function pseudos(ids) {
  const miss = [...new Set(ids)].filter(i => i && !S.pseudos[i]);
  if (miss.length) { const { data } = await sb.from('public_profiles').select('*').in('id', miss); for (const p of data || []) S.pseudos[p.id] = p; }
}
try { const r = new URLSearchParams(location.search).get('ref'); if (r) localStorage.setItem('sc_ref', r.toUpperCase()); } catch {}
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.profile = null;
  if (S.user) {
    let { data: p } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    const md = S.user.user_metadata || {};
    if (!p && md.pseudo && md.birthdate) {
      const r = await sb.from('profiles').insert({ id: S.user.id, pseudo: md.pseudo, birthdate: md.birthdate, region: md.region || null }).select().single();
      if (r.error) toast(r.error.message, true); else p = r.data;
    }
    if (p && !p.referred_by) { let r = null; try { r = localStorage.getItem('sc_ref'); } catch {}
      if (r && r !== p.ref_code) { const { error } = await sb.rpc('apply_referral', { code: r }); try { localStorage.removeItem('sc_ref'); } catch {}
        if (!error) { p.referred_by = true; p.free_trades++; toast('🎁 Parrainage validé : 1 échange offert en plus !'); } } }
    if (p) { const { data: pp } = await sb.from('public_profiles').select('filleuls').eq('id', p.id).maybeSingle(); p.filleuls = pp?.filleuls || 0; }
    S.profile = p;
    if (p) { // importe le classeur invité
      const g = guestColl(), rows = Object.entries(g).filter(([, q]) => q > 0).map(([card_id, qty]) => ({ user_id: S.user.id, card_id, qty }));
      if (rows.length) { const r = await sb.from('collection').upsert(rows); if (!r.error) { localStorage.removeItem(GUEST); toast(`${rows.length} cartes importées dans ton classeur`); } }
    }
  }
  $('#navme').textContent = S.profile ? S.profile.pseudo : 'Compte';
  await loadCollection();
}

// ---------- gamification ----------
function progress(setId) {
  const set = S.sets.find(s => s.id === setId), cs = S.bySet[setId] || [];
  let owned = 0, main = 0, value = 0, doubles = 0;
  for (const c of cs) { const q = S.coll[c.id] || 0; if (q) { owned++; if (c.num && c.num <= set.total) main++; } value += q * (c.price_eur || 0); doubles += Math.max(0, q - 1); }
  return { set, cs, owned, main, value, doubles, pct: set?.total ? Math.min(100, Math.round(main / set.total * 100)) : 0 };
}
const setPct = s => s.total ? Math.min(100, Math.round((S.prog[s.id] || 0) / s.total * 100)) : 0;
// trophées : infos des cartes du classeur (mises en cache) -> statistiques -> badges
S.info = {};
async function gameState() {
  const ids = Object.keys(S.coll).filter(k => S.coll[k] > 0), miss = ids.filter(k => !S.info[k]);
  for (let i = 0; i < miss.length; i += 1000) { const { data } = await sb.rpc('coll_info', { p_ids: miss.slice(i, i + 1000) }); for (const r of data || []) S.info[r.id] = r; }
  const st = Game.stats(ids.map(k => S.info[k]).filter(Boolean), S.coll, S.profile);
  S.ev = Game.evaluate(st); return { st, ev: S.ev };
}
async function checkUnlock() {
  const { ev } = await gameState();
  if (S.profile) { const ids = [...ev.ids].sort(), cur = [...(S.profile.badges || [])].sort(); if (ids.join() !== cur.join()) { S.profile.badges = ids; sb.rpc('set_badges', { ids }); } }
  if (!Game.G.flags.seeded) { Game.newlyUnlocked(ev); Game.flag('seeded'); return; }
  Game.celebrate(Game.newlyUnlocked(ev), esc);
}
async function trophees() {
  const { st, ev } = await gameState(), dl = Game.daily();
  view.innerHTML = `<div class="felt"><div class="dash"><div class="ring" style="--p:${Math.round(ev.got.length / ev.total * 100)}"><span>${ev.got.length}<small>/ ${ev.total}</small></span></div>
    <div><h1 style="font-size:24px">${esc(ev.title)}</h1><p class="mut" style="margin:4px 0">Niveau ${ev.lvl} · ${ev.xp} XP · 🔥 ${st.streak} jour(s) de suite</p><div class="xp"><i style="width:${ev.pct}%"></i></div>
    <p class="small" style="margin:10px 0 0">🎯 Défi du jour : ajoute ${dl.n} cartes à ton classeur — ${dl.done ? '<b class="dn">réussi ✔</b>' : `${dl.cur}/${dl.n}`}</p></div></div></div>
  ${Game.renderTrophies(ev, st, esc)}`;
}

// ---------- vues ----------
function legal() {
  const sub = location.hash.split('/')[2];
  view.innerHTML = renderLegal(esc, sub);
  if (sub) document.getElementById('lg-' + sub)?.scrollIntoView();
}
const routes = { '': home, trophees, legal, classeur, table, offres, forum, compte, regles, guide, membre };
function guide() {
  const k = location.hash.split('/')[2]; view.innerHTML = renderGuide();
  const el = k && document.getElementById('g-' + k); if (!el) return;
  if (el.tagName === 'DETAILS') el.open = true; el.classList.add('flash'); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}
// lien vers une étape du guide, affiché au bon moment des transactions
const gtip = (k, t) => `<a class="gtip" href="#/guide/${k}">📖 ${t}</a>`;
async function route() {
  const r = location.hash.replace(/^#\/?/, '').split('/')[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  close(); window.scrollTo(0, 0);
  try { await (routes[r] || home)(); } catch (e) { console.error(e); view.innerHTML = `<div class="empty">Erreur de chargement. ${esc(e.message)}</div>`; }
  refreshFx(view);
}

async function home() {
  const [{ data: top0 }, { count }] = await Promise.all([
    sb.from('cards').select('*').eq('lang', S.lang === 'ja' ? 'en' : S.lang).not('image', 'is', null).not('price_eur', 'is', null).order('price_eur', { ascending: false }).limit(5),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
  ]);
  const top = top0 || []; remember(top);
  const nbCards = S.sets.reduce((a, s) => a + s.card_count, 0).toLocaleString('fr-FR');
  view.innerHTML = `<div class="banner"><img src="img/banner.webp" alt="Sharing Cards — Collectionnez. Échangez. Partagez." width="2000" height="745"></div>
  <section class="hero">
    <div><h1>Par des collectionneurs,<br>pour des <span style="color:var(--gold)">collectionneurs</span>.</h1>
    <p class="lead">Coche les cartes que tu possèdes, suis la cote de ta collection, puis pose tes doubles sur la table pour les échanger ou les vendre en toute sécurité.</p>
    <div class="seg"><a class="btn" href="#/classeur">Remplir mon classeur</a><a class="btn ghost" href="#/table">Voir la table</a><a class="btn ghost" href="#/guide">📖 Guide des échanges</a><button class="btn ghost" data-scan>📷 Scanner une carte</button><button class="btn ghost" data-scan="auth">🔍 Authentifier</button></div>
    <div class="stats"><div><b>${nbCards}</b><span class="mut small">cartes · ${S.sets.length} sets · ${Object.keys(LANGS).length} langues</span></div><div><b>${count ?? 0}</b><span class="mut small">doubles sur la table</span></div><div><b>0 %</b><span class="mut small">de frais vendeur</span></div></div></div>
    <div class="fan">${top.map((c, i) => `<img src="${c.image}/low.webp" alt="${esc(nm(c))}" style="--r:${(i - 2) * 11}deg">`).join('')}</div>
  </section>
  <section class="panel manifeste"><h2>Un espace réservé aux passionnés</h2><ul>
    <li><b>🃏 Pas de revendeurs pros ni de spéculateurs.</b> Ici, des passionnés qui complètent leurs classeurs : on ne pose que ses doubles (30 annonces max).</li>
    <li><b>⇄ L'échange d'abord.</b> Carte contre carte, gratuit pendant la bêta (puis 0,99 €). 3 échanges offerts à l'inscription, +1 par ami parrainé.</li>
    <li><b>0 % vendeur, zéro pub.</b> Tes données ne sont jamais vendues.</li>
    <li><b>▦ Chaque membre a un classeur.</b> On voit qui collectionne vraiment.</li>
  </ul></section>
  <div class="steps">
    <div class="panel step"><b>1 · Collectionne</b>Coche tes cartes. Sans compte, ton classeur reste sur ton téléphone. Suis ta progression et la valeur de ta collection.</div>
    <div class="panel step"><b>2 · Pose tes doubles</b>Chaque double devient une annonce en un clic : état, photo, prix conseillé d'après la cote.</div>
    <div class="panel step"><b>3 · Échange en sécurité</b>Offres, messagerie et paiement dans l'appli. L'argent est bloqué jusqu'à la réception de la carte.</div>
  </div>
  <h2>Les plus grosses cotes</h2>
  <div class="grid">${top.map(c => `<a class="tile" href="#/table" data-card="${c.id}">${img(c)}<div class="meta"><span class="nm">${esc(nm(c))}</span><span class="v">${eur(c.price_eur)}${trend(c)}</span></div></a>`).join('') || '<p class="mut">Catalogue en cours de chargement…</p>'}</div>`;
}

function setPicker() {
  const sets = S.sets.filter(s => s.lang === S.lang), groups = {};
  for (const s of sets) (groups[s.serie_name || 'Autres'] ||= []).push(s);
  return `<div class="pickers">
    <label class="f">Langue<select id="plang">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${n} (${S.sets.filter(s => s.lang === k).length} sets)</option>`).join('')}</select></label>
    <label class="f">Extension<select id="pset">${Object.entries(groups).map(([g, ss]) => `<optgroup label="${esc(g)}">${ss.map(s => `<option value="${s.id}" ${s.id === S.set ? 'selected' : ''}>${s.lang === 'ja' ? s.code + ' · ' : ''}${esc(setName(s))}${s.released ? ' · ' + s.released.slice(0, 4) : ''}${S.prog[s.id] ? ` · ${setPct(s)}%` : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
  </div>`;
}
const binder = { mode: 'owned', group: '', page: 0, size: 9, lang: '', doubles: false, slide: false };
let binderTimer;
async function classeur() {
  clearTimeout(binderTimer);
  if (binder.mode === 'catalog') {
    await catalogClasseur();
    view.insertAdjacentHTML('afterbegin', '<button class="btn ghost binder-back" id="binder-back">← Revenir à mes cartes</button>');
    $('#binder-back').onclick = () => { binder.mode = 'owned'; classeur(); };
    return;
  }
  view.innerHTML = '<div class="empty" role="status">Ouverture de ton classeur…</div>';
  const ids = Object.keys(S.coll).filter(id => S.coll[id] > 0);
  const missing = ids.filter(id => !S.cards[id]);
  try {
    for (let i = 0; i < missing.length; i += 100) {
      const { data, error } = await sb.from('cards').select('*').in('id', missing.slice(i, i + 100));
      if (error) throw error;
      remember(data);
    }
    if (ids.some(id => !S.cards[id])) throw new Error('Carte indisponible');
  } catch {
    view.innerHTML = '<div class="empty"><h2>Ton classeur est bien conservé</h2><p>Impossible de charger les cartes pour le moment. Vérifie ta connexion.</p><button class="btn" id="binder-retry">Réessayer</button></div>';
    $('#binder-retry').onclick = classeur; return;
  }
  if (!location.hash.startsWith('#/classeur')) return;
  const rows = ids.map(id => S.cards[id]).filter(Boolean);
  const setFor = c => S.sets.find(s => s.id === c.set_id);
  // Les identifiants TCGdex portent un préfixe de langue : fr:sv01, en:sv01…
  const groupKey = c => String(c.set_id || c.id.split(':')[1]?.replace(/-[^-]+$/, '') || '').replace(/^[a-z]{2}:/, '');
  const groups = new Map();
  for (const c of rows) {
    const key = groupKey(c), set = setFor(c);
    if (!groups.has(key)) groups.set(key, { key, name: setName(set) || c.set_name || key, rows: [] });
    const g = groups.get(key); g.rows.push(c);
    if (c.lang === 'fr') g.name = setName(set) || c.set_name || g.name;
  }
  const collections = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (!groups.has(binder.group)) binder.group = collections[0]?.key || '';
  const group = groups.get(binder.group);
  const languages = Object.keys(LANGS);
  const cards = (group?.rows || []).filter(c => (!binder.lang || c.lang === binder.lang) && (!binder.doubles || S.coll[c.id] > 1)).sort((a,b) => String(a.local_id ?? a.num ?? '').localeCompare(String(b.local_id ?? b.num ?? ''), 'fr', { numeric: true }) || languages.indexOf(a.lang) - languages.indexOf(b.lang));
  const size = binder.slide ? 1 : binder.size, pages = Math.max(1, Math.ceil(cards.length / size));
  binder.page = Math.max(0, Math.min(binder.page, pages - 1));
  const visible = cards.slice(binder.page * size, (binder.page + 1) * size);
  const qty = ids.reduce((n,id) => n + S.coll[id], 0), doubles = ids.reduce((n,id) => n + Math.max(0,S.coll[id]-1),0);
  view.innerHTML = `<section class="binder-intro"><div><span class="binder-eyebrow">TA COLLECTION PREND VIE</span><h1>Mon classeur</h1><p class="mut">Tes cartes, bien rangées. Tes doubles, au premier coup d’œil.</p></div><div class="binder-actions"><button class="btn" data-scan>＋ Scanner une carte</button><button class="btn ghost" id="binder-add">Ajouter depuis le catalogue</button></div></section>
    <div class="binder-stats"><span><b>${qty}</b> exemplaires</span><span><b>${ids.length}</b> cartes différentes</span><span><b>${collections.length}</b> collections</span><span><b>${doubles}</b> doubles à échanger</span></div>
    ${S.profile ? '' : '<p class="small mut">Mode invité · enregistré sur cet appareil. <a href="#/compte">Créer un compte pour sauvegarder ma collection</a></p>'}
    ${ids.length ? `<div class="binder-toolbar"><label>Collection<select id="binder-collection">${collections.map(g => `<option value="${esc(g.key)}" ${g.key === binder.group ? 'selected' : ''}>${esc(g.name)} · ${g.rows.length} cartes</option>`).join('')}</select></label><label>Langue<select id="binder-lang"><option value="">Toutes les langues</option>${languages.map(l => `<option value="${l}" ${binder.lang === l ? 'selected' : ''}>${LANGS[l]}</option>`).join('')}</select></label><label>Pochettes par page<select id="binder-size">${[[4,'2 × 2'],[9,'3 × 3'],[12,'3 × 4'],[16,'4 × 4']].map(([n,label]) => `<option value="${n}" ${binder.size === n ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="btn ghost" id="binder-doubles" aria-pressed="${binder.doubles}">Doubles uniquement</button><button class="btn ghost" id="binder-slide" aria-pressed="${binder.slide}">${binder.slide ? '■ Arrêter' : '▷ Diaporama'}</button></div>
    <section class="binder-book ${binder.slide ? 'binder-slideshow' : ''}" aria-label="Classeur ouvert"><div class="binder-spine" aria-hidden="true"><i></i><i></i><i></i></div><div class="binder-sheet"><header class="binder-page-heading"><div><span class="binder-eyebrow">COLLECTION</span><h2>${esc(group?.name)}</h2></div><span>${cards.length} cartes · ${binder.lang ? LANGS[binder.lang] : 'Toutes les langues'}</span></header><div class="binder-pockets" style="--binder-cols:${binder.slide ? 1 : binder.size === 4 ? 2 : binder.size === 16 ? 4 : 3}">${visible.map(c => { const q = S.coll[c.id]; return `<article class="binder-pocket" data-id="${esc(c.id)}"><button class="binder-art" data-binder-card="${esc(c.id)}" aria-label="Agrandir ${esc(nm(c))}, ${LANGS[c.lang] || c.lang}">${img(c)}<span class="binder-count ${q > 1 ? 'is-double' : ''}">×${q}${q > 1 ? (q === 2 ? ' · Double' : q === 3 ? ' · Triple' : ' · Exemplaires') : ''}</span></button><div class="binder-card-info"><b>${esc(nm(c))}</b><span>N° ${esc(c.local_id ?? c.num)} · ${flag(c.lang)}</span></div><div class="stepper"><button data-dq="${esc(c.id)}" aria-label="Retirer un exemplaire de ${esc(nm(c))}">−</button><span>${q} ex.</span><button data-iq="${esc(c.id)}" aria-label="Ajouter un exemplaire de ${esc(nm(c))}">+</button></div>${q > 1 ? `<button class="btn ghost sm binder-trade" data-put="${esc(c.id)}">⇄ Échanger mes doubles</button>` : ''}</article>`; }).join('')}${cards.length ? Array.from({length: size - visible.length}, () => '<div class="binder-pocket binder-vacant" aria-hidden="true"><span>✧</span></div>').join('') : '<div class="empty">Aucune carte avec ces filtres. Essaie une autre langue ou désactive le filtre doubles.</div>'}</div><footer class="binder-pagination"><button class="btn ghost" id="binder-prev" ${binder.page === 0 ? 'disabled' : ''} aria-label="Page précédente">← Précédente</button><span role="status">Page <b>${binder.page + 1}</b> / ${pages}</span><button class="btn ghost" id="binder-next" ${binder.page === pages - 1 ? 'disabled' : ''} aria-label="Page suivante">Suivante →</button></footer></div></section><p class="small mut binder-tip">Rangées par numéro, puis par langue : FR, EN, JP… Clique sur une carte pour l’admirer.</p>` : `<div class="binder-empty"><img src="img/logo.webp" alt="" width="84" height="84"><h2>La première page de ton aventure</h2><p>Ajoute tes premières cartes : elles apparaîtront ici, rangées par collection et par langue.</p><button class="btn" data-scan>📷 Scanner ma première carte</button><button class="btn ghost" id="binder-empty-add">Parcourir le catalogue</button></di…23058 tokens truncated…d.eq.${me},target_id.eq.${me}`)), q('posts', x => x.eq('user_id', me)), q('auth_checks', x => x.eq('user_id', me))]);
  const data = { exporte_le: new Date().toISOString(), email: S.user.email, profil, classeur, annonces, offres, messages, avis, forum, controles_authenticite: controles };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `mes-donnees-table-des-doubles.json` });
  a.click(); URL.revokeObjectURL(a.href); toast('Fichier de tes données téléchargé');
}
function deleteAccount() {
  modal(`<form class="form" id="delf"><h2 style="margin:0">Supprimer mon compte</h2>
  <p class="small">Ton classeur, tes annonces, tes messages du forum et tes contrôles seront effacés. Ton profil sera anonymisé. Les transactions terminées restent conservées sans ton nom (obligation comptable). <b>C'est définitif.</b></p>
  <p class="small mut">Pense à <button type="button" class="btn sm ghost" data-export>télécharger tes données</button> avant.</p>
  <label class="f">Pour confirmer, tape ton pseudo : <b>${esc(S.profile.pseudo)}</b><input id="delp" autocomplete="off"></label>
  <p class="err" id="derr"></p><button class="btn red">Supprimer définitivement</button></form>`);
  $('#delf').onsubmit = async e => {
    e.preventDefault(); if ($('#delp').value.trim() !== S.profile.pseudo) return $('#derr').textContent = 'Le pseudo ne correspond pas.';
    const { error } = await sb.rpc('delete_my_account'); if (error) return $('#derr').textContent = errMsg(error);
    await sb.auth.signOut(); try { localStorage.clear(); } catch { } close(); await loadSession(); toast('Ton compte a été supprimé.'); location.hash = '#/';
  };
}

// ---------- événements ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-set],[data-f],[data-tog],[data-iq],[data-dq],[data-put],[data-l],[data-buy],[data-trade],[data-rmlist],[data-report],[data-act],[data-ot],[data-am],[data-ts],[data-card],[data-close],[data-delpost],[data-scan],[data-express],[data-names],[data-connect],[data-auth],[data-export],[data-delacct],[data-prep],[data-label],[data-dl],[data-paylbl],[data-ordlbl],[data-pickrelay],[data-avk],[data-avh]');
  if (!t) return;
  const d = t.dataset;
  if (d.set) { S.set = d.set; classeur(); }
  else if (d.f) { S.filter = d.f; classeur(); }
  else if (d.tog) { if (!S.coll[d.tog]) { await setQty(d.tog, 1); Game.track('add'); await classeur(); checkUnlock(); } else if (S.coll[d.tog] > 1) listForm(d.tog); }
  else if (d.iq) { await setQty(d.iq, (S.coll[d.iq] || 0) + 1); Game.track('add'); await classeur(); checkUnlock(); }
  else if (d.dq) { await setQty(d.dq, (S.coll[d.dq] || 0) - 1); classeur(); }
  else if (d.put) listForm(d.put);
  else if (d.l) listingModal(S.listings.find(l => l.id === d.l));
  else if (d.buy) { const l = S.listings.find(x => x.id === d.buy); if (!needAccount()) buyForm(l); }
  else if (d.trade) tradeForm(S.listings.find(x => x.id === d.trade));
  else if (d.rmlist) { const { error } = await sb.from('listings').update({ status: 'removed' }).eq('id', d.rmlist); if (error) toast(errMsg(error), true); else { toast('Annonce retirée'); close(); route(); } }
  else if (d.report) { if (needAccount()) return; const [type, id] = d.report.split(':'); const { error } = await sb.from('reports').insert({ target_type: type, target_id: id }); toast(error ? errMsg(error) : 'Merci, signalement envoyé à la modération'); }
  else if (d.act) act(d.o, d.act);
  else if (d.prep) prepShip(d.prep);
  else if (d.dl) dlLabel(d.dl);
  else if (d.paylbl) payLabel(d.paylbl);
  else if (d.ordlbl) { const [oid, mode] = d.ordlbl.split(':'); const { data, error } = await sb.rpc('order_label', { p_offer: oid, p_mode: mode }); if (error) return toast(errMsg(error), true); payLabel(data.id); }
  else if ('pickrelay' in d) pickRelay();
  else if ('label' in d) printLabel();
  else if (d.avk !== undefined) { S.pav = [+d.avk, S.pav?.[1] ?? 0]; drawAvPick(); }
  else if (d.avh !== undefined) { S.pav = [S.pav?.[0] ?? 0, +d.avh]; drawAvPick(); }
  else if (d.ot) { S.otab = d.ot; offres(); }
  else if (d.am) { S.amode = d.am; compte(); }
  else if (d.ts !== undefined) { S.tset = d.ts || null; document.querySelectorAll('#tset button').forEach(b => b.setAttribute('aria-pressed', b === t)); drawListings(); }
  else if (d.card) { S.tq = S.cards[d.card]?.name || ''; }
  else if ('close' in d) close();
  else if (d.auth) openAuth(S.cards[d.auth], authH(), { listingId: d.lid, offerId: d.oid });
  else if ('export' in d) exportData();
  else if ('delacct' in d) deleteAccount();
  else if ('scan' in d) scanModal(d.scan || 'add');
  else if ('express' in d) expressModal();
  else if ('names' in d) nameSearch();
  else if ('connect' in d) { const { data, error } = await sb.functions.invoke('payments/connect'); if (error || !data?.url) return toast(data?.error || 'Activation des ventes bientôt disponible.', true); location.href = data.url; }
  else if (d.delpost) { await sb.from('posts').delete().eq('id', d.delpost); forum(); }
});
document.addEventListener('input', e => { if (e.target.id === 'tq') { S.tq = e.target.value; drawListings(); } });
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'tsort') { S.tsort = e.target.value; drawListings(); }
  if (id === 'plang') { S.lang = e.target.value; try { localStorage.setItem('tdd_lang', S.lang); } catch { } pickDefaultSet(); classeur(); }
  if (id === 'pset') { S.set = e.target.value; classeur(); }
});
document.addEventListener('submit', async e => {
  const rf = e.target.closest('[data-review]');
  if (rf) { e.preventDefault(); const [sel, inp] = rf.querySelectorAll('select,input');
    const { error } = await sb.from('reviews').insert({ offer_id: rf.dataset.review, target_id: rf.dataset.target, stars: +sel.value, comment: inp.value.trim() || null });
    if (error) return toast(errMsg(error), true); toast('Merci pour ton avis !'); return offres(); }
  const f = e.target.closest('[data-chat]'); if (!f) return; e.preventDefault();
  const inp = f.querySelector('input'), out = $('#e-' + f.dataset.chat);
  if (!inp.value.trim() || !guardInput(inp, out)) return;
  const { error } = await sb.from('messages').insert({ offer_id: f.dataset.chat, body: inp.value.trim() });
  if (error) return out.textContent = errMsg(error);
  inp.value = ''; loadChat(f.dataset.chat);
});
dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
dlg.addEventListener('close', () => { if (location.hash.startsWith('#/classeur')) classeur(); });

// temps réel : nouveaux messages / offres
function realtime() {
  if (!S.user || realtime.on) return; realtime.on = true;
  sb.channel('me').on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, () => { if (location.hash.startsWith('#/offres')) offres(); else $('#offdot').hidden = false; })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => { if ($('#m-' + p.new.offer_id)) loadChat(p.new.offer_id); else $('#offdot').hidden = false; })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'auctions' }, p => { const a = p.new; if (!leads.has(a.listing_id) || a.top_bidder === S.user.id) return;
      leads.delete(a.listing_id); saveLeads(); if (!a.closed) toast(`🔨 Tu as été surenchéri (${eur(a.current_bid)}) : retourne sur la table pour relancer !`, true); }).subscribe();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.install = e; });
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.user) loadSession().then(() => { realtime(); route(); }); });
window.addEventListener('hashchange', route);
{ let n = 0, tm; $('.logo').addEventListener('click', () => { n++; clearTimeout(tm); tm = setTimeout(() => n = 0, 2500); if (n >= 7) { n = 0; Game.flag('logo'); checkUnlock(); } }); }
document.addEventListener('click', e => { if (e.target.closest('[data-intro]')) { e.preventDefault(); playIntro(true); } });
initFx();
initCritters({
  getCard: () => { const l = Object.values(S.cards).filter(c => c.image); const c = l[Math.floor(Math.random() * l.length)]; return c ? c.image + '/low.webp' : null; },
  onCatch: () => { Game.track('catch'); checkUnlock(); }
});
view.innerHTML = `<div class="skel"><div class="sk sk-ban"></div><div class="grid">${'<div class="sk sk-card"></div>'.repeat(8)}</div></div>`;
await Promise.all([loadCatalog(), loadSession()]);
realtime();
route();
checkUnlock();

// ---------- avatar, profil public, envoi ----------
function drawAvPick() {
  const box = $('#avpick'); if (!box) return; const [k, h] = S.pav || [-1, 0];
  box.innerHTML = `<div class="avgrid">${CRITTER_NAMES.map((n, i) => `<button type="button" class="avopt ${i === k ? 'on' : ''}" data-avk="${i}" title="${n}" aria-label="${n}">${critterSVG(i, h)}</button>`).join('')}</div>
    <div class="avhues">${HUES.map((x, i) => `<button type="button" class="hue ${i === h ? 'on' : ''}" data-avh="${i}" style="background:hsl(${x} 75% 55%)" aria-label="Couleur ${i + 1}"></button>`).join('')}</div>`;
}
async function membre() {
  const id = location.hash.split('/')[2]; if (!id) return home();
  const [{ data: p }, { data: col }, { data: ls }] = await Promise.all([
    sb.from('public_profiles').select('*').eq('id', id).maybeSingle(),
    sb.rpc('public_collection', { p_user: id }),
    sb.from('listings').select('*, card:cards(*)').eq('user_id', id).eq('status', 'active').order('created_at', { ascending: false }).limit(24)
  ]);
  if (!p) { view.innerHTML = '<div class="empty">Membre introuvable.</div>'; return; }
  S.pseudos[id] = p; remember((ls || []).map(l => l.card));
  const all = Object.values(Game.BADGES).flat(), mine = id === S.user?.id;
  const bdg = (p.badges || []).map(b => all.find(x => x.id === b)).filter(Boolean).sort((a, b) => b.tier - a.tier);
  view.innerHTML = `<section class="panel prof th-${p.theme || 'felt'}">
    <div class="prof-av">${av(p.pseudo, p)}</div>
    <div><h1 style="font-size:clamp(22px,4vw,32px)">${esc(p.pseudo)} ${p.passionne ? '<span class="badge-coll">🏅 Collectionneur passionné</span>' : ''}</h1>
      <p class="small mut">${stars(p)} · ${p.trades_done || 0} transaction(s)${p.verified ? ' · ✔ vendeur vérifié' : ''}${p.region ? ' · ' + esc(p.region) : ''} · membre depuis ${new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
      ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}${p.fav ? `<p class="small">❤️ Pokémon préféré : <b>${esc(p.fav)}</b></p>` : ''}
      ${mine ? '<a class="btn sm ghost" href="#/compte">Modifier mon profil</a>' : ''}</div></section>
  <h2>Collection</h2>${!col || col.private ? '<div class="panel small mut">🔒 Collection privée.</div>' : `<div class="panel"><div class="stats" style="margin:0"><div><b>${col.cards}</b><span class="mut small">cartes différentes</span></div><div><b>${col.qty}</b><span class="mut small">cartes au total</span></div></div>
    ${col.sets.length ? `<div class="setbars">${col.sets.map(x => `<div><span class="small">${flag(x.lang)} ${esc(x.name)}</span><div class="bar2"><i style="width:${Math.min(100, x.pct || 0)}%"></i></div><span class="small mono">${x.own}/${x.total}</span></div>`).join('')}</div>` : ''}</div>`}
  <h2>Trophées</h2>${!p.show_badges ? '<div class="panel small mut">🔒 Trophées privés.</div>' : bdg.length ? `<div class="bdgs">${bdg.map(b => `<span class="bdg t${b.tier}" title="${esc(b.desc || '')}">${b.ic} ${esc(b.name)}</span>`).join('')}</div>` : '<div class="panel small mut">Pas encore de trophée.</div>'}
  <h2>Ses doubles sur la table</h2><div class="grid">${(ls || []).map(l => `<button class="tile" data-l="${l.id}">${img(l.card)}<div class="meta"><span class="nm">${esc(nm(l.card))}</span><span class="v">${l.price ? eur(l.price) : '⇄'}</span></div></button>`).join('') || '<p class="mut">Aucun double posé pour le moment.</p>'}</div>`;
  S.listings = [...(S.listings || []).filter(x => !ls?.some(y => y.id === x.id)), ...(ls || [])];
}
async function prepShip(oid) {
  const [{ data: to, error }, { data: me }] = await Promise.all([sb.rpc('offer_address', { p_offer: oid }), sb.from('addresses').select('*').eq('user_id', S.user.id).maybeSingle()]);
  if (error) return toast(errMsg(error), true);
  const fmt = a => a ? `${esc(a.name)}<br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.zip)} ${esc(a.city)}<br>${esc(a.country)}` : '';
  S.lbl = { to: fmt(to), from: fmt(me), ref: oid.slice(0, 8).toUpperCase() };
  modal(`<div class="form"><h2 style="margin:0">📦 Préparer l'envoi</h2>
    ${to?.name ? `<div class="panel"><p class="small mut" style="margin:0 0 4px">Destinataire</p><p style="margin:0">${S.lbl.to}</p></div>` : '<p class="err">Ton partenaire n\'a pas encore renseigné son adresse. Préviens-le dans la messagerie de l\'offre.</p>'}
    ${!me ? '<p class="small err">Renseigne aussi <a href="#/compte">ton adresse</a> (expéditeur, en cas de retour).</p>' : ''}
    <ol class="small"><li>Emballe : sleeve → toploader → cartons → enveloppe à bulles. <a href="#/guide" target="_blank">Guide illustré</a></li>
    <li>Achète un envoi <b>suivi</b> : <a href="https://www.laposte.fr/lettre-suivie" target="_blank" rel="noopener">Lettre suivie en ligne</a> (moins de 50 €) ou Colissimo (au-delà).</li>
    <li>Imprime l'étiquette ci-dessous et colle-la, puis dépose le colis.</li><li>Clique « J'ai expédié » et colle le numéro de suivi.</li></ol>
    <div class="acts">${to?.name ? '<button class="btn" data-label>🖨️ Imprimer l\'étiquette</button>' : ''}<button class="btn ghost" data-act="ship" data-o="${oid}">J'ai expédié</button></div></div>`);
}
function printLabel() {
  const L = S.lbl, w = window.open('', '_blank'); if (!w || !L) return toast('Autorise les fenêtres pop-up pour imprimer.', true);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Étiquette ${L.ref}</title><style>@page{size:A6 landscape;margin:6mm}body{font:15px/1.35 system-ui,sans-serif;margin:0}
  .l{border:2px solid #000;border-radius:6px;padding:10px 14px;max-width:140mm}.f{font-size:11px;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:8px}.t{font-size:19px;font-weight:700}
  .r{display:flex;justify-content:space-between;font-size:11px;margin-top:8px}.np{font-weight:800;letter-spacing:.1em}</style>
  <div class="l"><div class="f"><b>Expéditeur :</b><br>${L.from || '—'}</div><div>À :</div><div class="t">${L.to}</div>
  <div class="r"><span class="np">NE PAS PLIER</span><span>Sharing Cards · réf. ${L.ref}</span></div></div><script>onload=()=>print()<\/script>`);
  w.document.close();
}

// ---------- livraison : bordereaux prépayés ----------
const SHIP = () => [['relay', '📍', 'Point relais', S.st.ship_relay ?? 3.9, 'Bordereau prépayé fourni, dépôt en relais'], ['home', '🏠', 'Colissimo domicile', S.st.ship_home ?? 6.9, 'Bordereau prépayé, assuré, remise à domicile'], ['manual', '✉️', 'Lettre suivie', 0, 'Le vendeur achète l\'envoi lui-même (moins cher, sans bordereau fourni)']];
function buyForm(l) {
  const f = buyerFee(l.price), rec = l.price >= 50 ? 'home' : 'relay';
  $('#ofr').innerHTML = `<div class="panel"><h3 style="margin:0 0 8px">Livraison</h3><div class="shipopts">${SHIP().map(([k, i, n, p, d]) => `<label class="shipopt"><input type="radio" name="shm" value="${k}" ${k === rec ? 'checked' : ''}><span><b>${i} ${n}</b> <span class="mono">${p ? eur(p) : 'à voir avec le vendeur'}</span>${k === rec ? ' <span class="pill p-NM">conseillé</span>' : ''}<small>${d}</small></span></label>`).join('')}</div>
    <p class="small" id="relayline" style="margin:8px 0 0"></p>
    <dl class="kv" style="margin-top:12px"><dt>Carte</dt><dd>${eur(l.price)}</dd><dt>Protection acheteur</dt><dd>${eur(f)}</dd><dt>Livraison</dt><dd id="shp"></dd><dt><b>Total</b></dt><dd><b id="tot"></b></dd></dl>
    <p class="small mut">Le vendeur accepte d'abord. Tu paies ensuite : l'argent reste bloqué jusqu'à ce que tu confirmes la réception. Le bordereau est généré pour le vendeur, rien à faire de ton côté.</p>
    ${gtip('paiement', 'Paiement bloqué, livraison, réception : comment ça marche ?')}
    <button class="btn" id="cbuy">Confirmer l'offre d'achat</button><p class="err" id="berr"></p></div>`;
  const upd = async () => { const m = $('#ofr input[name=shm]:checked').value, p = SHIP().find(x => x[0] === m)[3];
    $('#shp').textContent = p ? eur(p) : '—'; $('#tot').textContent = eur(l.price + f + p);
    if (m === 'relay') { const { data: a } = await sb.from('addresses').select('relay').eq('user_id', S.user.id).maybeSingle(); $('#relayline').innerHTML = `📍 Ton point relais : <b>${esc(a?.relay?.name || 'pas encore choisi')}</b> <button class="btn sm ghost" data-pickrelay>${a?.relay ? 'Changer' : 'Choisir'}</button>`; }
    else $('#relayline').innerHTML = ''; };
  $('#ofr').onchange = upd; upd();
  $('#cbuy').onclick = async () => { const m = $('#ofr input[name=shm]:checked').value;
    if (m !== 'manual') { const { data: a } = await sb.from('addresses').select('relay').eq('user_id', S.user.id).maybeSingle();
      if (!a) return $('#berr').innerHTML = 'Renseigne d\'abord ton adresse dans <a href="#/compte">Compte</a>.';
      if (m === 'relay' && !a.relay) return $('#berr').textContent = 'Choisis ton point relais.'; }
    sendOffer(l, l.price, [], m); };
}
async function pickRelay() {
  const { data: a } = await sb.from('addresses').select('zip').eq('user_id', S.user.id).maybeSingle();
  if (!a) return toast('Renseigne d\'abord ton adresse dans Compte.', true);
  const box = document.createElement('div'); box.className = 'relaypick panel';
  box.innerHTML = `<div class="acts"><input id="rzip" value="${esc(a.zip)}" inputmode="numeric" style="max-width:140px" aria-label="Code postal"><button class="btn sm" id="rgo">Chercher</button><button class="btn sm ghost" id="rx">Fermer</button></div><div id="rlist" class="small mut">…</div>`;
  document.body.appendChild(box);
  const go = async () => { const { data, error } = await sb.functions.invoke('shipping/relays?zip=' + encodeURIComponent($('#rzip').value), { method: 'GET' });
    if (error || data?.error) return $('#rlist').textContent = data?.error || 'Recherche indisponible.';
    $('#rlist').innerHTML = (data.test ? '<p class="small">Mode test : points relais fictifs.</p>' : '') + data.relays.map((r, i) => `<button class="relay" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.address)} · ${esc(r.distance || '')}</span></button>`).join('');
    $('#rlist').onclick = async e => { const b = e.target.closest('.relay'); if (!b) return; const r = data.relays[+b.dataset.i];
      const { error } = await sb.from('addresses').update({ relay: { id: r.id, name: r.name, address: r.address } }).eq('user_id', S.user.id);
      if (error) return toast(errMsg(error), true); box.remove(); toast('Point relais enregistré'); if ($('#myrelay')) $('#myrelay').textContent = r.name; $('#ofr')?.dispatchEvent(new Event('change')); }; };
  $('#rgo').onclick = go; $('#rx').onclick = () => box.remove(); go();
}
async function fillShips() {
  const boxes = [...document.querySelectorAll('.shipbox')]; if (!boxes.length) return;
  const { data: sh } = await sb.from('shipments').select('*').in('offer_id', boxes.map(b => b.dataset.shipo)).eq('sender_id', S.user.id);
  const by = Object.fromEntries((sh || []).map(x => [x.offer_id, x]));
  const TR = ['Étiquette créée', 'Déposé', 'En transit', 'Livré'], idx = { created: -1, label_ready: 0, in_transit: 2, delivered: 3 };
  for (const b of boxes) {
    const x = by[b.dataset.shipo], oid = b.dataset.shipo;
    if (x?.label_path) b.innerHTML = `<div class="shipok"><button class="btn" data-dl="${x.id}">📄 Télécharger mon bordereau</button><span class="small">Suivi : <span class="mono">${esc(x.tracking)}</span>${x.provider === 'test' ? ' <span class="pill p-GD">test</span>' : ''}</span></div>
      <div class="track">${TR.map((t, i) => `<span class="${i <= idx[x.status] ? 'done' : ''}">${t}</span>`).join('')}</div><p class="small mut">Emballe la carte (sleeve → toploader → cartons), colle le bordereau et dépose le colis.</p>${gtip('emballer', 'Guide d\'emballage illustré')}`;
    else if (!x && b.dataset.shipped === '1') b.remove();
    else if (x?.paid) b.innerHTML = `<button class="btn" data-dl="${x.id}">📄 Générer mon bordereau</button> <span class="small mut">${x.mode === 'relay' ? 'Point relais' : 'Colissimo'} · payé</span>`;
    else if (x) b.innerHTML = `<button class="btn" data-paylbl="${x.id}">Payer mon bordereau (${eur(x.price)})</button> <span class="small mut">${x.mode === 'relay' ? '📍 Point relais' : '🏠 Colissimo'}</span>`;
    else b.innerHTML = `<p class="small" style="margin:0 0 6px"><b>📦 Ton envoi</b> : choisis comment expédier.</p><div class="acts">${SHIP().filter(s => s[0] !== 'manual').map(([k, i, n, p]) => `<button class="btn sm" data-ordlbl="${oid}:${k}">${i} ${n} · ${eur(p)}</button>`).join('')}<button class="btn sm ghost" data-prep="${oid}">✉️ Je m'en occupe</button></div>${gtip('envoi', 'Quel envoi choisir ?')}`;
  }
}
async function payLabel(id) {
  const { data, error } = await sb.functions.invoke('payments/label', { body: { shipment_id: id } });
  if (error || data?.error) return toast(data?.error || 'Paiement indisponible.', true);
  if (data.paid) return dlLabel(id); location.href = data.url;
}
async function dlLabel(id) {
  toast('Préparation du bordereau…');
  const { data, error } = await sb.functions.invoke('shipping/create', { body: { shipment_id: id } });
  if (error || data?.error) return toast(data?.error || 'Bordereau indisponible, réessaie.', true);
  window.open(data.url, '_blank'); fillShips();
}

// œil sur les champs mot de passe : afficher / masquer
const eyeSVG = o => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${o ? '' : '<path d="M4 4l16 16"/>'}</svg>`;
function eyes(root = document) {
  root.querySelectorAll?.('input[type=password]:not([data-eye])').forEach(i => {
    i.dataset.eye = 1; const w = document.createElement('span'); w.className = 'pwd'; i.replaceWith(w); w.append(i);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'eye'; b.setAttribute('aria-label', 'Afficher le mot de passe'); b.innerHTML = eyeSVG(true);
    b.onclick = () => { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = eyeSVG(!show); b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); i.focus(); };
    w.append(b);
  });
}
new MutationObserver(() => eyes()).observe(document.body, { childList: true, subtree: true }); eyes();

// ---------- tendance des cotes ----------
function trend(c) {
  if (!c?.price_prev || !c.price_eur) return '';
  const d = (c.price_eur - c.price_prev) / c.price_prev; if (Math.abs(d) < .02) return '';
  return ` <span class="tr ${d > 0 ? 'up' : 'dn'}" title="Avant : ${eur(c.price_prev)}">${d > 0 ? '▲' : '▼'}${Math.abs(Math.round(d * 100))}%</span>`;
}
async function sparks() {
  for (const el of document.querySelectorAll('.spark[data-spark]:not([data-done])')) {
    el.dataset.done = 1; if (!el.dataset.spark) continue;
    const data = await priceHist(el.dataset.spark);
    if (data.length < 2) { el.innerHTML = '<span class="small mut">Historique en construction : la courbe apparaîtra dans quelques jours.</span>'; continue; }
    const { mn, mx, up, line } = curve(data, 220, 48);
    el.innerHTML = `<svg viewBox="0 0 220 48" class="${up ? 'up' : 'dn'}"><polyline points="${line}"/></svg><span class="small mut">min ${eur(mn)} · max ${eur(mx)} · ${data.length} relevés</span>`;
  }
}
