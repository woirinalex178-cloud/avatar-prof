import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { openAuth } from './auth.js';
import * as Game from './game.js';
import { renderLegal } from './legal.js';
import { playIntro } from './intro.js';
import { initCritters, critterSVG, CRITTER_NAMES, HUES } from './critters.js';
import { renderGuide } from './guide.js';
import { initFx, refreshFx } from './fx.js';
playIntro();

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const S = { user: null, profile: null, sets: [], cards: {}, bySet: {}, set: null, lang: 'fr', coll: {}, fee: 0.0001, filter: 'all', pseudos: {}, prog: {} };
const LANGS = { fr: 'Français', en: 'Anglais (US/UK)', ja: 'Japonais', de: 'Allemand', it: 'Italien', es: 'Espagnol', pt: 'Portugais' };
const flag = l => `<span class="lang">${l === 'ja' ? 'JP' : l.toUpperCase()}</span>`;
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
function guide() { view.innerHTML = renderGuide(); }
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
    <div class="seg"><a class="btn" href="#/classeur">Remplir mon classeur</a><a class="btn ghost" href="#/table">Voir la table</a><button class="btn ghost" data-scan>📷 Scanner / 🔍 Authentifier</button></div>
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
  <div class="grid">${top.map(c => `<a class="tile" href="#/table" data-card="${c.id}">${img(c)}<div class="meta"><span class="nm">${esc(nm(c))}</span><span class="v">${eur(c.price_eur)}</span></div></a>`).join('') || '<p class="mut">Catalogue en cours de chargement…</p>'}</div>`;
}

function setPicker() {
  const sets = S.sets.filter(s => s.lang === S.lang), groups = {};
  for (const s of sets) (groups[s.serie_name || 'Autres'] ||= []).push(s);
  return `<div class="pickers">
    <label class="f">Langue<select id="plang">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${n} (${S.sets.filter(s => s.lang === k).length} sets)</option>`).join('')}</select></label>
    <label class="f">Extension<select id="pset">${Object.entries(groups).map(([g, ss]) => `<optgroup label="${esc(g)}">${ss.map(s => `<option value="${s.id}" ${s.id === S.set ? 'selected' : ''}>${s.lang === 'ja' ? s.code + ' · ' : ''}${esc(setName(s))}${s.released ? ' · ' + s.released.slice(0, 4) : ''}${S.prog[s.id] ? ` · ${setPct(s)}%` : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
  </div>`;
}
async function classeur() {
  if (!S.set) { view.innerHTML = '<div class="empty">Catalogue en cours d\'import, reviens dans quelques minutes.</div>'; return; }
  await loadSet(S.set);
  Game.visit();
  const p = progress(S.set), { st, ev: t } = await gameState(), dl = Game.daily();
  const list = p.cs.filter(c => { const q = S.coll[c.id] || 0; return S.filter === 'all' || (S.filter === 'own' && q) || (S.filter === 'miss' && !q) || (S.filter === 'dbl' && q > 1); });
  view.innerHTML = `
  ${S.profile ? '' : `<div class="banner"><span>Mode invité : ton classeur est enregistré sur cet appareil. Crée ton compte pour le sauvegarder et échanger.</span><a class="btn sm" href="#/compte">Créer mon compte</a></div>`}
  <div class="felt">
    <div class="dash">
      <div class="ring" style="--p:${p.pct}"><span>${p.pct}%<small>${p.main}/${p.set?.total ?? '?'}</small></span></div>
      <div>
        ${setPicker()}
        <p class="small mut" style="margin:6px 0 0">${flag(S.lang)} ${esc(p.set?.serie_name || '')} · ${esc(setName(p.set))} · ${p.set?.released ? new Date(p.set.released).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''}${S.lang === 'ja' ? ' · cotes japonaises non disponibles' : ''}</p>
        <div class="kpis" style="margin-top:12px"><div><b>${eur(p.value)}</b><span>valeur de ce set</span></div><div><b>${p.owned}</b><span>cartes différentes</span></div><div><b>${p.doubles}</b><span>doubles</span></div><div><b>Niv. ${t.lvl}</b><span>${esc(t.title)} · ${t.xp} XP</span></div><div><b>🔥 ${st.streak}</b><span>jour(s) de suite</span></div></div>
        <div class="xp"><i style="width:${t.pct}%"></i></div>
        <p class="small" style="margin:8px 0 0">🎯 Défi du jour : ajoute ${dl.n} cartes — ${dl.done ? '<b class="dn">réussi ✔</b>' : `${dl.cur}/${dl.n}`}</p>
        <div class="badges">${t.got.slice(-5).reverse().map(b => `<span class="bdg on">${b.ic} ${esc(b.name)}</span>`).join('')}<a class="bdg" href="#/trophees">🏆 ${t.got.length}/${t.total} trophées →</a></div>
      </div>
    </div>
  </div>
  <div class="bar" style="margin-top:18px"><div class="seg" id="flt">${[['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']].map(([k, n]) => `<button data-f="${k}" aria-pressed="${S.filter === k}">${n}</button>`).join('')}</div>
  <button class="btn sm" data-scan>📷 Scanner une carte</button></div>
  <div class="grid">${list.map(c => { const q = S.coll[c.id] || 0; return `<div class="tile ${q ? '' : 'miss'}" data-id="${c.id}">
    <button class="tile" data-tog="${c.id}" aria-label="${esc(nm(c))} : ${q} exemplaire(s)" style="padding:0">${img(c)}</button>
    ${q ? `<span class="qty ${q > 1 ? 'dbl' : ''}">×${q}</span>` : ''}
    <div class="meta"><span class="nm">${c.local_id} · ${esc(nm(c))}</span><span class="v">${eur(c.price_eur)}</span></div>${jp(c)}
    <div class="stepper"><button data-dq="${c.id}" aria-label="Retirer un">−</button>${q > 1 ? `<button class="put" data-put="${c.id}">Poser</button>` : ''}<button data-iq="${c.id}" aria-label="Ajouter un">+</button></div>
  </div>`; }).join('') || '<div class="empty">Rien ici pour l\'instant.</div>'}</div>`;
}

async function fetchListings(filter = {}) {
  let q = sb.from('listings').select('*, card:cards(*, set:sets(name,name_fr,code,serie_name))').eq('status', 'active').order('created_at', { ascending: false }).limit(200);
  if (filter.card) q = q.eq('card_id', filter.card);
  const { data, error } = await q; if (error) throw error;
  await pseudos((data || []).map(l => l.user_id));
  return data || [];
}
async function table() {
  view.innerHTML = `<div class="felt"><div class="bar">
    <div class="seg" id="tset"><button data-ts="" aria-pressed="${!S.tset}">Toutes langues</button>${Object.keys(LANGS).map(k => `<button data-ts="${k}" aria-pressed="${S.tset === k}">${k === 'ja' ? 'JP' : k.toUpperCase()}</button>`).join('')}</div>
    <input class="grow" id="tq" placeholder="Chercher une carte…" aria-label="Chercher" value="${esc(S.tq || '')}">
    <select id="tsort" aria-label="Trier" style="width:auto"><option value="new">Plus récentes</option><option value="cheap">Prix ↑</option><option value="deal">Meilleure affaire</option><option value="miss">Il me manque</option></select>
  </div><div class="grid" id="lgrid">${'<div class="skel"></div>'.repeat(6)}</div></div>`;
  $('#tsort').value = S.tsort || 'new';
  S.listings = await fetchListings();
  drawListings();
}
function drawListings() {
  const q = (S.tq || '').toLowerCase(), so = S.tsort || 'new';
  let ls = S.listings.filter(l => (!S.tset || l.card.lang === S.tset) && `${l.card.name} ${l.card.name_fr || ''} ${l.card.set?.name} ${l.card.set?.name_fr || ''} ${l.card.set?.code || ''} ${l.card.set?.serie_name}`.toLowerCase().includes(q));
  if (so === 'cheap') ls.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  if (so === 'deal') ls.sort((a, b) => ((a.price ?? 1e9) / (a.card.price_eur || 1e9)) - ((b.price ?? 1e9) / (b.card.price_eur || 1e9)));
  if (so === 'miss') ls = ls.filter(l => !S.coll[l.card_id]);
  $('#lgrid').innerHTML = ls.map(l => {
    const d = l.price && l.card.price_eur ? l.price / l.card.price_eur - 1 : null, mine = l.user_id === S.user?.id;
    return `<button class="tile lcard" data-l="${l.id}">${l.photo_path ? `<img class="cimg" loading="lazy" src="${photoUrl(l.photo_path)}" alt="Photo vendeur ${esc(nm(l.card))}">` : img(l.card)}
    ${!S.coll[l.card_id] && !mine ? '<span class="pill p-miss badge-miss">Il te manque</span>' : ''}
    <div class="meta"><span class="nm">${esc(nm(l.card))}</span><span class="v">${l.price ? eur(l.price) : 'Échange'}</span></div>
    <div class="seller"><span>${flag(l.card.lang)} ${esc(setName(l.card.set))}</span></div>
    <div class="seller"><span><span class="pill p-${l.condition}">${l.condition}</span> ${l.trade_ok ? '<span class="pill p-tr">échange</span>' : ''} ${authBadge(l)}</span>${d != null ? `<span class="delta ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${Math.round(d * 100)}% cote</span>` : ''}</div>
    <div class="seller"><span>${mine ? 'Ton annonce' : esc(S.pseudos[l.user_id]?.pseudo || '')}</span><span>${stars(S.pseudos[l.user_id])}${S.pseudos[l.user_id]?.verified ? ' ✔' : ''}${S.pseudos[l.user_id]?.passionne ? ' 🏅' : ''}</span></div></button>`;
  }).join('') || `<div class="empty" style="grid-column:1/-1">Aucun double sur la table pour l'instant. <a href="#/classeur">Pose les tiens depuis ton classeur.</a></div>`;
}

function listingModal(l) {
  const c = l.card, s = S.pseudos[l.user_id] || {}, mine = l.user_id === S.user?.id;
  modal(`<div class="split"><div>${l.photo_path ? `<img class="cimg" src="${photoUrl(l.photo_path)}" alt="Photo du vendeur">` : img(c, true)}${l.photo_path ? `<p class="small mut">Photo du vendeur · <a href="${c.image}/high.webp" target="_blank" rel="noopener">voir la carte officielle</a></p>` : ''}</div>
  <div><p class="mut small">${flag(c.lang)} ${LANGS[c.lang]} · ${esc(setName(S.sets.find(x => x.id === c.set_id)))} · ${c.local_id} · ${esc(c.rarity || '')}</p><h2 style="margin:4px 0 12px">${esc(nm(c))}</h2>${jp(c)}
  <dl class="kv"><dt>Prix</dt><dd>${l.price ? eur(l.price) : 'Échange uniquement'}</dd><dt>Cote (tendance)</dt><dd>${eur(c.price_eur)}</dd><dt>État</dt><dd><span class="pill p-${l.condition}">${l.condition}</span> ${COND[l.condition][0]}</dd><dt>Échange</dt><dd>${l.trade_ok ? 'accepté' : 'non'}</dd><dt>Vendeur</dt><dd>${who(l.user_id, s)} · ${stars(s)} · ${s.trades_done || 0} transaction(s)${s.verified ? ' · ✔ identité vérifiée' : ''}${s.passionne ? '<span class="badge-coll">🏅 Collectionneur passionné</span>' : ''} · ${esc(s.region || '')}</dd></dl>
  ${l.note ? `<p class="panel small" style="margin-top:12px">${esc(l.note)}</p>` : ''}
  ${l.auth_score != null ? `<div class="panel small" style="margin-top:10px">${authBadge(l)} <b>Contrôle photo d'authenticité : ${l.auth_score}/100</b> — ${esc(l.auth_report?.meta?.verdict || '')} (fiabilité ${esc(l.auth_report?.meta?.confidence || '?')}). <span class="mut">Indicatif, tu pourras refaire le contrôle à la réception.</span></div>` : ''}
  ${l.photo_path && l.verify_code ? `<p class="small mut">Code de vérification attendu sur la photo : <b class="mono">${esc(l.verify_code)}</b>. S'il n'y est pas, signale l'annonce.</p>` : ''}
  <div id="ofr" style="margin-top:16px">${mine ? `<button class="btn ghost" data-rmlist="${l.id}">Retirer de la table</button>` : `<div class="acts">${l.price ? `<button class="btn" data-buy="${l.id}">Acheter ${eur(l.price)}</button>` : ''}${l.trade_ok ? `<button class="btn ghost" data-trade="${l.id}">Proposer un échange</button>` : ''}<button class="btn ghost sm" data-report="listing:${l.id}">Signaler</button></div>`}</div>
  <p class="small mut" style="margin-top:14px">🔒 Paiement et échange uniquement dans l'appli. Ne partage jamais tes coordonnées : sans transaction dans l'appli, pas de protection.</p></div></div>`);
}
async function tradeForm(l) {
  if (needAccount()) return;
  const { data: mine } = await sb.from('listings').select('*, card:cards(*)').eq('user_id', S.user.id).eq('status', 'active');
  const target = l.price || l.card.price_eur || 0;
  $('#ofr').innerHTML = `<div class="form"><h3>Ton offre pour ${esc(nm(l.card))}</h3>
  ${mine?.length ? `<p class="small mut">Choisis parmi tes doubles posés sur la table :</p><div class="pick">${mine.map(m => `<label><input type="checkbox" value="${m.id}" data-v="${m.price || m.card.price_eur || 0}"><div>${img(m.card)}<small>${esc(nm(m.card))} · ${m.condition}</small></div></label>`).join('')}</div>` : `<p class="small mut">Tu n'as pas encore de double sur la table. <a href="#/classeur">Pose-en depuis ton classeur</a>, ou propose uniquement de l'argent.</p>`}
  <label class="f">Complément en € <input type="number" id="cash" min="0" step="1" value="0" inputmode="numeric"></label>
  <div class="bal"><i id="bi"></i></div><p class="small" id="bs"></p>
  <p class="small mut">Échange carte contre carte : gratuit pendant la bêta. Si tu ajoutes de l'argent, la protection acheteur s'applique sur ce montant.</p>
  <button class="btn" id="sendoffer">Envoyer l'offre</button><p class="err" id="oerr"></p></div>`;
  const calc = () => { const ids = [...$('#ofr').querySelectorAll('input[type=checkbox]:checked')], v = ids.reduce((a, i) => a + +i.dataset.v, 0) + (+$('#cash').value || 0), r = target ? v / target : 1;
    $('#bi').style.width = Math.min(100, r * 100) + '%'; $('#bs').innerHTML = `Valeur proposée <b class="mono">${eur(v)}</b> pour ${eur(target)} · ${r >= .95 ? '<span class="dn">offre équilibrée</span>' : '<span class="up">risque de refus</span>'}`;
    return { ids: ids.map(i => i.value), cash: +$('#cash').value || 0 }; };
  $('#ofr').oninput = calc; calc();
  $('#sendoffer').onclick = async () => { const { ids, cash } = calc(); if (!ids.length && !cash) return $('#oerr').textContent = 'Ajoute au moins un double ou un montant.'; await sendOffer(l, cash, ids); };
}
async function sendOffer(l, cash, ids = [], ship_mode = 'manual') {
  if (needAccount()) return;
  const { error } = await sb.from('offers').insert({ listing_id: l.id, buyer_id: S.user.id, seller_id: S.user.id, cash, offered_listing_ids: ids, ship_mode });
  if (error) return toast(errMsg(error), true);
  close(); toast('Offre envoyée ! Suis-la dans « Offres ».');
}

async function listForm(cardId) {
  if (needAccount()) return;
  const c = S.cards[cardId], code = Math.random().toString(36).slice(2, 7).toUpperCase(), need = (c.price_eur || 0) >= (S.st.photo_required_from || 50);
  modal(`<div class="split"><div>${img(c, true)}</div><form class="form" id="lf"><h2 style="margin:0">Poser sur la table</h2><p class="mut small" style="margin:0">${esc(nm(c))} · ${c.local_id} · cote ${eur(c.price_eur)}</p>
    <label class="f">État<select id="lc">${Object.entries(COND).map(([k, v]) => `<option value="${k}">${k} · ${v[0]} — ${v[1]}</option>`).join('')}</select></label>
    <div class="row2"><label class="f">Prix de vente (€)<input type="number" id="lp" min="0.5" step="0.5" inputmode="decimal"></label><label class="ck" style="align-self:end"><input type="checkbox" id="lt" checked> J'accepte les échanges</label></div>
    <p class="small mut" id="lhint" style="margin:0"></p>
    <div class="panel small">🔐 Écris ce code sur un papier et photographie-le à côté de ta carte : <b class="mono" style="font-size:18px">${code}</b><br><span class="mut">Il prouve que tu as vraiment la carte. ${need ? 'Photo obligatoire pour cette carte (cote ≥ ' + eur(S.st.photo_required_from || 50) + ').' : 'Recommandé.'}</span></div>
    <label class="f">Photo de TA carte avec le code<input type="file" id="lph" accept="image/*" capture="environment" ${need ? 'required' : ''}></label>
    <label class="f">Note (optionnel, 280 car.)<textarea id="ln" maxlength="280" placeholder="Ex : sortie de booster, sous sleeve depuis."></textarea></label>
    <p class="err" id="lerr"></p><button class="btn">Poser mon double</button></form></div>`);
  const hint = () => { const k = COND[$('#lc').value][2], sug = c.price_eur ? Math.max(0.5, Math.round(c.price_eur * k * 2) / 2) : null; $('#lp').placeholder = sug ?? 'Prix'; $('#lhint').textContent = sug ? `Prix conseillé en ${$('#lc').value} : ${eur(sug)} (cote × ${k}). Laisse vide pour échange seul.` : 'Laisse vide pour échange seul.'; };
  $('#lc').onchange = hint; hint();
  $('#ln').oninput = () => guardInput($('#ln'), $('#lerr'));
  $('#lf').onsubmit = async e => {
    e.preventDefault(); if (!guardInput($('#ln'), $('#lerr'))) return;
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Envoi…';
    try {
      let photo_path = null; const f = $('#lph').files[0];
      if (f) { const blob = await shrink(f); photo_path = `${S.user.id}/${crypto.randomUUID()}.jpg`; const up = await sb.storage.from('photos').upload(photo_path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error; }
      const price = $('#lp').value ? +$('#lp').value : null, trade_ok = $('#lt').checked;
      if (!price && !trade_ok) throw new Error('Indique un prix ou accepte les échanges.');
      const { error } = await sb.from('listings').insert({ user_id: S.user.id, card_id: c.id, condition: $('#lc').value, price, trade_ok, note: $('#ln').value.trim() || null, photo_path, verify_code: code });
      if (error) throw error;
      close(); toast('Double posé sur la table !');
    } catch (err) { $('#lerr').textContent = errMsg(err); btn.disabled = false; btn.textContent = 'Poser mon double'; }
  };
}
function shrink(file) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => { const k = Math.min(1, 1200 / Math.max(i.width, i.height)), cv = document.createElement('canvas'); cv.width = i.width * k; cv.height = i.height * k; cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height); cv.toBlob(b => b ? res(b) : rej(new Error('Image illisible')), 'image/jpeg', .82); URL.revokeObjectURL(i.src); }; i.onerror = () => rej(new Error('Image illisible')); i.src = URL.createObjectURL(file); });
}

// ---------- reconnaissance photo ----------
async function loadTesseract() {
  if (window.Tesseract) return;
  await new Promise((r, j) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.onload = r; sc.onerror = () => j(new Error('Lecture photo indisponible, saisis le numéro.')); document.head.append(sc); });
}
function scanModal() {
  modal(`<div class="form"><h2 style="margin:0">Scanner une carte</h2><p class="small mut" style="margin:0">Carte à plat, bien éclairée, en entier. L'appli lit le numéro en bas (ex. 199/165) et le nom, puis te propose les cartes correspondantes.</p>
  <label class="btn" style="cursor:pointer">📷 Prendre ou choisir une photo<input type="file" id="scf" accept="image/*" capture="environment" hidden></label>
  <div class="row2"><label class="f">Ou saisis le numéro<input id="scn" placeholder="199/165" inputmode="numeric"></label><label class="f">Nom (optionnel)<input id="scw" placeholder="Dracaufeu"></label></div>
  <button class="btn ghost" id="scgo">Chercher</button><p class="small mut" id="scs" role="status"></p><div class="grid" id="scr"></div></div>`);
  $('#scf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; $('#scs').textContent = 'Lecture de la carte… (la première fois peut prendre 10 secondes)';
    try {
      await loadTesseract();
      const { data: { text } } = await Tesseract.recognize(await shrink(f), 'eng');
      const m = [...text.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)].pop(), words = (text.match(/[A-Za-zÀ-ÿ-]{4,}/g) || []).slice(0, 15);
      if (m) { $('#scn').value = `${m[1]}/${m[2]}`; Game.track('scan'); }
      await scanSearch(words);
    } catch (err) { $('#scs').textContent = err.message; }
  };
  $('#scgo').onclick = () => scanSearch();
}
async function scanSearch(extra = []) {
  const v = $('#scn').value.match(/(\d{1,3})\s*(?:\/\s*(\d{2,3}))?/);
  if (!v) return $('#scs').textContent = 'Numéro non trouvé sur la photo : saisis-le (ex. 199/165).';
  const words = [...extra, ...$('#scw').value.split(/\s+/)].filter(w => w.length >= 4);
  const { data, error } = await sb.rpc('scan_match', { p_num: v[1], p_total: v[2] ? +v[2] : null, p_words: words, p_lang: S.lang });
  if (error) return $('#scs').textContent = error.message;
  remember(data);
  $('#scs').textContent = data.length ? 'Touche la bonne carte pour l\'ajouter à ton classeur, ou « Authentifier » pour vérifier qu\'elle est vraie :' : 'Aucune carte trouvée. Vérifie le numéro.';
  $('#scr').innerHTML = data.map(c => `<div class="tile"><button class="tile" data-scanadd="${c.id}" title="Ajouter au classeur">${img(c)}<div class="meta"><span class="nm">${flag(c.lang)} ${esc(nm(c))}</span></div><div class="small mut">${esc(c.set_name)} · ${c.local_id}${S.coll[c.id] ? ' · déjà ×' + S.coll[c.id] : ''}</div></button><button class="btn sm ghost" data-auth="${c.id}">🔍 Authentifier</button></div>`).join('');
}

// ---------- offres ----------
function stepOf(o) {
  if (o.status === 'pending') return 0; if (o.status === 'accepted') return 1; if (o.status === 'completed') return 5;
  const needB = o.offered_listing_ids.length > 0;
  if (o.buyer_received && (!needB || o.seller_received)) return 5;
  if (o.buyer_received || o.seller_received) return 4;
  if (o.seller_shipped || o.buyer_shipped) return 3;
  return 2;
}
async function offres() {
  if (!S.profile) { view.innerHTML = `<div class="empty"><h2>Tes offres</h2><p>Connecte-toi pour voir tes offres.</p><a class="btn" href="#/compte">Se connecter</a></div>`; return; }
  const { data: os } = await sb.from('offers').select('*, listing:listings(*, card:cards(*))').order('updated_at', { ascending: false });
  const extra = [...new Set((os || []).flatMap(o => o.offered_listing_ids))];
  const { data: xl } = extra.length ? await sb.from('listings').select('*, card:cards(*)').in('id', extra) : { data: [] };
  const X = Object.fromEntries((xl || []).map(l => [l.id, l]));
  await pseudos((os || []).flatMap(o => [o.buyer_id, o.seller_id]));
  const { data: rv } = await sb.from('reviews').select('offer_id').eq('author_id', S.user.id); S.reviewed = new Set((rv || []).map(r => r.offer_id));
  const tab = S.otab || 'in', list = (os || []).filter(o => tab === 'in' ? o.seller_id === S.user.id : o.buyer_id === S.user.id);
  view.innerHTML = `<h2>Mes offres</h2><div class="seg" id="otab" style="margin-bottom:16px"><button data-ot="in" aria-pressed="${tab === 'in'}">Reçues</button><button data-ot="out" aria-pressed="${tab === 'out'}">Envoyées</button></div>
  ${list.map(o => offerCard(o, X)).join('') || '<div class="empty">Aucune offre ici pour le moment.</div>'}`;
  remember(list.map(o => o.listing.card)); list.forEach(o => loadChat(o.id)); fillShips();
  $('#offdot').hidden = true;
}
function offerCard(o, X) {
  const seller = o.seller_id === S.user.id, other = S.pseudos[seller ? o.buyer_id : o.seller_id]?.pseudo || '?', c = o.listing.card, st = stepOf(o);
  const gives = [...o.offered_listing_ids.map(id => X[id] ? `${esc(nm(X[id].card))} (${X[id].condition})` : 'carte'), o.cash ? eur(o.cash) : ''].filter(Boolean).join(' + ');
  const needB = o.offered_listing_ids.length > 0, A = [];
  const b = (a, t, cls = '') => A.push(`<button class="btn sm ${cls}" data-act="${a}" data-o="${o.id}">${t}</button>`);
  if (o.status === 'pending') seller ? (b('accept', 'Accepter'), b('decline', 'Refuser', 'ghost')) : b('cancel', 'Annuler', 'ghost');
  if (o.status === 'accepted' && !seller) { b('pay', `Payer ${eur(o.cash + o.fee)}${S.st.payments_live ? '' : ' (mode test)'}`); b('cancel', 'Annuler', 'ghost'); }
  if (o.status === 'accepted' && seller) A.push('<span class="small mut">En attente du paiement de l\'acheteur.</span>');
  if (o.status === 'paid') {
    if (seller && !o.seller_shipped) b('ship', 'J\'ai expédié (n° de suivi)', 'ghost');
    if (!seller && needB && !o.buyer_shipped) b('ship', 'J\'ai expédié mes cartes (n° de suivi)', 'ghost');
    if (!seller && o.seller_shipped && !o.buyer_received) { A.push(`<button class="btn sm ghost" data-auth="${c.id}" data-oid="${o.id}">🔍 Vérifier la carte reçue</button>`); b('receive', 'J\'ai reçu la carte'); }
    if (seller && needB && o.buyer_shipped && !o.seller_received) b('receive', 'J\'ai reçu les cartes');
  }
  if (['accepted', 'paid'].includes(o.status)) b('dispute', 'Ouvrir un litige', 'ghost');
  const labels = { declined: 'Refusée', cancelled: 'Annulée', disputed: 'Litige ouvert : l\'équipe examine le dossier, l\'argent reste bloqué.' };
  return `<div class="panel offer"><div>${img(c)}</div><div>
    <h3>${flag(c.lang)} ${esc(nm(c))} <span class="pill p-${o.listing.condition}">${o.listing.condition}</span></h3>
    <p class="small" style="margin:4px 0">${seller ? `<b>${esc(other)}</b> te propose` : `Tu proposes à <b>${esc(other)}</b>`} : ${gives}${o.fee ? ` <span class="mut">· protection acheteur ${eur(o.fee)}</span>` : ''}</p>
    ${labels[o.status] ? `<p class="small"><span class="pill p-PL">${o.status}</span> ${labels[o.status]}</p>` : `<div class="track">${STEPS.map((s, i) => `<span class="${i < st ? 'done' : i === st ? 'now' : ''}">${s}</span>`).join('')}</div>`}
    ${o.seller_tracking ? `<p class="small mut">Suivi vendeur : <span class="mono">${esc(o.seller_tracking)}</span></p>` : ''}${o.buyer_tracking ? `<p class="small mut">Suivi acheteur : <span class="mono">${esc(o.buyer_tracking)}</span></p>` : ''}
    ${o.status === 'paid' && ((seller && !o.seller_received) || (!seller && needB)) ? `<div class="shipbox" data-shipo="${o.id}" data-shipped="${(seller ? o.seller_shipped : o.buyer_shipped) ? 1 : 0}"></div>` : ''}
    <div class="acts">${A.join('')}</div>
    ${o.status === 'completed' && !S.reviewed?.has(o.id) ? `<form class="chatf" data-review="${o.id}" data-target="${seller ? o.buyer_id : o.seller_id}" style="margin-top:10px"><select aria-label="Note" style="width:auto">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select><input placeholder="Avis sur ${esc(other)} (optionnel)" maxlength="300"><button class="btn sm">Noter</button></form>` : ''}
    <div class="chat"><div class="msgs" id="m-${o.id}"></div><form class="chatf" data-chat="${o.id}"><input placeholder="Message (pas de coordonnées)" maxlength="500" aria-label="Message"><button class="btn sm">Envoyer</button></form><p class="err" id="e-${o.id}"></p></div>
  </div></div>`;
}
async function loadChat(id) {
  const { data } = await sb.from('messages').select('*').eq('offer_id', id).order('created_at');
  const box = $('#m-' + id); if (!box) return;
  box.innerHTML = (data || []).map(m => `<div class="msg ${m.sender_id === S.user.id ? 'me' : ''}">${esc(m.body)}</div>`).join('') || '<span class="small mut">Pose tes questions ici (état, envoi…).</span>';
  box.scrollTop = box.scrollHeight;
}
async function act(id, a) {
  let tracking = null;
  if (a === 'ship') {
    modal(`<form class="form" id="shipf"><h2 style="margin:0">Numéro de suivi</h2><p class="small mut">Envoi obligatoirement suivi (Lettre suivie, Colissimo, Mondial Relay). Carte sous sleeve + toploader. <a href="#/guide" target="_blank">Guide d'emballage</a></p><input id="trk" required pattern="[A-Za-z0-9]{8,30}" placeholder="Ex : 6A12345678901"><button class="btn">Valider l'expédition</button></form>`);
    tracking = await new Promise(r => { $('#shipf').onsubmit = e => { e.preventDefault(); r($('#trk').value.trim()); }; dlg.addEventListener('close', () => r(null), { once: true }); });
    close(); if (!tracking) return;
  }
  if (a === 'pay' && S.st.payments_live) {
    const { data, error } = await sb.functions.invoke('payments/checkout', { body: { offer_id: id } });
    if (error || !data?.url) return toast(data?.error || 'Paiement indisponible, réessaie.', true);
    location.href = data.url; return;
  }
  if (a === 'pay') {
    modal(`<div class="form"><h2 style="margin:0">Paiement sécurisé</h2><p>En production, tu paies par carte via Stripe. L'argent est <b>bloqué en séquestre</b> et versé au vendeur seulement quand tu confirmes la réception.</p><p class="small mut">Mode test : aucun argent réel n'est débité.</p><button class="btn" id="okpay">Simuler le paiement</button></div>`);
    const ok = await new Promise(r => { $('#okpay').onclick = () => r(true); dlg.addEventListener('close', () => r(false), { once: true }); });
    close(); if (!ok) return;
  }
  const { error } = await sb.rpc('offer_action', { p_offer: id, p_action: a, p_tracking: tracking });
  if (error) return toast(errMsg(error), true);
  toast({ accept: 'Offre acceptée', decline: 'Offre refusée', cancel: 'Offre annulée', pay: 'Paiement bloqué en séquestre', ship: 'Expédition enregistrée', receive: 'Réception confirmée', dispute: 'Litige ouvert' }[a]);
  await loadSession(); offres();
}

// ---------- forum ----------
async function forum() {
  const { data } = await sb.from('posts').select('*').order('created_at', { ascending: false }).limit(80);
  await pseudos((data || []).map(p => p.user_id));
  view.innerHTML = `<h2>Le forum de la table</h2><div class="panel">
  ${S.profile ? `<form class="form" id="pf"><textarea id="pb" maxlength="600" placeholder="Une question sur une cote, une carte recherchée, un conseil d'état ?"></textarea><div class="bar" style="margin:0"><select id="ps" style="width:auto"><option value="">Général</option>${S.sets.filter(s => s.lang === S.lang).slice(0, 80).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn">Publier</button></div><p class="err" id="perr"></p></form>` : `<p class="mut">Lecture libre. <a href="#/compte">Connecte-toi</a> pour participer.</p>`}
  ${(data || []).map(p => { const u = S.pseudos[p.user_id]; return `<div class="post">${av(u?.pseudo, u)}<div><b>${who(p.user_id, u)}</b> <span class="small mut">${new Date(p.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${p.set_id ? ' · ' + esc(setName(S.sets.find(s => s.id === p.set_id))) : ''}</span><div style="white-space:pre-wrap">${esc(p.body)}</div>${p.user_id === S.user?.id ? `<button class="btn ghost sm" data-delpost="${p.id}">Supprimer</button>` : `<button class="btn ghost sm" data-report="post:${p.id}" style="margin-top:4px">Signaler</button>`}</div></div>`; }).join('') || '<div class="empty">Sois le premier à lancer une discussion.</div>'}</div>`;
  const f = $('#pf'); if (!f) return;
  $('#pb').oninput = () => guardInput($('#pb'), $('#perr'));
  f.onsubmit = async e => { e.preventDefault(); if (!guardInput($('#pb'), $('#perr'))) return; const body = $('#pb').value.trim(); if (body.length < 2) return;
    const { error } = await sb.from('posts').insert({ body, set_id: $('#ps').value || null }); if (error) return $('#perr').textContent = errMsg(error); forum(); };
}

// ---------- compte ----------
async function compte() {
  if (S.profile) {
    const t = S.ev || { lvl: 1 }, { data: ls } = await sb.from('listings').select('*, card:cards(*)').eq('user_id', S.user.id).in('status', ['active', 'reserved']).order('created_at', { ascending: false });
    remember((ls || []).map(l => l.card));
    view.innerHTML = `<div class="panel" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${av(S.profile.pseudo, S.profile)}<div style="flex:1"><h2 style="margin:0">${esc(S.profile.pseudo)}</h2><p class="mut small" style="margin:2px 0"><a href="#/trophees">Niveau ${t.lvl}${t.title ? ' · ' + esc(t.title) : ''}</a> · ${S.profile.trades_done} échange(s) · ${esc(S.profile.region || '')}</p></div><button class="btn ghost" id="logout">Se déconnecter</button></div>
    <div class="panel" style="margin-top:12px"><h3>🎨 Personnaliser mon profil</h3><p class="small mut">Choisis ta créature et sa couleur. <a href="#/membre/${S.user.id}">Voir mon profil public</a></p>
      <div id="avpick"></div>
      <form class="form" id="pf" style="margin-top:10px">
        <label class="f">Petite bio (140 caractères, pas de coordonnées)<input id="pbio" maxlength="140" value="${esc(S.profile.bio || '')}"></label>
        <div class="row2"><label class="f">Pokémon préféré<input id="pfav" list="pknames" maxlength="40" value="${esc(S.profile.fav || '')}"><datalist id="pknames"></datalist></label>
        <label class="f">Bordure du profil<select id="pth">${[['felt', 'Tapis vert'], ['gold', 'Or'], ['ruby', 'Rubis'], ['sapphire', 'Saphir'], ['amethyst', 'Améthyste']].map(([k, n]) => `<option value="${k}" ${S.profile.theme === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <label class="ck"><input type="checkbox" id="pcol" ${S.profile.show_collection !== false ? 'checked' : ''}> Montrer ma collection aux autres membres</label>
        <label class="ck"><input type="checkbox" id="pbdg" ${S.profile.show_badges !== false ? 'checked' : ''}> Montrer mes trophées aux autres membres</label>
        <p class="err" id="perr"></p><button class="btn sm">Enregistrer</button></form></div>
    <div class="panel" style="margin-top:12px"><h3>🏠 Mon adresse d'expédition <span class="pill p-tr">privée</span></h3><p class="small mut">Visible uniquement par ton partenaire, une fois la transaction payée ou l'échange accepté. Jamais publique.</p>
      <form class="form" id="adf"><div class="row2"><label class="f">Nom et prénom<input id="adn" required minlength="2" maxlength="80"></label><label class="f">Pays<input id="adc" required value="France" maxlength="60"></label></div>
        <label class="f">Adresse<input id="ad1" required minlength="3" maxlength="120"></label><label class="f">Complément (bâtiment, étage…)<input id="ad2" maxlength="120"></label>
        <div class="row2"><label class="f">Code postal<input id="adz" required pattern="[A-Za-z0-9 \-]{3,10}"></label><label class="f">Ville<input id="adv" required maxlength="80"></label></div>
        <p class="err" id="aerr"></p><button class="btn sm">Enregistrer mon adresse</button></form>
      <p class="small" style="margin-top:12px">📍 Mon point relais de réception : <b id="myrelay">—</b> <button class="btn sm ghost" data-pickrelay>Choisir</button></p></div>
    <div class="panel" style="margin-top:12px"><h3>Vendre contre de l'argent</h3>${S.profile.payouts_enabled ? '<p class="small">✔ Compte vendeur vérifié : tu reçois tes paiements automatiquement.</p>' : `<p class="small mut">Pour recevoir de l'argent, notre partenaire de paiement Stripe vérifie ton identité (18+). Tes coordonnées bancaires restent chez Stripe, jamais chez nous. Les échanges carte contre carte n'en ont pas besoin.</p><button class="btn sm" data-connect>Activer mes ventes</button>`}</div>
    <div class="panel" style="margin-top:12px"><h3>🎁 Parraine un collectionneur</h3><p class="small mut">Ton ami reçoit 1 échange offert à l'inscription, toi 1 aussi dès sa première transaction réussie. (Échanges gratuits pendant la bêta, puis 0,99 €.)</p>
      <div class="acts"><input readonly id="reflink" value="${location.origin}/?ref=${S.profile.ref_code}" style="flex:1;min-width:200px"><button class="btn sm" id="refshare">Partager</button></div>
      <p class="small">Code : <b>${S.profile.ref_code}</b> · ${S.profile.filleuls || 0} filleul(s) actif(s) · ${S.profile.free_trades} échange(s) offert(s)</p></div>
    <div class="panel" style="margin-top:12px"><h3>Installer l'appli</h3>${S.install ? '<button class="btn sm" id="install">Installer sur cet appareil</button>' : '<p class="small mut">iPhone : bouton Partager puis « Sur l\'écran d\'accueil ». Android : menu ⋮ puis « Installer l\'application ».</p>'}</div>
    <div class="panel" style="margin-top:12px"><h3>Mes données</h3><p class="small mut">Tes droits RGPD : récupère toutes tes données ou supprime ton compte. <a href="#/legal/confidentialite">En savoir plus</a></p>
      <div class="acts"><button class="btn sm ghost" data-export>📥 Télécharger mes données</button><button class="btn sm ghost" data-delacct style="color:#ff8a80">Supprimer mon compte</button></div></div>
    <h2>Mes doubles sur la table</h2><div class="grid">${(ls || []).map(l => `<div class="tile">${l.photo_path ? `<img class="cimg" src="${photoUrl(l.photo_path)}" alt="">` : img(l.card)}<div class="meta"><span class="nm">${esc(nm(l.card))}</span><span class="v">${l.price ? eur(l.price) : 'Échange'}</span></div><div class="seller small"><span class="pill p-${l.condition}">${l.condition}</span>${authBadge(l) || `<button class="btn ghost sm" data-auth="${l.card_id}" data-lid="${l.id}">🔍 Authentifier</button>`}${l.status === 'reserved' ? '<span class="pill p-tr">réservée</span>' : `<button class="btn ghost sm" data-rmlist="${l.id}">Retirer</button>`}</div></div>`).join('') || '<div class="empty" style="grid-column:1/-1">Aucun double posé. <a href="#/classeur">Va dans ton classeur</a> et touche « Poser » sur une carte en double.</div>'}</div>`;
    $('#refshare').onclick = async () => { const url = $('#reflink').value, text = 'Rejoins-moi sur Sharing Cards, l\'espace des collectionneurs Pokémon :';
      if (navigator.share) { try { await navigator.share({ title: 'Sharing Cards', text, url }); } catch {} } else { await navigator.clipboard?.writeText(url); toast('Lien copié !'); } };
    if ($('#install')) $('#install').onclick = async () => { S.install.prompt(); S.install = null; compte(); };
    S.pav = S.profile.avatar ? [+S.profile.avatar[0], +S.profile.avatar[2]] : null; drawAvPick();
    sb.from('addresses').select('*').eq('user_id', S.user.id).maybeSingle().then(({ data: a }) => { if (a?.relay) $('#myrelay').textContent = a.relay.name; if (a) [['adn', 'name'], ['adc', 'country'], ['ad1', 'line1'], ['ad2', 'line2'], ['adz', 'zip'], ['adv', 'city']].forEach(([i, k]) => $('#' + i).value = a[k] || ''); });
    $('#pfav').addEventListener('focus', async () => { if ($('#pknames').children.length) return; const { data } = await sb.from('pokemon_names').select('fr').order('species'); $('#pknames').innerHTML = (data || []).map(r => `<option value="${esc(r.fr)}">`).join(''); }, { once: true });
    $('#pf').onsubmit = async e => { e.preventDefault(); const bio = $('#pbio').value.trim(), fav = $('#pfav').value.trim();
      if (contactViolation(bio) || contactViolation(fav)) return $('#perr').textContent = 'Pas de coordonnées dans la bio.';
      const upd = { bio: bio || null, fav: fav || null, theme: $('#pth').value, show_collection: $('#pcol').checked, show_badges: $('#pbdg').checked, avatar: S.pav ? S.pav.join(':') : null };
      const { error } = await sb.from('profiles').update(upd).eq('id', S.user.id); if (error) return $('#perr').textContent = errMsg(error);
      Object.assign(S.profile, upd); S.pseudos[S.user.id] = null; toast('Profil enregistré'); compte(); };
    $('#adf').onsubmit = async e => { e.preventDefault();
      const row = { user_id: S.user.id, name: $('#adn').value.trim(), country: $('#adc').value.trim(), line1: $('#ad1').value.trim(), line2: $('#ad2').value.trim() || null, zip: $('#adz').value.trim(), city: $('#adv').value.trim(), updated_at: new Date().toISOString() };
      const { error } = await sb.from('addresses').upsert(row); if (error) return $('#aerr').textContent = errMsg(error); toast('Adresse enregistrée (privée)'); };
    $('#logout').onclick = async () => { await sb.auth.signOut(); await loadSession(); location.hash = '#/'; };
    return;
  }
  if (S.user && !S.profile) return completeProfile();
  const mode = S.amode || 'up';
  view.innerHTML = `<div class="panel" style="max-width:520px;margin:10px auto"><div class="seg" id="amode" style="margin-bottom:16px"><button data-am="up" aria-pressed="${mode === 'up'}">Créer un compte</button><button data-am="in" aria-pressed="${mode === 'in'}">Se connecter</button></div>
  <form class="form" id="af">
    <label class="f">E-mail<input type="email" id="ae" required autocomplete="email"></label>
    <label class="f">Mot de passe<input type="password" id="ap" required minlength="8" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}"></label>
    ${mode === 'up' ? profileFields() : ''}
    <p class="err" id="aerr"></p><button class="btn">${mode === 'up' ? 'Créer mon compte' : 'Se connecter'}</button>
  </form></div>`;
  $('#af').onsubmit = async e => {
    e.preventDefault(); const err = $('#aerr'); err.textContent = '';
    const email = $('#ae').value.trim(), password = $('#ap').value;
    if (mode === 'in') { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) return err.textContent = 'E-mail ou mot de passe incorrect, ou e-mail pas encore confirmé.'; await loadSession(); location.hash = '#/classeur'; return; }
    const md = readProfileFields(err); if (!md) return;
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: md, emailRedirectTo: location.origin } });
    if (error) return err.textContent = error.message;
    if (!data.session) { view.innerHTML = `<div class="panel empty" style="max-width:520px;margin:auto"><h2>Vérifie ta boîte mail</h2><p>Clique sur le lien de confirmation envoyé à <b>${esc(email)}</b>, puis reviens te connecter. Ton classeur invité sera importé automatiquement.</p></div>`; return; }
    await loadSession(); toast('Bienvenue à la table !'); location.hash = '#/classeur';
  };
}
function profileFields() {
  const max = new Date(); max.setFullYear(max.getFullYear() - 18);
  return `<label class="f">Pseudo (3-20 lettres, chiffres ou _)<input id="apseudo" required pattern="[A-Za-z0-9_]{3,20}"></label>
  <div class="row2"><label class="f">Date de naissance<input type="date" id="abd" required max="${max.toISOString().slice(0, 10)}"></label>
  <label class="f">Région<select id="areg"><option value="">—</option>${['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', 'Provence-Alpes-Côte d\'Azur', 'Outre-mer', 'Belgique', 'Suisse'].map(r => `<option>${r}</option>`).join('')}</select></label></div>
  <label class="ck"><input type="checkbox" id="a18" required> Je certifie avoir 18 ans ou plus.</label>
  <label class="ck"><input type="checkbox" id="arules" required> J'accepte les <a href="#/legal/cgu" target="_blank">CGU</a>, les <a href="#/legal/cgv" target="_blank">conditions de vente</a> et la <a href="#/legal/confidentialite" target="_blank">politique de confidentialité</a> : pas d'échange de coordonnées, toutes les transactions passent par l'appli.</label>`;
}
function readProfileFields(err) {
  const pseudo = $('#apseudo').value.trim(), birthdate = $('#abd').value, region = $('#areg').value || null;
  const age = (Date.now() - new Date(birthdate)) / 31557600000;
  if (!birthdate || age < 18) { err.textContent = 'Sharing Cards est réservé aux 18 ans et plus.'; return null; }
  if (contactViolation(pseudo)) { err.textContent = 'Ce pseudo ressemble à une coordonnée. Choisis-en un autre.'; return null; }
  return { pseudo, birthdate, region };
}
function completeProfile() {
  view.innerHTML = `<div class="panel" style="max-width:520px;margin:auto"><h2 style="margin-top:0">Dernière étape</h2><form class="form" id="cf">${profileFields()}<p class="err" id="cerr"></p><button class="btn">Valider mon profil</button></form></div>`;
  $('#cf').onsubmit = async e => { e.preventDefault(); const md = readProfileFields($('#cerr')); if (!md) return;
    const { error } = await sb.from('profiles').insert({ id: S.user.id, ...md }); if (error) return $('#cerr').textContent = errMsg(error);
    await loadSession(); location.hash = '#/classeur'; };
}

function regles() {
  view.innerHTML = `<div class="panel" style="max-width:760px;margin:auto"><h2 style="margin-top:0">Charte & sécurité</h2>
  <p class="mut">Sharing Cards est un espace <b>par et pour les collectionneurs</b>. Pas de boutique, pas de revendeur professionnel. 👉 <a href="#/guide">Guide des échanges et de l'emballage</a></p>
  <ol class="rules">
   <li><b>Collectionneurs uniquement.</b> On ne pose que ses doubles : la carte doit être au moins en ×2 dans ton classeur. Maximum 3 annonces par carte et 30 annonces actives. Les professionnels et revendeurs de stock ne sont pas admis.</li>
   <li><b>18 ans et plus.</b> Les comptes et les transactions sont réservés aux majeurs. Les versements aux vendeurs exigeront une vérification d'identité par notre prestataire de paiement.</li>
   <li><b>Tout passe par l'appli.</b> Offres, messages, paiement et suivi. Une transaction conclue ailleurs n'est pas protégée et entraîne la suspension du compte.</li>
   <li><b>Aucune coordonnée.</b> Téléphone, e-mail, réseaux sociaux, liens, IBAN, rendez-vous en main propre : bloqués automatiquement dans les annonces, messages et forum.</li>
   <li><b>Paiement en séquestre.</b> L'argent de l'acheteur est bloqué jusqu'à ce qu'il confirme la réception de la carte, comme le « Trustee Service » de Cardmarket.</li>
   <li><b>Envoi suivi obligatoire.</b> Numéro de suivi requis pour marquer une carte expédiée. Protection : sleeve + toploader + enveloppe rigide.</li>
   <li><b>État honnête.</b> NM = comme neuve, EX = micro-défauts, GD = usure visible, PL = abîmée. Photo de ta propre carte recommandée.</li>
   <li><b>Litige.</b> Carte non reçue ou non conforme : ouvre un litige depuis l'offre. L'argent reste bloqué pendant l'examen.</li>
   <li><b>Contrôle d'authenticité.</b> Chaque carte peut passer un contrôle photo (couleurs comparées à l'officielle, texte, dos, test de la lampe). Le score est affiché sur l'annonce, et l'acheteur peut refaire le contrôle à la réception avant de confirmer. Il est indicatif et ne remplace pas une expertise.</li>
   <li><b>Contrefaçons interdites.</b> Toute fausse carte signalée entraîne l'exclusion définitive.</li>
  </ol>
  <h3>Frais</h3><p class="mut">Vendeur : 0 %. Acheteur : protection acheteur de ${eur(S.st.buyer_fixed ?? 0.5)} + ${((S.st.buyer_rate ?? 0.03) * 100).toLocaleString('fr-FR')} % du prix, qui finance le paiement sécurisé et la médiation. Échanges carte contre carte : gratuits pendant la bêta, puis 0,99 € par personne. 3 échanges offerts à l'inscription, +1 par ami parrainé (après sa première transaction réussie). Tant qu'un des deux membres a moins de 3 transactions réussies, une transaction est plafonnée à ${eur(S.st.new_account_cap ?? 100)}.</p>
  <p class="mut small">Le détail juridique est dans les <a href="#/legal/cgu">CGU</a> et les <a href="#/legal/cgv">conditions de vente</a>.</p>
  <h3>Données</h3><p class="mut">Ta date de naissance reste privée. Ton pseudo, ta région et ton nombre d'échanges sont publics. Ton adresse postale n'est jamais publique : elle n'est montrée qu'à ton partenaire, une fois la transaction payée ou l'échange accepté. Tu peux cacher ta collection et tes trophées dans Compte.</p></div>`;
}

// ---------- RGPD ----------
async function exportData() {
  const me = S.user.id, q = (t, f) => f(sb.from(t).select('*')).then(r => r.data || []);
  const [profil, classeur, annonces, offres, messages, avis, forum, controles] = await Promise.all([
    q('profiles', x => x.eq('id', me)), q('collection', x => x.eq('user_id', me)), q('listings', x => x.eq('user_id', me)),
    q('offers', x => x.or(`buyer_id.eq.${me},seller_id.eq.${me}`)), q('messages', x => x.eq('sender_id', me)),
    q('reviews', x => x.or(`author_id.eq.${me},target_id.eq.${me}`)), q('posts', x => x.eq('user_id', me)), q('auth_checks', x => x.eq('user_id', me))]);
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
  const t = e.target.closest('[data-set],[data-f],[data-tog],[data-iq],[data-dq],[data-put],[data-l],[data-buy],[data-trade],[data-rmlist],[data-report],[data-act],[data-ot],[data-am],[data-ts],[data-card],[data-close],[data-delpost],[data-scan],[data-scanadd],[data-connect],[data-auth],[data-export],[data-delacct]');
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
  else if (d.auth) openAuth(S.cards[d.auth], { modal, $, esc, nm, sb, toast, shrink, loadTesseract, loggedIn: () => !!S.profile, done: () => { Game.track('auth'); checkUnlock(); } }, { listingId: d.lid, offerId: d.oid });
  else if ('export' in d) exportData();
  else if ('delacct' in d) deleteAccount();
  else if ('scan' in d) scanModal();
  else if (d.scanadd) { await setQty(d.scanadd, (S.coll[d.scanadd] || 0) + 1); Game.track('add'); checkUnlock(); toast(`${nm(S.cards[d.scanadd])} ajoutée au classeur (×${S.coll[d.scanadd]})`); await scanSearch(); if (location.hash.startsWith('#/classeur')) { S.bySet[S.cards[d.scanadd].set_id] = null; } }
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => { if ($('#m-' + p.new.offer_id)) loadChat(p.new.offer_id); else $('#offdot').hidden = false; }).subscribe();
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
      <div class="track">${TR.map((t, i) => `<span class="${i <= idx[x.status] ? 'done' : ''}">${t}</span>`).join('')}</div><p class="small mut">Emballe la carte (sleeve → toploader → cartons), colle le bordereau et dépose le colis. <a href="#/guide">Guide</a></p>`;
    else if (!x && b.dataset.shipped === '1') b.remove();
    else if (x?.paid) b.innerHTML = `<button class="btn" data-dl="${x.id}">📄 Générer mon bordereau</button> <span class="small mut">${x.mode === 'relay' ? 'Point relais' : 'Colissimo'} · payé</span>`;
    else if (x) b.innerHTML = `<button class="btn" data-paylbl="${x.id}">Payer mon bordereau (${eur(x.price)})</button> <span class="small mut">${x.mode === 'relay' ? '📍 Point relais' : '🏠 Colissimo'}</span>`;
    else b.innerHTML = `<p class="small" style="margin:0 0 6px"><b>📦 Ton envoi</b> : choisis comment expédier.</p><div class="acts">${SHIP().filter(s => s[0] !== 'manual').map(([k, i, n, p]) => `<button class="btn sm" data-ordlbl="${oid}:${k}">${i} ${n} · ${eur(p)}</button>`).join('')}<button class="btn sm ghost" data-prep="${oid}">✉️ Je m'en occupe</button></div>`;
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
