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
const S = { user: null, profile: null, sets: [], cards: {}, bySet: {}, set: null, lang: 'fr', coll: {}, fee: 0.0001, filter: 'all', pseudos: {}, prog: {}, wish: new Set() };
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
const errMsg = e => { const m = e?.message || String(e);
  if (/posts_body_check/.test(m)) return 'Ton message doit faire entre 2 et 2 000 caractères.';
  if (/posts_title/.test(m)) return 'Le titre est trop long (90 caractères maximum).';
  if (/duplicate key/.test(m)) return 'C\'est déjà enregistré.';
  return m.replace(/^.*?Interdit/, 'Interdit'); };
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
  if (!S.profile) { S.coll = guestColl(); S.since = {}; return; }
  const { data } = await sb.from('collection').select('card_id,qty,since');
  S.coll = Object.fromEntries((data || []).map(r => [r.card_id, r.qty]));
  S.since = Object.fromEntries((data || []).map(r => [r.card_id, r.since]));
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
  await Promise.all([loadCollection(), loadWish()]);
  if (S.profile) {
    const [{ data: v }, { data: st }] = await Promise.all([sb.rpc('my_visit'), sb.rpc('my_stats')]);
    if (v) { S.profile.streak = v.streak; S.profile.streak_best = v.best; }
    Game.setStats(st || {});
  } else Game.setStats(null);
}
// compte suspendu par la modération : 'infinity' = définitif
const suspended = () => { const u = S.profile?.suspended_until; if (!u) return null;
  if (String(u).startsWith('infinity')) return 'définitivement';
  const d = new Date(u); return d > new Date() ? 'jusqu\'au ' + d.toLocaleDateString('fr-FR') : null; };
const suspBanner = () => { const w = suspended(); return w ? `<div class="banner bad">🚫 Ton compte est suspendu ${w} : tu ne peux plus publier d'annonce, de message ni d'offre.${S.profile.suspend_reason ? ' Motif : ' + esc(S.profile.suspend_reason) : ''} <a href="#/regles">Charte & sécurité</a></div>` : ''; };

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
  const st = Game.stats(ids.map(k => S.info[k]).filter(Boolean), S.coll, S.profile, S.since);
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
    <p class="small" style="margin:10px 0 0">🎯 Défi du jour : ajoute ${dl.n} cartes à ton classeur — ${dl.done ? '<b class="dn">réussi ✔</b>' : `${dl.cur}/${dl.n}`}</p>
    <p class="small" style="margin:4px 0 0">${Game.weeklyLine(esc)}</p>
    ${st.pending ? `<p class="small mut" style="margin:4px 0 0">⏳ ${st.pending} carte(s) ajoutée(s) récemment : elles compteront après ${Game.STABLE_DAYS} jours dans ton classeur.</p>` : ''}</div></div></div>
  ${Game.renderTrophies(ev, st, esc)}`;
}

// ---------- vues ----------
function legal() {
  const sub = location.hash.split('/')[2];
  view.innerHTML = renderLegal(esc, sub);
  if (sub) document.getElementById('lg-' + sub)?.scrollIntoView();
}
const routes = { '': home, trophees, legal, classeur, table, offres, forum, blog, compte, regles, guide, membre, souhaits, moderation };
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
  view.innerHTML = `<div class="banner hero-ban"><img src="img/banner.webp" alt="Sharing Cards — Collectionnez. Échangez. Partagez." width="2000" height="745"><i class="glints"></i></div>
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
async function classeur() {
  if (!S.set) { view.innerHTML = '<div class="empty">Catalogue en cours d\'import, reviens dans quelques minutes.</div>'; return; }
  await loadSet(S.set);
  Game.visit();
  const p = progress(S.set), { st, ev: t } = await gameState(), dl = Game.daily();
  const list = p.cs.filter(c => { const q = S.coll[c.id] || 0; return S.filter === 'all' || (S.filter === 'own' && q) || (S.filter === 'miss' && !q) || (S.filter === 'dbl' && q > 1); });
  view.innerHTML = `
  ${suspBanner()}
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
        <p class="small" style="margin:4px 0 0">${Game.weeklyLine(esc)}</p>
        ${st.pending ? `<p class="small mut" style="margin:4px 0 0">⏳ ${st.pending} carte(s) comptent pour les trophées dans moins de ${Game.STABLE_DAYS} jours (anti-aller-retour).</p>` : ''}
        <div class="badges">${t.got.slice(-5).reverse().map(b => `<span class="bdg on">${b.ic} ${esc(b.name)}</span>`).join('')}<a class="bdg" href="#/trophees">🏆 ${t.got.length}/${t.total} trophées →</a></div>
      </div>
    </div>
  </div>
  <div class="bar" style="margin-top:18px"><div class="seg" id="flt">${[['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']].map(([k, n]) => `<button data-f="${k}" aria-pressed="${S.filter === k}">${n}</button>`).join('')}</div>
  <button class="btn sm" data-scan>📷 Scanner</button><button class="btn sm" data-scan="burst">⚡ Rafale</button><button class="btn sm ghost" data-names>🔎 Par nom</button><button class="btn sm ghost" data-express>⌨️ Saisie express</button><button class="btn sm ghost" data-csv>⬆️ Importer / exporter</button><a class="btn sm ghost" href="#/souhaits">⭐ Mes souhaits${S.wish.size ? ' (' + S.wish.size + ')' : ''}</a></div>
  <div class="grid">${list.map(c => { const q = S.coll[c.id] || 0; return `<div class="tile ${q ? '' : 'miss'}" data-id="${c.id}">
    <button class="tile" data-tog="${c.id}" aria-label="${esc(nm(c))} : ${q} exemplaire(s)" style="padding:0">${img(c)}</button>
    ${q ? `<span class="qty ${q > 1 ? 'dbl' : ''}">×${q}</span>` : ''}
    ${wishStar(c.id)}
    <div class="meta"><span class="nm">${c.local_id} · ${esc(nm(c))}</span><button type="button" class="v cote" data-cote="${c.id}" aria-label="Courbe de la cote">${eur(c.price_eur)}${trend(c)}</button></div>${jp(c)}
    <div class="stepper"><button data-dq="${c.id}" aria-label="Retirer un">−</button>${q > 1 ? `<button class="put" data-put="${c.id}">Poser</button>` : ''}<button data-iq="${c.id}" aria-label="Ajouter un">+</button></div>
  </div>`; }).join('') || '<div class="empty">Rien ici pour l\'instant.</div>'}</div>`;
}

async function fetchListings(filter = {}) {
  let q = sb.from('listings').select('*, card:cards(*, set:sets(name,name_fr,code,serie_name)), auction:auctions(*)').eq('status', 'active').order('created_at', { ascending: false }).limit(200);
  if (filter.card) q = q.eq('card_id', filter.card);
  const { data, error } = await q; if (error) throw error;
  await pseudos((data || []).map(l => l.user_id));
  for (const l of data || []) l.auc = [].concat(l.auction || [])[0] || null;
  return data || [];
}
async function table() {
  view.innerHTML = `<div class="felt"><div class="bar">
    <div class="seg" id="tset"><button data-ts="" aria-pressed="${!S.tset}">Toutes langues</button>${Object.keys(LANGS).map(k => `<button data-ts="${k}" aria-pressed="${S.tset === k}">${k === 'ja' ? 'JP' : k.toUpperCase()}</button>`).join('')}</div>
    <input class="grow" id="tq" placeholder="Chercher une carte…" aria-label="Chercher" value="${esc(S.tq || '')}">
    <select id="tsort" aria-label="Trier" style="width:auto"><option value="new">Plus récentes</option><option value="cheap">Prix ↑</option><option value="deal">Meilleure affaire</option><option value="miss">Il me manque</option><option value="auc">🔨 Enchères</option><option value="wish">⭐ Ma liste de souhaits</option></select>
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
  if (so === 'auc') ls = ls.filter(l => l.auc).sort((a, b) => new Date(a.auc.ends_at) - new Date(b.auc.ends_at));
  if (so === 'wish') ls = ls.filter(l => S.wish.has(l.card_id));
  $('#lgrid').innerHTML = ls.map(l => {
    const d = !l.auc && l.price && l.card.price_eur ? l.price / l.card.price_eur - 1 : null, mine = l.user_id === S.user?.id;
    return `<button class="tile lcard" data-l="${l.id}">${l.photo_path ? `<img class="cimg" loading="lazy" src="${photoUrl(l.photo_path)}" alt="Photo vendeur ${esc(nm(l.card))}">` : img(l.card)}
    ${!S.coll[l.card_id] && !mine ? '<span class="pill p-miss badge-miss">Il te manque</span>' : ''}
    <div class="meta"><span class="nm">${esc(nm(l.card))}</span><span class="v">${l.auc ? `🔨 ${eur(l.auc.current_bid ?? l.auc.start_price)}` : l.price ? eur(l.price) : 'Échange'}</span></div>${l.auc ? `<div class="seller"><span class="pill p-auc">🔨 enchère · ${l.auc.bids_count} offre${l.auc.bids_count > 1 ? 's' : ''}</span><span class="small">⏱ ${left(l.auc.ends_at)}</span></div>` : ''}
    <div class="seller"><span>${flag(l.card.lang)} ${esc(setName(l.card.set))}</span></div>
    <div class="seller"><span><span class="pill p-${l.condition}">${l.condition}</span> ${l.trade_ok ? '<span class="pill p-tr">échange</span>' : ''} ${authBadge(l)}</span>${d != null ? `<span class="delta ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${Math.round(d * 100)}% cote</span>` : ''}</div>
    <div class="seller"><span>${mine ? 'Ton annonce' : esc(S.pseudos[l.user_id]?.pseudo || '')}</span><span>${stars(S.pseudos[l.user_id])}${S.pseudos[l.user_id]?.verified ? ' ✔' : ''}${S.pseudos[l.user_id]?.passionne ? ' 🏅' : ''}</span></div></button>`;
  }).join('') || `<div class="empty" style="grid-column:1/-1">Aucun double sur la table pour l'instant. <a href="#/classeur">Pose les tiens depuis ton classeur.</a></div>`;
}

function listingModal(l) {
  setTimeout(sparks, 0); remember([l.card]);
  const c = l.card, s = S.pseudos[l.user_id] || {}, mine = l.user_id === S.user?.id;
  modal(`<div class="split"><div>${l.photo_path ? `<img class="cimg" src="${photoUrl(l.photo_path)}" alt="Photo du vendeur">` : img(c, true)}${l.photo_path ? `<p class="small mut">Photo du vendeur · <a href="${c.image}/high.webp" target="_blank" rel="noopener">voir la carte officielle</a></p>` : ''}</div>
  <div><p class="mut small">${flag(c.lang)} ${LANGS[c.lang]} · ${esc(setName(S.sets.find(x => x.id === c.set_id)))} · ${c.local_id} · ${esc(c.rarity || '')}</p><h2 style="margin:4px 0 12px">${esc(nm(c))}</h2>${jp(c)}
  <dl class="kv">${l.auc ? '' : `<dt>Prix</dt><dd>${l.price ? eur(l.price) : 'Échange uniquement'}</dd>`}<dt>Cote Cardmarket</dt><dd><button type="button" class="cote" data-cote="${c.id}">${eur(c.price_eur)}${trend(c)} 📈</button>${c.price_updated ? ` <span class="small mut">du ${new Date(c.price_updated).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>` : ''}<div class="spark" data-spark="${esc(c.tcg_id || '')}"></div></dd><dt>État</dt><dd><span class="pill p-${l.condition}">${l.condition}</span> ${COND[l.condition][0]}</dd><dt>Échange</dt><dd>${l.trade_ok ? 'accepté' : 'non'}</dd><dt>Vendeur</dt><dd>${who(l.user_id, s)} · ${stars(s)} · ${s.trades_done || 0} transaction(s)${s.verified ? ' · ✔ identité vérifiée' : ''}${s.passionne ? '<span class="badge-coll">🏅 Collectionneur passionné</span>' : ''} · ${esc(s.region || '')}</dd></dl>
  ${l.note ? `<p class="panel small" style="margin-top:12px">${esc(l.note)}</p>` : ''}
  ${l.auth_score != null ? `<div class="panel small" style="margin-top:10px">${authBadge(l)} <b>Contrôle photo d'authenticité : ${l.auth_score}/100</b> — ${esc(l.auth_report?.meta?.verdict || '')} (fiabilité ${esc(l.auth_report?.meta?.confidence || '?')}). <span class="mut">Indicatif, tu pourras refaire le contrôle à la réception.</span></div>` : ''}
  ${l.photo_path && l.verify_code ? `<p class="small mut">Code de vérification attendu sur la photo : <b class="mono">${esc(l.verify_code)}</b>. S'il n'y est pas, signale l'annonce.</p>` : ''}
  ${l.auc ? `<div id="auc" class="panel auc" style="margin-top:12px"></div>` : ''}
  ${mine ? '' : `<p class="small" style="margin-top:10px">${wishStar(c.id)} ${S.wish.has(c.id) ? 'Dans ta liste de souhaits' : 'Ajouter cette carte à ma liste de souhaits'}</p>`}
  <div id="ofr" style="margin-top:16px">${l.auc ? (mine ? '' : `<button class="btn ghost sm" data-report="listing:${l.id}">Signaler</button>`) : mine ? `<button class="btn ghost" data-rmlist="${l.id}">Retirer de la table</button>` : `<div class="acts">${l.price ? `<button class="btn" data-buy="${l.id}">Acheter ${eur(l.price)}</button>` : ''}${l.trade_ok ? `<button class="btn ghost" data-trade="${l.id}">Proposer un échange</button>` : ''}<button class="btn ghost sm" data-report="listing:${l.id}">Signaler</button></div>`}</div>
  <p class="small mut" style="margin-top:14px">🔒 Paiement et échange uniquement dans l'appli. Ne partage jamais tes coordonnées : sans transaction dans l'appli, pas de protection.</p></div></div>`);
  if (l.auc) auctionBox(l, mine);
}

// ---------- enchères : +5 % minimum, 2 min de plus si on enchérit à la dernière minute ----------
const left = t => { const s = (new Date(t) - Date.now()) / 1000; if (s <= 0) return 'terminée';
  const d = s / 86400 | 0, h = s / 3600 % 24 | 0, m = s / 60 % 60 | 0; return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min ${Math.floor(s % 60)} s`; };
const eur2 = v => Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const bidMin = a => a.bids_count ? Math.ceil(a.current_bid * 1.05 * 2) / 2 : +a.start_price;
let leads = new Set(); try { leads = new Set(JSON.parse(localStorage.getItem('sc_lead')) || []); } catch { }
const saveLeads = () => { try { localStorage.setItem('sc_lead', JSON.stringify([...leads])); } catch { } };
function auctionBox(l, mine) {
  const a = l.auc, box = $('#auc'), rec = (a.current_bid || a.start_price) >= 50 ? 'home' : 'relay';
  const draw = () => { if (!box.isConnected) return;
    const lead = S.user && a.top_bidder === S.user.id, over = new Date(a.ends_at) <= Date.now();
    box.innerHTML = `<div class="aucnow"><span class="small mut">${a.bids_count ? 'Enchère actuelle' : 'Prix de départ'}</span><b>${eur2(a.current_bid ?? a.start_price)}</b>
      <span class="small">${a.bids_count} enchère${a.bids_count > 1 ? 's' : ''}${lead ? ' · <b class="dn">tu mènes !</b>' : ''}</span></div>
      <p class="small" style="margin:6px 0">⏱ ${over ? 'Enchère terminée' : `Fin dans <b id="aucleft">${left(a.ends_at)}</b>`} <span class="mut">· le ${new Date(a.ends_at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>
      ${mine || over ? (mine ? `<p class="small mut">Ta carte est aux enchères. ${a.bids_count ? 'Elle ne peut plus être retirée.' : `<button class="btn ghost sm" data-rmlist="${l.id}">Retirer</button>`}</p>` : '') : `
      <div class="row2"><label class="f">Ton enchère (min. ${eur2(bidMin(a))})<input type="number" id="bidv" min="${bidMin(a)}" step="0.5" inputmode="decimal" value="${bidMin(a)}"></label>
      <label class="f">Livraison si tu gagnes<select id="bidship">${SHIP().map(([k, i, n, p]) => `<option value="${k}" ${k === rec ? 'selected' : ''}>${i} ${n}${p ? ' · ' + eur(p) : ''}</option>`).join('')}</select></label></div>
      <button class="btn" id="bidgo" type="button">🔨 Enchérir</button><p class="err" id="biderr"></p>
      <p class="small mut" style="margin:0">Ton enchère t'engage : si tu gagnes, tu paies la carte + protection acheteur (${eur(S.st.buyer_fixed ?? .5)} + ${Math.round((S.st.buyer_rate ?? .03) * 100)} %) + livraison, par le paiement sécurisé. Une enchère dans les 2 dernières minutes prolonge de 2 min.</p>`}
      <details style="margin-top:8px"><summary class="small">Historique des enchères</summary><ol class="bidh small" id="bidh"><li class="mut">…</li></ol></details>`;
    const go = $('#bidgo'); if (go) go.onclick = bid;
    box.querySelector('details').ontoggle = e => { if (e.target.open) history(); };
  };
  const history = async () => { const { data } = await sb.from('bids').select('amount,created_at,bidder_id').eq('listing_id', l.id).order('amount', { ascending: false }).limit(30);
    await pseudos((data || []).map(b => b.bidder_id)); if (!$('#bidh')) return;
    $('#bidh').innerHTML = (data || []).map(b => `<li><b>${eur2(b.amount)}</b> · ${b.bidder_id === S.user?.id ? 'toi' : esc((S.pseudos[b.bidder_id]?.pseudo || '??').slice(0, 2)) + '***'} · <span class="mut">${new Date(b.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>`).join('') || '<li class="mut">Aucune enchère pour l\'instant. Sois le premier !</li>'; };
  async function bid() {
    if (needAccount()) return; const v = +$('#bidv').value, btn = $('#bidgo');
    if (!(v >= bidMin(a))) return $('#biderr').textContent = `Minimum ${eur2(bidMin(a))}.`;
    btn.disabled = true; btn.textContent = 'Envoi…';
    const { data, error } = await sb.rpc('place_bid', { p_listing: l.id, p_amount: v, p_ship: $('#bidship').value });
    if (error) { $('#biderr').textContent = errMsg(error); btn.disabled = false; btn.textContent = '🔨 Enchérir'; return; }
    Object.assign(a, data); leads.add(l.id); saveLeads(); beep(); toast('🔨 Enchère placée : tu es le meilleur enchérisseur !'); draw(); if ($('#bidh')) history();
  }
  draw();
  const tick = setInterval(() => { const e = $('#aucleft'); if (!box.isConnected) return clearInterval(tick); if (e) e.textContent = left(a.ends_at); if (new Date(a.ends_at) <= Date.now() && e) draw(); }, 1000);
  const ch = sb.channel('auc-' + l.id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'auctions', filter: `listing_id=eq.${l.id}` }, p => { Object.assign(a, p.new); draw(); }).subscribe();
  dlg.addEventListener('close', () => { sb.removeChannel(ch); clearInterval(tick); }, { once: true });
}
async function tradeForm(l) {
  if (needAccount()) return;
  const { data: all } = await sb.from('listings').select('*, card:cards(*), auction:auctions(listing_id)').eq('user_id', S.user.id).eq('status', 'active'), mine = (all || []).filter(m => ![].concat(m.auction || []).length);
  const target = l.price || l.card.price_eur || 0;
  $('#ofr').innerHTML = `<div class="form"><h3>Ton offre pour ${esc(nm(l.card))}</h3>
  ${mine?.length ? `<p class="small mut">Choisis parmi tes doubles posés sur la table :</p><div class="pick">${mine.map(m => `<label><input type="checkbox" value="${m.id}" data-v="${m.price || m.card.price_eur || 0}"><div>${img(m.card)}<small>${esc(nm(m.card))} · ${m.condition}</small></div></label>`).join('')}</div>` : `<p class="small mut">Tu n'as pas encore de double sur la table. <a href="#/classeur">Pose-en depuis ton classeur</a>, ou propose uniquement de l'argent.</p>`}
  <label class="f">Complément en € <input type="number" id="cash" min="0" step="1" value="0" inputmode="numeric"></label>
  <div class="bal"><i id="bi"></i></div><p class="small" id="bs"></p>
  <p class="small mut">Échange carte contre carte : gratuit pendant la bêta. Si tu ajoutes de l'argent, la protection acheteur s'applique sur ce montant.</p>
  ${gtip('protocole', 'Comment se passe un échange ? (1 min)')}
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
    <div class="seg" id="lmode"><button type="button" data-lm="fix" aria-pressed="true">💶 Prix fixe</button><button type="button" data-lm="auc" aria-pressed="false">🔨 Enchère</button></div>
    <div class="row2" id="lfix"><label class="f">Prix de vente (€)<input type="number" id="lp" min="0.5" step="0.5" inputmode="decimal"></label><label class="ck" style="align-self:end"><input type="checkbox" id="lt" checked> J'accepte les échanges</label></div>
    <div class="row2" id="lauc" hidden><label class="f">Prix de départ (€)<input type="number" id="lsp" min="0.5" step="0.5" inputmode="decimal"></label><label class="f">Durée<select id="ldays"><option value="1">1 jour</option><option value="3" selected>3 jours</option><option value="7">7 jours</option></select></label></div>
    <p class="small mut" id="lhint" style="margin:0"></p>
    <div class="panel small">🔐 Écris ce code sur un papier et photographie-le à côté de ta carte : <b class="mono" style="font-size:18px">${code}</b><br><span class="mut">Il prouve que tu as vraiment la carte. ${need ? 'Photo obligatoire pour cette carte (cote ≥ ' + eur(S.st.photo_required_from || 50) + ').' : 'Recommandé.'}</span></div>
    <label class="f">Photo de TA carte avec le code<input type="file" id="lph" accept="image/*" capture="environment" ${need ? 'required' : ''}></label>
    <label class="f">Note (optionnel, 280 car.)<textarea id="ln" maxlength="280" placeholder="Ex : sortie de booster, sous sleeve depuis."></textarea></label>
    <p class="err" id="lerr"></p><button class="btn">Poser mon double</button></form></div>`);
  const hint = () => { const k = COND[$('#lc').value][2], sug = c.price_eur ? Math.max(0.5, Math.round(c.price_eur * k * 2) / 2) : null; $('#lp').placeholder = sug ?? 'Prix'; $('#lhint').textContent = sug ? `Prix conseillé en ${$('#lc').value} : ${eur(sug)} (cote × ${k}). Laisse vide pour échange seul.` : 'Laisse vide pour échange seul.'; };
  $('#lc').onchange = hint; hint();
  let auc = false;
  $('#lmode').onclick = e => { const b = e.target.closest('[data-lm]'); if (!b) return; auc = b.dataset.lm === 'auc';
    $('#lmode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#lfix').hidden = auc; $('#lauc').hidden = !auc;
    if (auc) $('#lhint').textContent = 'Les membres enchérissent (+5 % minimum à chaque fois). À la fin, le meilleur enchérisseur paie via le paiement sécurisé, comme une vente. Sans enchère, l\'annonce est retirée.'; else hint();
    $('#lsp').placeholder = c.price_eur ? Math.max(0.5, Math.round(c.price_eur * COND[$('#lc').value][2])) : '1'; };
  $('#ln').oninput = () => guardInput($('#ln'), $('#lerr'));
  $('#lf').onsubmit = async e => {
    e.preventDefault(); if (!guardInput($('#ln'), $('#lerr'))) return;
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Envoi…';
    try {
      let photo_path = null; const f = $('#lph').files[0];
      if (f) { const blob = await shrink(f); photo_path = `${S.user.id}/${crypto.randomUUID()}.jpg`; const up = await sb.storage.from('photos').upload(photo_path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error; }
      const price = auc ? +$('#lsp').value || null : $('#lp').value ? +$('#lp').value : null, trade_ok = !auc && $('#lt').checked;
      if (auc && !(price >= 0.5)) throw new Error('Indique un prix de départ (0,50 € minimum).');
      if (!price && !trade_ok) throw new Error('Indique un prix ou accepte les échanges.');
      const { data: nl, error } = await sb.from('listings').insert({ user_id: S.user.id, card_id: c.id, condition: $('#lc').value, price, trade_ok, note: $('#ln').value.trim() || null, photo_path, verify_code: code }).select('id').single();
      if (error) throw error;
      if (auc) { const r = await sb.rpc('start_auction', { p_listing: nl.id, p_start: price, p_days: +$('#ldays').value });
        if (r.error) { await sb.from('listings').update({ status: 'removed' }).eq('id', nl.id); throw r.error; } }
      Game.track('list'); checkUnlock();
      close(); toast(auc ? `🔨 Enchère lancée pour ${$('#ldays').value} jour${+$('#ldays').value > 1 ? 's' : ''} !` : 'Double posé sur la table !');
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
let scanState = {}, burst = null, actx;
const authH = () => ({ modal, $, esc, nm, sb, toast, shrink, loadTesseract, loggedIn: () => !!S.profile, done: () => { Game.track('auth'); checkUnlock(); } });
const scanH = () => ({ loadTesseract, totals: () => new Set(S.sets.map(s => +s.total).filter(Boolean)) });
// ajoute (ou retire, n < 0) plusieurs cartes d'un coup : une seule requête
async function addMany(m) {
  const up = [], del = []; let added = 0;
  for (const [id, n] of Object.entries(m)) {
    const q = Math.max(0, Math.min(99, (S.coll[id] || 0) + n)); S.coll[id] = q; if (n > 0) added += n;
    (q ? up : del).push(id); const c = S.cards[id]; if (c) S.bySet[c.set_id] = null;
  }
  if (!S.profile) { try { localStorage.setItem(GUEST, JSON.stringify(S.coll)); } catch { } }
  else {
    const r = up.length ? await sb.from('collection').upsert(up.map(id => ({ user_id: S.user.id, card_id: id, qty: S.coll[id] }))) : {};
    if (del.length) await sb.from('collection').delete().eq('user_id', S.user.id).in('card_id', del);
    if (r.error) toast(r.error.message, true);
  }
  if (added) { Game.track('add', added); checkUnlock(); }
}
const beep = () => { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.frequency.value = 880; g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .15); o.connect(g).connect(actx.destination); o.start(); o.stop(t + .16); } catch { } navigator.vibrate?.(60); };
// photo cadrée -> cartes candidates classées ; sure = une seule carte possible
// 1) reconnaissance visuelle (empreinte de l'illustration comparée aux ~24 000 officielles), 2) secours : lecture du numéro
const ALL_LANGS = ['fr', 'en', 'ja', 'de', 'it', 'es', 'pt'];
async function identify(cv) {
  let vis = null;
  try { vis = await recognize(cv, 8); } catch (e) { console.warn('reco visuelle indisponible', e); }
  if (vis?.length && vis[0].score >= .45) {
    const ids = vis.flatMap(v => ALL_LANGS.map(l => `${l}:${v.key}`));
    const { data } = await sb.from('cards').select('id,name,name_fr,lang,local_id,image,price_eur,set_id,set:sets(name,name_fr)').in('id', ids);
    // l'édition japonaise partage souvent l'illustration : sauf si tu collectionnes en japonais, elle passe après
    const jaOnly = k => (data || []).some(c => c.id.endsWith(':' + k)) && (data || []).filter(c => c.id.endsWith(':' + k)).every(c => c.lang === 'ja');
    if (S.lang !== 'ja') { vis.forEach(v => { v.ja = jaOnly(v.key); v.adj = v.score - (v.ja ? .03 : 0); }); vis.sort((a, b) => b.adj - a.adj); }
    const list = [];
    for (const v of vis) { // par illustration : la langue de l'utilisateur d'abord, puis anglais, puis les autres
      const vs = (data || []).filter(c => c.id.replace(/^[a-z]{2}:/, '') === v.key).sort((a, b) => (a.lang === S.lang ? -2 : a.lang === 'en' ? -1 : 0) - (b.lang === S.lang ? -2 : b.lang === 'en' ? -1 : 0));
      vs.forEach((c, i) => list.push({ ...c, set_name: c.set?.name_fr || c.set?.name || '', art: v.key, sim: v.score, alt: i > 0 }));
    }
    if (list.length) {
      const main = list.filter(c => !c.alt), rival = vis.slice(1).find(v => !(v.ja && !vis[0].ja)), sure = vis[0].score >= .6 && (!rival || vis[0].score - rival.score >= .04);
      if (sure) { remember(list); return { list: [...main, ...list.filter(c => c.alt)], sure, nums: [], how: { t: 'vis', s: vis[0].score } }; }
      vis.list = [...main, ...list.filter(c => c.alt)];
    }
  }
  // le moteur local hésite : l'IA lit la carte (nom, numéro, langue, série) et la base trouve la carte exacte
  const ai = await identifyAI(cv);
  if (ai?.cards?.length) return fromAI(ai, vis?.list);
  const aiErr = ai?.read?.is_card === false ? 'pas de carte reconnue sur la photo' : S.aiErr;
  if (vis?.list?.length) { remember(vis.list); return { list: vis.list, sure: false, nums: [], how: { t: 'vis', s: vis[0].score, aiErr } }; }
  return { ...(await identifyOCR(cv)), how: { t: 'ocr', aiErr } };
}
// résultat de l'IA : cartes trouvées dans la base d'après ce qu'elle a lu, puis les propositions du dessin
function fromAI(ai, extra = []) {
  const top = ai.cards[0], second = ai.cards[1], seen = new Set(ai.cards.map(c => c.id));
  const list = [...ai.cards.map(c => ({ ...c, ai: true })), ...extra.filter(c => !seen.has(c.id) && !c.alt)];
  const sure = top.score >= 12 || (top.score >= 9 && (!second || top.score - second.score >= 3));
  remember(list); return { list, sure, nums: [], how: { t: 'ai', read: ai.read, model: ai.model } };
}
// IA de vision côté serveur (palier gratuit) : désactivée d'elle-même si la clé n'est pas configurée
async function identifyAI(cv) {
  if (S.aiOff) { S.aiErr = 'IA non configurée'; return null; }
  S.aiErr = null;
  const src = cv.raw || cv, k = Math.min(1, 1400 / Math.max(src.width, src.height)); // grande image : le petit numéro reste lisible
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(src.width * k), height: Math.round(src.height * k) });
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  try {
    const { data, error } = await sb.functions.invoke('identify', { body: { image: c.toDataURL('image/jpeg', .85) } });
    if (error) { const b = await error.context?.json?.().catch(() => null); if (b?.error === 'ia_off') S.aiOff = true;
      S.aiErr = b?.error === 'quota' ? 'IA saturée, réessaie dans une minute' : b?.error === 'ia_off' ? 'IA non configurée' : 'IA indisponible pour le moment'; return null; }
    return data;
  } catch { S.aiErr = 'IA injoignable (réseau ?)'; return null; }
}
async function identifyOCR(cv) {
  const { nums, words } = await readCard(cv, scanH());
  let found = [];
  for (const n of nums) { const { data } = await sb.rpc('scan_match', { p_num: n.num, p_total: n.total, p_words: words, p_lang: S.lang }); found.push(...(data || [])); }
  // le nom lu sert de filet si un chiffre a été mal lu (8 au lieu de 9…) : la comparaison visuelle tranche
  if (words.length) { const { data } = await sb.rpc('scan_match', { p_num: null, p_total: null, p_words: words, p_lang: S.lang }); found.push(...(data || [])); }
  found = [...new Map(found.map(c => [c.id, c])).values()].slice(0, 16);
  if (!found.length) return { list: [], sure: false, nums };
  const r = await rank(found, cv, S.lang); remember(r.list); return { ...r, nums };
}
const PAGE_FMT = ['2x2', '2x3', '3x2', '3x3', '4x3']; // colonnes x lignes
const pageFmt = () => { try { return PAGE_FMT.includes(localStorage.getItem('sc_page')) ? localStorage.getItem('sc_page') : '3x3'; } catch { return '3x3'; } };
const INTENTS = [['add', '➕ Ajouter'], ['burst', '⚡ Rafale'], ['page', '📒 Page classeur'], ['auth', '🔍 Authentifier']];
const TIPS = { add: 'Cadre la carte en entier : l\'appli lit le numéro (ex. 199/165) et la compare aux images officielles.', auth: 'Prends le recto en photo : la carte est reconnue puis le contrôle démarre avec la même photo.',
  burst: 'Passe tes cartes une à une dans le cadre : chaque carte reconnue est ajoutée toute seule (bip). Change de carte au signal ✅.', page: 'Choisis le format de ta page, puis photographie-la à plat, cadrée bord à bord, sans reflet.' };
async function scanModal(intent = 'add') {
  scanState = { intent, photo: null, cv: null }; burst = null;
  modal(`<div class="form scan"><h2 style="margin:0">Scanner des cartes</h2>
  <div class="seg quad" id="scint">${INTENTS.map(([k, t]) => `<button type="button" data-si="${k}" aria-pressed="${intent === k}">${t}</button>`).join('')}</div>
  <div class="cam" id="cam" hidden><video playsinline muted></video><div class="frame" id="frame"><i></i><i></i><i></i><i></i></div><p class="camtip" id="camtip">Carte à plat, dans le cadre, sans reflet</p></div>
  <div class="acts" id="scacts"><button class="btn" id="cap" type="button" hidden>📸 Capturer</button><button class="btn" id="bgo" type="button" hidden>▶️ Démarrer la rafale</button>
    <div class="seg pgfmt" id="pgfmt" hidden>${PAGE_FMT.map(f => `<button type="button" data-pf="${f}" aria-pressed="${f === pageFmt()}">${f.replace('x', '×')}</button>`).join('')}</div>
    <label class="btn" id="pgcap" style="cursor:pointer" hidden>📸 Photographier la page<input type="file" id="pgf" accept="image/*" capture="environment" hidden></label>
    <label class="btn ghost" id="scpick" style="cursor:pointer">🖼️ Choisir une photo<input type="file" id="scf" accept="image/*" hidden></label></div>
  <p class="small mut" id="scs" role="status"></p><div id="bst"></div><div id="scr"></div>
  <details id="scman"><summary class="small">✍️ Saisir le numéro à la main</summary><div class="row2"><label class="f">Numéro (ex. 091/132)<span class="numpair"><input id="scn" placeholder="091" inputmode="numeric" maxlength="7" aria-label="Numéro de la carte"><b>/</b><input id="sct" placeholder="132" inputmode="numeric" maxlength="3" aria-label="Total de la série (optionnel)"></span></label><label class="f">Nom (optionnel)<input id="scw" placeholder="Dracaufeu"></label></div><button class="btn ghost" id="scgo" type="button">Chercher</button><button class="btn ghost sm" type="button" data-names>🔎 Plusieurs cartes par nom (dracau, pika…)</button></details></div>`);
  $('#scint').onclick = e => { const b = e.target.closest('[data-si]'); if (b) setIntent(b.dataset.si); };
  $('#scf').onchange = async e => { const f = e.target.files[0]; if (!f) return; scanState.intent === 'page' ? scanPage(f) : analyse(await fileToCard(f)); };
  $('#pgfmt').onclick = e => { const b = e.target.closest('[data-pf]'); if (!b) return; try { localStorage.setItem('sc_page', b.dataset.pf); } catch { } $('#pgfmt').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  $('#pgf').onchange = e => { const f = e.target.files[0]; if (f) scanPage(f); };
  $('#scgo').onclick = () => manualSearch();
  $('#scn').oninput = e => { if (/^\d{3}$/.test(e.target.value)) $('#sct').focus(); }; // 3 chiffres : on passe au total
  $('#scman').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); manualSearch(); } };
  setIntent(intent);
  // moteur de reconnaissance : ~24 Mo téléchargés une seule fois, puis gardés par le navigateur
  let pct = 0;
  loadRecog(e => { if (e.status === 'progress' && /onnx/.test(e.file || '') && $('#scs') && e.progress - pct >= 3) { pct = e.progress; $('#scs').textContent = `⏳ Préparation de la reconnaissance (1re fois seulement, 24 Mo)… ${Math.round(pct)} %`; } })
    .then(() => { if (pct && $('#scs')) $('#scs').innerHTML = '✅ Reconnaissance prête. ' + TIPS[scanState.intent]; }).catch(() => { });
  scanState.cam = await startCam($('#cam video'), $('#frame'));
  if (scanState.cam) { $('#cap').onclick = () => analyse(scanState.cam.capture(true)); $('#bgo').onclick = toggleBurst; }
  setIntent(scanState.intent);
}
function setIntent(k) {
  if (!$('#scint')) return;
  scanState.intent = k; if (burst?.on && k !== 'burst') toggleBurst();
  $('#scint').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.si === k));
  const cam = !!scanState.cam, page = k === 'page';
  $('#cam').hidden = !cam || page; $('#cap').hidden = !cam || page || k === 'burst'; $('#bgo').hidden = !cam || k !== 'burst';
  $('#pgcap').hidden = !page; $('#pgfmt').hidden = !page; $('#scman').hidden = page || k === 'burst'; $('#scpick').hidden = k === 'burst';
  $('#scs').innerHTML = k === 'burst' && !cam ? '⚠️ La rafale a besoin de la caméra : autorise-la dans ton navigateur.' : TIPS[k];
  if (k === 'add' || k === 'auth') { if (scanState.shown) showScan(scanState.shown); } else if (!burst) $('#scr').innerHTML = '';
}
async function analyse(cv) {
  scanState.cv = cv; scanState.photo = await toBlob(cv); scanState.shown = null;
  $('#scr').innerHTML = `<div class="scanwait"><img src="${URL.createObjectURL(scanState.photo)}" alt=""><span>Lecture de la carte…<br><small class="mut">la première fois peut prendre 10 secondes</small></span></div>`; $('#scs').textContent = '';
  try {
    const r = await identify(cv);
    if (r.nums[0]) { $('#scn').value = r.nums[0].num; $('#sct').value = r.nums[0].total; Game.track('scan'); }
    if (!r.list.length) { $('#scr').innerHTML = ''; $('#scman').open = true; return $('#scs').innerHTML = '😕 Carte non reconnue. Rapproche-toi pour que le <b>numéro en bas</b> soit net, évite les reflets, ou saisis le numéro ci-dessous.'; }
    showRanked(r);
  } catch (err) { $('#scr').innerHTML = ''; $('#scs').textContent = err.message; }
}

// ---------- rafale : la caméra reste ouverte, chaque carte reconnue est ajoutée ----------
function toggleBurst() {
  if (burst?.on) { burst.on = false; $('#bgo').textContent = '▶️ Reprendre la rafale'; $('#camtip').textContent = 'En pause'; return; }
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); actx.resume?.(); } catch { } // le son doit être activé par un geste
  burst ||= { added: [], last: null, prev: null }; burst.on = true; burst.busy = false; $('#bgo').textContent = '⏸ Pause'; drawBurst(); tickBurst();
}
const camtip = t => { if ($('#camtip')) $('#camtip').textContent = t; };
async function tickBurst() {
  if (!burst?.on || !$('#cam')?.isConnected) return;
  if (!burst.busy) {
    const cv = scanState.cam.capture(), g = thumb(cv), blank = isBlank(g), stable = frameDiff(g, burst.prev) < 9; burst.prev = g;
    // la carte a été retirée (cadre vide) ou l'image a bien changé : on peut lire la suivante
    if (blank || frameDiff(g, burst.last) > 28) burst.cleared = true;
    const fresh = burst.cleared || frameDiff(g, burst.last) > 12;
    if (blank) camtip('📇 Place une carte dans le cadre');
    else if (!fresh) camtip('✅ Carte suivante !');
    else if (!stable) camtip('✋ Ne bouge plus…');
    else {
      burst.busy = true; camtip('🔎 Lecture…');
      try {
        const r = await identify(cv);
        if (r.sure && r.list[0].id === burst.added[0]?.id && !burst.cleared) burst.last = g; // même carte toujours là : pas de doublon
        else if (r.sure) await burstAdd(r.list[0], g);
        else if (r.list.length) return burstAsk(r.list.slice(0, 6), g);
        else { burst.last = g; burst.cleared = false; camtip('😕 Non reconnue : retourne-la un peu ou passe à la suivante'); }
      } catch (e) { camtip(e.message); }
      burst.busy = false;
    }
  }
  setTimeout(tickBurst, 600);
}
async function burstAdd(c, g) {
  c = await toLang(c, wantLang()); // rafale : on respecte la langue choisie
  const had = owned(c); burst.last = g; burst.cleared = false; burst.added.unshift({ ...c, had: had.length > 0 }); beep();
  camtip(`✅ ${nm(c)} ajoutée${had.length ? ` (tu l'avais déjà : ${had.map(x => `×${x.q} ${x.lang === 'ja' ? 'JP' : x.lang.toUpperCase()}`).join(', ')})` : ''}`);
  await addMany({ [c.id]: 1 }); drawBurst();
}
function burstAsk(list, g) {
  camtip('🤔 Laquelle est-ce ?');
  $('#scr').innerHTML = `<p class="small" style="margin:6px 0"><b>Pas sûr : touche la bonne carte</b> (ou passe)</p><div class="alts">${list.map((c, i) => `<button type="button" data-ba="${i}">${img(c)}${ownBadge(c)}<small>${flag(c.lang)} ${esc(nm(c))}<br>${esc(c.set_name)} · ${esc(c.local_id)}</small></button>`).join('')}</div><button type="button" class="btn sm ghost" data-ba="-1" style="margin-top:8px">Passer cette carte</button>`;
  $('#scr').onclick = async e => { const b = e.target.closest('[data-ba]'); if (!b) return; $('#scr').innerHTML = ''; $('#scr').onclick = null;
    if (+b.dataset.ba >= 0) await burstAdd(list[+b.dataset.ba], g); else { burst.last = g; burst.cleared = false; }
    burst.busy = false; setTimeout(tickBurst, 600); };
}
function drawBurst() {
  const a = burst.added;
  $('#bst').innerHTML = `<div class="bpanel panel"><b>⚡ ${a.length} carte${a.length > 1 ? 's' : ''} ajoutée${a.length > 1 ? 's' : ''}</b>${a.length ? ` · <span class="mut small">${eur(a.reduce((s, c) => s + (+c.price_eur || 0), 0))}</span>` : ''}
    <div class="bstrip">${a.slice(0, 30).map((c, i) => `<span${c.had ? ' class="had" title="Déjà dans ton classeur"' : ''}>${img(c)}<button type="button" data-bu="${i}" aria-label="Annuler ${esc(nm(c))}">×</button></span>`).join('')}</div></div>`;
  $('#bst').onclick = async e => { const b = e.target.closest('[data-bu]'); if (!b) return; const [c] = burst.added.splice(+b.dataset.bu, 1); await addMany({ [c.id]: -1 }); toast(`${nm(c)} retirée`); drawBurst(); };
}

// ---------- saisie express : « 1, 4, 12..18, 25x2 » dans la série affichée ----------
export function parseExpress(text, cs) {
  const key = v => /^\d+$/.test(v) ? String(+v) : v.toLowerCase(), idx = new Map(cs.map(c => [key(c.local_id), c])), map = {}, bad = [];
  const toks = text.toLowerCase().replace(/\s*(?:à|-|–)\s*/g, '..').replace(/\s*[x×*]\s*(\d)/g, 'x$1').split(/[\s,;]+|(?<!\.)\.(?!\.)/).filter(Boolean);
  for (const t of toks) {
    const m = t.match(/^([a-z]*\d+[a-z]*)(?:\.\.([a-z]*\d+[a-z]*))?(?:x(\d+))?$/); if (!m) { bad.push(t); continue; }
    const q = Math.min(20, +(m[3] || 1)), ids = [];
    if (m[2] && /^\d+$/.test(m[1]) && /^\d+$/.test(m[2]) && +m[2] >= +m[1] && +m[2] - +m[1] < 400) { for (let i = +m[1]; i <= +m[2]; i++) ids.push(String(i)); }
    else ids.push(key(m[1]));
    for (const k of ids) { const c = idx.get(k); if (c) map[c.id] = (map[c.id] || 0) + q; else bad.push(k); }
  }
  return { map, bad };
}
async function expressModal() {
  await loadSet(S.set); const set = S.sets.find(x => x.id === S.set), cs = S.bySet[S.set] || [];
  modal(`<div class="form express"><h2 style="margin:0">⌨️ Saisie express</h2>
  <p class="small mut" style="margin:0">${flag(S.lang)} <b>${esc(setName(set))}</b> · ${cs.length} cartes. Tape les numéros de tes cartes, séparés par des virgules.</p>
  <input id="exin" inputmode="decimal" autocomplete="off" placeholder="1, 4, 12..18, 25x2" aria-label="Numéros des cartes">
  <div class="exkeys"><button type="button" data-k=", ">,</button><button type="button" data-k="..">à (de… à…)</button><button type="button" data-k="x2">×2</button><button type="button" data-k="⌫">⌫</button></div>
  <p class="small mut" style="margin:0">Exemples : <b>1, 4, 7</b> · <b>12..18</b> (du 12 au 18) · <b>25x2</b> (deux exemplaires)</p>
  <div id="exprev"></div><button class="btn" id="exgo" type="button" disabled>Ajouter</button></div>`);
  const inp = $('#exin'), upd = () => {
    const { map, bad } = parseExpress(inp.value, cs), ids = Object.keys(map), n = ids.reduce((a, id) => a + map[id], 0);
    $('#exprev').innerHTML = (ids.length ? `<div class="alts">${ids.slice(0, 60).map(id => `<span class="exc">${img(S.cards[id])}<small>${esc(S.cards[id].local_id)}${map[id] > 1 ? ` ×${map[id]}` : ''}</small></span>`).join('')}</div>` : '')
      + (bad.length ? `<p class="small err">Introuvable dans cette série : ${bad.slice(0, 12).map(esc).join(', ')}</p>` : '');
    $('#exgo').disabled = !n; $('#exgo').textContent = n ? `➕ Ajouter ${n} carte${n > 1 ? 's' : ''}` : 'Ajouter';
    return map;
  };
  inp.oninput = upd;
  $('.exkeys').onpointerdown = e => { const b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); // garde le clavier ouvert
    inp.value = b.dataset.k === '⌫' ? inp.value.slice(0, -1) : inp.value.replace(/\s+$/, '') + b.dataset.k; upd(); };
  $('#exgo').onclick = async () => { const m = upd(), n = Object.values(m).reduce((a, b) => a + b, 0); await addMany(m); toast(`${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au classeur`); close(); await classeur(); };
  inp.focus();
}

// ---------- page de classeur : 9 cartes d'une photo ----------
// langue souhaitée pour la page (mémorisée d'un scan à l'autre)
const wantLang = () => scanLang || S.lang;
async function toLang(c, lang) {
  if (!c || c.lang === lang) return c;
  const v = (await langVersions(c)).find(x => x.lang === lang);
  if (v) remember([v]);
  return v || c;
}
const langChips = (c, attr) => ALL_LANGS.map(l => `<button type="button" class="chip lg${c.lang === l ? ' on' : ''}" data-${attr}="${l}" aria-pressed="${c.lang === l}">${l === 'ja' ? 'JP' : l.toUpperCase()}</button>`).join('');
async function scanPage(file) {
  const [cols, rows] = pageFmt().split('x').map(Number), cells = await splitPage(file, cols, rows), res = cells.map(() => ({ st: 'wait' }));
  scanState.page = res;
  const draw = () => {
    const n = res.filter(r => r.on && r.pick).length;
    $('#scr').innerHTML = `<div class="langsw" id="pglang"><span class="small mut">Langue de la page :</span>${ALL_LANGS.map(l => `<button type="button" class="chip lg${wantLang() === l ? ' on' : ''}" data-pl="${l}" aria-pressed="${wantLang() === l}">${l === 'ja' ? 'JP' : l.toUpperCase()}</button>`).join('')}</div>
      <div class="pagegrid" style="--cols:${cols}">${res.map((r, i) => `<button type="button" class="pcell ${r.st}${r.on ? ' on' : ''}" data-pc="${i}">${r.pick ? img(r.pick) + ownBadge(r.pick) : `<span>${{ wait: '…', blank: 'vide', none: '✖', run: '🔎' }[r.st] || '?'}</span>`}${r.st === 'unsure' ? '<i>?</i>' : r.on ? '<i>✓</i>' : ''}</button>`).join('')}</div>
      <div id="pcpick"></div><button type="button" class="btn" id="pcadd" ${n ? '' : 'disabled'}>➕ Ajouter ${n} carte${n > 1 ? 's' : ''} au classeur</button>`;
    $('#pcadd').onclick = async () => { const m = {}; res.forEach(r => { if (r.on && r.pick) m[r.pick.id] = (m[r.pick.id] || 0) + 1; }); await addMany(m); toast(`${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au classeur`); $('#scr').innerHTML = '<p class="okline">✅ Page ajoutée ! Photographie la suivante.</p>'; };
  };
  // changer la langue de toute la page d'un coup
  const switchAll = async lang => {
    setScanLang(lang); $('#scs').textContent = 'Changement de langue…';
    for (const r of res) if (r.pick) { const v = await toLang(r.pick, lang);
      if (v !== r.pick) { r.pick = v; if (!r.list.some(x => x.id === v.id)) r.list.unshift(v); } }
    $('#scs').textContent = `Langue : ${lang === 'ja' ? 'japonais' : LANGS[lang]}.`; draw();
  };
  // choix d'une case : la bonne carte, et la bonne langue sans re-scanner
  const cellPick = async i => {
    const r = res[i]; if (!r.list?.length) return;
    const vs = r.pick ? await langVersions(r.pick) : [];
    $('#pcpick').innerHTML = `<p class="small" style="margin:8px 0 4px"><b>Case ${i + 1}</b> : laquelle ?</p>
      <div class="alts">${r.list.slice(0, 6).map((c, j) => `<button type="button" data-pp="${j}">${img(c)}<small>${flag(c.lang)} ${esc(nm(c))}<br>${esc(c.local_id)}</small></button>`).join('')}<button type="button" data-pp="-1"><small>Ne pas ajouter</small></button></div>
      ${r.pick && vs.length > 1 ? `<div class="langsw"><span class="small mut">Langue de cette carte :</span>${vs.sort((a, b) => ALL_LANGS.indexOf(a.lang) - ALL_LANGS.indexOf(b.lang)).map(v => `<button type="button" class="chip lg${v.id === r.pick.id ? ' on' : ''}" data-pcl="${esc(v.lang)}" aria-pressed="${v.id === r.pick.id}">${v.lang === 'ja' ? 'JP' : v.lang.toUpperCase()}${S.coll[v.id] ? ` <small>✓${S.coll[v.id]}</small>` : ''}</button>`).join('')}</div>` : ''}`;
    $('#pcpick').onclick = async ev => {
      const l = ev.target.closest('[data-pcl]');
      if (l) { ev.stopPropagation(); r.pick = await toLang(r.pick, l.dataset.pcl); r.on = true; r.st = 'sure';
        if (!r.list.some(x => x.id === r.pick.id)) r.list.unshift(r.pick); draw(); cellPick(i); return; }
      const p = ev.target.closest('[data-pp]'); if (!p) return; ev.stopPropagation();
      const j = +p.dataset.pp;
      if (j >= 0) { r.pick = r.list[j]; r.on = true; r.st = 'sure'; } else r.on = false;
      draw(); if (j >= 0) cellPick(i);
    };
  };
  $('#scr').onclick = e => {
    const l = e.target.closest('[data-pl]'); if (l) return switchAll(l.dataset.pl);
    const b = e.target.closest('[data-pc]'); if (b) cellPick(+b.dataset.pc);
  };
  draw();
  for (let i = 0; i < cells.length; i++) {
    $('#scs').textContent = `Lecture de la case ${i + 1}/${cells.length}…`;
    if (isBlank(thumb(cells[i]))) { res[i].st = 'blank'; draw(); continue; }
    res[i].st = 'run'; draw();
    try { const r = await identify(cells[i]); Object.assign(res[i], { list: r.list, pick: r.list[0] || null, st: !r.list.length ? 'none' : r.sure ? 'sure' : 'unsure', on: r.sure });
      if (res[i].pick) { const v = await toLang(res[i].pick, wantLang());
        if (v !== res[i].pick) { res[i].pick = v; if (!res[i].list.some(x => x.id === v.id)) res[i].list.unshift(v); } } }
    catch { res[i].st = 'none'; }
    if (scanState.page !== res || !$('#scr')) return; draw();
  }
  const ok = res.filter(r => r.st === 'sure').length, doubt = res.filter(r => r.st === 'unsure').length;
  $('#scs').innerHTML = `${ok} carte${ok > 1 ? 's' : ''} reconnue${ok > 1 ? 's' : ''}${doubt ? `, <b>${doubt} à vérifier</b> (touche les cases « ? »)` : ''}. <span class="mut">Mauvaise langue ? Touche une case, ou change la langue de toute la page en haut.</span>`;
}

async function manualSearch() {
  const v = ($('#scn').value + ' ' + $('#sct').value).match(/(\d{1,3})\D*(\d{2,3})?/), words = $('#scw').value.split(/\s+/).filter(w => w.length >= 4);
  if (!v && !words.length) return $('#scs').textContent = 'Saisis le numéro (ex. 199/165) ou le nom.';
  const { data, error } = await sb.rpc('scan_match', { p_num: v?.[1] || null, p_total: v?.[2] ? +v[2] : null, p_words: words, p_lang: S.lang });
  if (error) return $('#scs').textContent = error.message;
  if (!data.length) return $('#scs').textContent = 'Aucune carte trouvée. Vérifie le numéro.';
  showRanked(scanState.cv ? await rank(data, scanState.cv, S.lang) : { list: data, sure: data.length === 1 });
}
// comment la carte a été reconnue : affiché sur chaque résultat (et bouton pour demander l'avis de l'IA)
const howLine = h => {
  if (!h) return '';
  const r = h.read, err = h.aiErr ? ` <span class="err">· ⚠️ ${esc(h.aiErr)}</span>` : '';
  if (h.t === 'ai') return `<p class="small mut readline">🤖 <b>Lu par l'IA</b> : ${esc(r?.name || '?')}${r?.number ? ` · ${esc(r.number)}${r.total ? '/' + esc(r.total) : ''}` : ''}${r?.language ? ` · ${esc(String(r.language).toUpperCase())}` : ''}${r?.set_name_en ? ` · ${esc(r.set_name_en)}` : ''}</p>`;
  if (h.t === 'vis') return `<p class="small mut readline">🖼️ <b>Reconnue par le dessin</b> (ressemblance ${Math.round(h.s * 100)} %)${err}</p>`;
  return `<p class="small mut readline">🔢 <b>Reconnue par le numéro lu</b>${err}</p>`;
};
const askAI = h => h && h.t !== 'ai' && scanState.cv ? `<button type="button" class="btn sm ghost" id="askai">🤖 Pas la bonne ? Demander à l'IA</button>` : '';
async function runAskAI() {
  const b = $('#askai'); if (b) { b.disabled = true; b.textContent = '🤖 L\'IA lit la carte… (quelques secondes)'; }
  const ai = await identifyAI(scanState.cv);
  if (ai?.cards?.length) return showRanked(fromAI(ai, scanState.list || []));
  if (b) { b.disabled = false; b.textContent = '🤖 Réessayer avec l\'IA'; }
  toast(ai?.read?.is_card === false ? 'L\'IA ne voit pas de carte sur la photo' : S.aiErr || 'L\'IA n\'a pas trouvé cette carte', true);
}
function showRanked({ list, sure, how }) {
  remember(list); scanState.list = list; scanState.how = how; scanState.autoLang = false;
  if (sure) return showScan(list[0]);
  $('#scs').textContent = list.length > 1 ? 'Plusieurs cartes possibles : touche la bonne.' : '';
  $('#scr').innerHTML = howLine(how) + `<div class="alts big">${list.map((c, i) => c.alt ? '' : `<button type="button" data-alt="${i}">${img(c)}${ownBadge(c)}<small>${flag(c.lang)} ${esc(nm(c))}<br>${esc(c.set_name)} · ${esc(c.local_id)}</small></button>`).join('')}</div>`;
  $('#scr').insertAdjacentHTML('beforeend', askAI(how));
  $('#scr').onclick = e => { if (e.target.closest('#askai')) return runAskAI(); const b = e.target.closest('[data-alt]'); if (b) showScan(list[+b.dataset.alt]); };
}
const artKey = id => id.replace(/^[a-z]{2}:/, ''), langCache = new Map();
// exemplaires déjà dans le classeur, toutes langues de la même carte : [{ lang, q }]
const owned = c => c ? ALL_LANGS.map(l => ({ lang: l, q: S.coll[`${l}:${artKey(c.id)}`] || 0 })).filter(x => x.q) : [];
const ownedLine = c => { const o = owned(c); return o.length ? `<p class="owned">📒 Tu l'as déjà : ${o.map(x => `<b>×${x.q}</b> ${flag(x.lang)}`).join(' · ')}</p>` : ''; };
const ownBadge = c => { const q = S.coll[c?.id] || 0, o = owned(c); return q ? `<span class="own">×${q}</span>` : o.length ? `<span class="own alt">✓ ${o.map(x => x.lang === 'ja' ? 'JP' : x.lang.toUpperCase()).join(' ')}</span>` : ''; };
// dernière langue choisie au scan : proposée en premier ensuite
let scanLang = null; try { scanLang = localStorage.getItem('sc_lang'); } catch { }
const setScanLang = l => { scanLang = l; try { localStorage.setItem('sc_lang', l); } catch { } };
// toutes les langues d'une même carte (même illustration, même numéro) : pour corriger la langue proposée
async function langVersions(c) {
  const k = artKey(c.id);
  if (!langCache.has(k)) langCache.set(k, (async () => {
    const { data } = await sb.from('cards').select('id,name,name_fr,lang,local_id,image,price_eur,set_id,set:sets(name,name_fr)').in('id', ALL_LANGS.map(l => `${l}:${k}`));
    return (data || []).map(x => ({ ...x, set_name: x.set?.name_fr || x.set?.name || '', alt: true }));
  })().catch(() => []));
  return langCache.get(k);
}
function showScan(c) {
  scanState.shown = c; scanState.qty = scanState.qty || 1;
  const add = scanState.intent === 'add', list = scanState.list || [], seenArt = new Set([artKey(c.id)]);
  const others = list.filter(x => !x.alt && !seenArt.has(artKey(x.id)) && seenArt.add(artKey(x.id)));
  const bAdd = `<div class="qtyrow"><button type="button" class="btn sm ghost" data-q="-1" aria-label="Moins">−</button><b id="sq">${scanState.qty}</b><button type="button" class="btn sm ghost" data-q="1" aria-label="Plus">+</button><button type="button" class="btn${add ? '' : ' ghost'}" id="sadd">${S.coll[c.id] ? '➕ En ajouter un de plus' : '➕ Ajouter au classeur'}</button></div>`;
  const bAuth = `<button type="button" class="btn${add ? ' ghost' : ''}" id="sauth">🔍 ${add ? 'L\'authentifier aussi' : 'Lancer le contrôle avec cette photo'}</button>`;
  $('#scs').textContent = '';
  $('#scr').innerHTML = `<div class="scanres panel"><div class="sr-img">${img(c, true)}</div><div class="sr-txt">
    <p class="small" style="margin:0"><span class="pill p-NM">✓ Carte reconnue</span></p>
    <h3>${flag(c.lang)} ${esc(nm(c))}</h3><div class="langsw" id="langsw"></div>${ownedLine(c)}${howLine(scanState.how)}<p class="small mut">${esc(c.set_name)} · n° ${esc(c.local_id)} · cote <button type="button" class="cote" data-cote="${c.id}">${eur(c.price_eur)}${trend(c)} 📈</button></p>
    </div><div class="sr-acts"><p class="small" style="margin:0"><b>C'est bien elle ?</b></p>${add ? bAdd + bAuth : bAuth + bAdd}${askAI(scanState.how)}
    <p class="small" style="margin:6px 0 0">${wishStar(c.id)} ${S.wish.has(c.id) ? 'Dans ta liste de souhaits' : 'La chercher : ajouter à mes souhaits'}</p></div></div>
    ${others.length ? `<details class="small"><summary>Pas la bonne ? (${others.length} autres)</summary><div class="alts">${others.map(x => `<button type="button" data-tw="${x.id}">${img(x)}<small>${flag(x.lang)} ${esc(nm(x))}<br>${esc(x.set_name)} · ${esc(x.local_id)}</small></button>`).join('')}</div></details>` : ''}`;
  langVersions(c).then(vs => {
    if (scanState.shown !== c || !$('#langsw')) return;
    for (const v of vs) if (!list.some(x => x.id === v.id)) list.push(v);
    remember(vs); scanState.list = list;
    // bonne langue d'office : celle lue par l'IA, sinon la dernière choisie, sinon celle du classeur
    if (!scanState.autoLang) { scanState.autoLang = true; const h = scanState.how, want = (h?.t === 'ai' && h.read?.language) || scanLang || S.lang, v = vs.find(x => x.lang === want);
      if (v && v.id !== c.id) return showScan(list.find(x => x.id === v.id) || v); }
    if (vs.length > 1) $('#langsw').innerHTML = '<span class="small mut">Langue de ta carte :</span> ' + vs.sort((a, b) => ALL_LANGS.indexOf(a.lang) - ALL_LANGS.indexOf(b.lang)).map(x => `<button type="button" class="chip lg${x.id === c.id ? ' on' : ''}" data-tw="${x.id}" aria-pressed="${x.id === c.id}">${x.lang === 'ja' ? 'JP' : x.lang.toUpperCase()}${S.coll[x.id] ? ` <small>✓${S.coll[x.id]}</small>` : ''}</button>`).join('');
  });
  $('#scr').onclick = async e => {
    if (e.target.closest('#askai')) return runAskAI();
    const t = e.target.closest('[data-tw],[data-q],#sadd,#sauth'); if (!t) return;
    if (t.dataset.tw) { const v = list.find(x => x.id === t.dataset.tw); if (t.closest('#langsw')) setScanLang(v.lang); return showScan(v); }
    if (t.dataset.q) { scanState.qty = Math.max(1, Math.min(20, scanState.qty + +t.dataset.q)); $('#sq').textContent = scanState.qty; return; }
    if (t.id === 'sadd') { const had = S.coll[c.id] || 0; await setQty(c.id, had + scanState.qty); Game.track('add'); checkUnlock(); if (S.bySet[c.set_id]) S.bySet[c.set_id] = null; setScanLang(c.lang);
      toast(had ? `${nm(c)} : tu en as maintenant ×${S.coll[c.id]}` : `${nm(c)} ajoutée au classeur`); scanState.qty = 1;
      $('#scr').insertAdjacentHTML('afterbegin', `<p class="small okline">✅ Ajoutée ! Tu peux scanner la suivante.</p>`); setTimeout(() => showScan(c), 1500); return; }
    if (t.id === 'sauth') openAuth(c, authH(), { recto: scanState.photo });
  };
}

// ---------- recherche par nom, plusieurs à la suite : « dracau, pika, bibi » ----------
const nsCache = new Map();
const nsTile = c => `<div class="nst"><span class="ns-img">${img(c)}${ownBadge(c)}</span><small>${flag(c.lang)} ${esc(nm(c))}<br><span class="mut">${esc(c.set_name)} · ${esc(c.local_id)}</span></small>
  <span class="nsq">${S.coll[c.id] ? `<button type="button" class="btn sm ghost" data-nsm="${c.id}" aria-label="Retirer un">−</button>` : ''}<button type="button" class="btn sm" data-nsp="${c.id}">+1</button></span></div>`;
async function nameSearch() {
  let lang = S.nsLang ?? S.lang, tm, seq = 0;
  modal(`<div class="form names"><h2 style="margin:0">🔎 Ajouter par nom</h2>
  <p class="small mut" style="margin:0">Tape le début des noms, séparés par des virgules : <b>dracau, pika, bibi</b>. Touche <b>+1</b> pour ajouter, l'image pour l'agrandir.</p>
  <input id="nsin" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="dracau, pika, bibi…" aria-label="Noms des cartes" value="${esc(S.nsq || '')}">
  <div class="seg" id="nslang"><button type="button" data-nl="" aria-pressed="${!lang}">Toutes</button>${ALL_LANGS.map(l => `<button type="button" data-nl="${l}" aria-pressed="${lang === l}">${l === 'ja' ? 'JP' : l.toUpperCase()}</button>`).join('')}</div>
  <div id="nsres" role="status"></div></div>`);
  const inp = $('#nsin'), box = $('#nsres');
  const run = async () => {
    const me = ++seq, terms = [...new Set(inp.value.split(/[,;\n]+/).map(t => t.trim()).filter(t => t.length >= 2))].slice(0, 12);
    S.nsq = inp.value; if (!terms.length) { box.innerHTML = ''; return; }
    const res = await Promise.all(terms.map(t => { const k = t.toLowerCase() + '|' + lang;
      if (!nsCache.has(k)) nsCache.set(k, sb.rpc('search_cards', { p_q: t, p_lang: lang || null }).then(r => (r.data || []).map(c => ({ ...c, set_name: setName(S.sets.find(x => x.id === c.set_id)) }))).catch(() => []));
      return nsCache.get(k); }));
    if (me !== seq || !box.isConnected) return; remember(res.flat());
    box.innerHTML = terms.map((t, i) => `<section class="nsgrp"><h4>« ${esc(t)} » <span class="small mut">${res[i].length >= 40 ? '40+ cartes : précise le nom' : `${res[i].length} carte${res[i].length > 1 ? 's' : ''}`}</span></h4>
      ${res[i].length ? `<div class="nsgrid">${res[i].map(nsTile).join('')}</div>` : '<p class="small mut">Aucune carte : vérifie l\'orthographe ou la langue.</p>'}</section>`).join('');
  };
  inp.oninput = () => { clearTimeout(tm); tm = setTimeout(run, 350); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tm); run(); } };
  $('#nslang').onclick = e => { const b = e.target.closest('[data-nl]'); if (!b) return; lang = S.nsLang = b.dataset.nl;
    $('#nslang').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); run(); };
  box.onclick = async e => { const b = e.target.closest('[data-nsp],[data-nsm]'); if (!b) return;
    const id = b.dataset.nsp || b.dataset.nsm, c = S.cards[id], had = owned(c); await addMany({ [id]: b.dataset.nsp ? 1 : -1 });
    if (b.dataset.nsp) { beep(); toast(had.length ? `${nm(c)} : déjà ${had.map(x => `×${x.q} ${x.lang === 'ja' ? 'JP' : x.lang.toUpperCase()}`).join(', ')} → maintenant ×${S.coll[id]} en ${c.lang === 'ja' ? 'JP' : c.lang.toUpperCase()}` : `${nm(c)} ajoutée au classeur`); }
    box.querySelectorAll('.nst').forEach(t => { const x = t.querySelector('[data-nsp]'); if (x && artKey(x.dataset.nsp) === artKey(id)) t.outerHTML = nsTile(S.cards[x.dataset.nsp]); }); };
  if (inp.value) run(); inp.focus();
}

// ---------- fenêtres secondaires : carte en grand, courbe de cote ----------
function sheet(html, cls = '') {
  let z = $('#dlg2'); if (!z) { z = Object.assign(document.createElement('dialog'), { id: 'dlg2' }); z.onclick = e => { if (e.target === z || z.classList.contains('zoom') || e.target.closest('[data-x]')) z.close(); }; document.body.append(z); }
  z.className = cls; z.innerHTML = `<button type="button" class="x" data-x aria-label="Fermer">×</button>${html}`; if (!z.open) z.showModal(); return z;
}
// toucher une carte (fiche du scan, annonce, recherche par nom) l'affiche en plein écran
document.addEventListener('click', e => { const i = e.target.closest('.sr-img img, .split > div:first-child > img.cimg, .ns-img img'); if (!i) return;
  e.preventDefault(); e.stopPropagation(); sheet(`<img src="${i.src.replace('/low.webp', '/high.webp')}" alt="${esc(i.alt)}">`, 'zoom'); }, true);
document.addEventListener('click', e => { const b = e.target.closest('[data-cote]'); if (!b) return; e.preventDefault(); e.stopPropagation(); coteModal(S.cards[b.dataset.cote]); }, true);
const histCache = new Map();
const priceHist = id => { if (!histCache.has(id)) histCache.set(id, sb.from('price_history').select('d,price').eq('tcg_id', id).gte('d', new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)).order('d').then(r => r.data || [])); return histCache.get(id); };
// courbe : points [x, y] dans un cadre W×H (marges incluses)
function curve(data, W, H, pad = 4) {
  const v = data.map(r => +r.price), mn = Math.min(...v), mx = Math.max(...v), t0 = +new Date(data[0].d), t1 = +new Date(data.at(-1).d);
  const pts = data.map(r => [pad + ((+new Date(r.d) - t0) / (t1 - t0 || 1)) * (W - 2 * pad), H - pad - ((+r.price - mn) / (mx - mn || 1)) * (H - 2 * pad)]);
  return { pts, mn, mx, up: v.at(-1) >= v[0], line: pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ') };
}
const fmtD = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
async function coteModal(c) {
  if (!c) return;
  const z = sheet(`<div class="cotebox"><p class="small mut" style="margin:0">${flag(c.lang)} ${esc(setName(S.sets.find(x => x.id === c.set_id)) || c.set_name || '')} · n° ${esc(c.local_id)}</p>
    <h3 style="margin:2px 0 4px">${esc(nm(c))}</h3><p class="cotebig">${eur(c.price_eur)}${trend(c)}</p><div id="cotech"><div class="skel" style="height:150px"></div></div></div>`, 'cotedlg');
  const box = $('#cotech', z), data = c.tcg_id ? await priceHist(c.tcg_id) : [];
  if (!box.isConnected) return;
  if (data.length < 2) { box.innerHTML = `<p class="small mut">${c.lang === 'ja' ? 'Pas de cote pour les cartes japonaises.' : 'Historique en construction : la courbe apparaîtra après quelques jours de relevés.'}</p>`; return; }
  const W = 320, H = 150, { pts, mn, mx, up, line } = curve(data, W, H, 6), last = +data.at(-1).price;
  const ago = n => { const t = Date.now() - n * 864e5, r = [...data].reverse().find(x => +new Date(x.d) <= t); return r ? (last - r.price) / r.price : null; };
  const pc = d => d == null ? '—' : `<span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${Math.round(d * 100)} %</span>`;
  box.innerHTML = `<div class="chart ${up ? 'up' : 'dn'}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la cote sur ${data.length} relevés, de ${eur(mn)} à ${eur(mx)}">
      <line class="g" x1="0" x2="${W}" y1="${pts[0][1] < H / 2 ? H - 6 : 6}" y2="${pts[0][1] < H / 2 ? H - 6 : 6}"/>
      <polygon class="area" points="${pts[0][0]},${H} ${line} ${pts.at(-1)[0]},${H}"/><polyline points="${line}"/>
      <line class="cx" id="cx" y1="0" y2="${H}" hidden/><circle id="cdot" r="4" hidden/></svg>
    <div class="tip" id="ctip" hidden></div>
    <div class="axis small mut"><span>${fmtD(data[0].d)}</span><span>${fmtD(data.at(-1).d)}</span></div></div>
    <dl class="kv cotekv"><dt>7 jours</dt><dd>${pc(ago(7))}</dd><dt>30 jours</dt><dd>${pc(ago(30))}</dd><dt>Plus bas</dt><dd>${eur(mn)}</dd><dt>Plus haut</dt><dd>${eur(mx)}</dd></dl>
    <p class="small mut" style="margin:0">Cote Cardmarket (tendance), ${data.length} relevés. Touche la courbe pour lire une date.</p>`;
  // curseur : glisser le doigt sur la courbe affiche la date et la cote
  const svg = $('svg', box), tip = $('#ctip', box), cx = $('#cx', box), dot = $('#cdot', box);
  const at = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W; let i = 0; for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k][0] - x) < Math.abs(pts[i][0] - x)) i = k;
    const [px, py] = pts[i]; cx.setAttribute('x1', px); cx.setAttribute('x2', px); dot.setAttribute('cx', px); dot.setAttribute('cy', py); cx.hidden = dot.hidden = tip.hidden = false;
    tip.innerHTML = `<b>${eur(data[i].price)}</b> ${fmtD(data[i].d)}`; tip.style.left = Math.min(Math.max(px / W * 100, 12), 88) + '%'; };
  svg.onpointermove = svg.onpointerdown = at; svg.onpointerleave = () => { cx.hidden = dot.hidden = tip.hidden = true; };
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
  let seen = true; try { seen = !!localStorage.getItem('sc_gseen'); localStorage.setItem('sc_gseen', '1'); } catch { }
  if (list.length && !seen) modal(`<h2 style="margin:0 0 8px">📖 Première transaction ?</h2><p>En 1 minute : les 8 étapes d'un échange, le paiement bloqué et comment bien emballer ta carte.</p><div class="acts"><a class="btn" href="#/guide" data-close>Lire le guide</a><button class="btn ghost" data-close>Plus tard</button></div>`);
  $('#offdot').hidden = true;
}
const GT = { pending: ['protocole', 'Les étapes d\'un échange'], accepted: ['paiement', 'Paiement bloqué : comment ça marche ?'], paid: ['emballer', 'Bien emballer ta carte'], disputed: ['litige', 'Comment se passe un litige ?'] };
function offerCard(o, X) {
  const seller = o.seller_id === S.user.id, other = S.pseudos[seller ? o.buyer_id : o.seller_id]?.pseudo || '?', c = o.listing.card, st = stepOf(o);
  const gives = [...o.offered_listing_ids.map(id => X[id] ? `${esc(nm(X[id].card))} (${X[id].condition})` : 'carte'), o.cash ? eur(o.cash) : ''].filter(Boolean).join(' + ');
  const needB = o.offered_listing_ids.length > 0, A = [];
  const b = (a, t, cls = '') => A.push(`<button class="btn sm ${cls}" data-act="${a}" data-o="${o.id}">${t}</button>`);
  if (o.status === 'pending') seller ? (b('accept', 'Accepter'), b('decline', 'Refuser', 'ghost')) : b('cancel', 'Annuler', 'ghost');
  const tradeOnly = +o.cash === 0 && +o.trade_fee > 0;
  if (o.status === 'accepted' && !tradeOnly && !seller) { b('pay', `Payer ${eur(+o.cash + +o.fee)}${S.st.payments_live ? '' : ' (mode test)'}`); b('cancel', 'Annuler', 'ghost'); }
  if (o.status === 'accepted' && !tradeOnly && seller) A.push('<span class="small mut">En attente du paiement de l\'acheteur.</span>');
  if (o.status === 'accepted' && tradeOnly) { // échange sans argent : 0,99 € de frais chacun
    const paidMe = seller ? o.trade_paid_seller : o.trade_paid_buyer, paidThem = seller ? o.trade_paid_buyer : o.trade_paid_seller;
    if (!paidMe) b('tradepay', `Payer mes frais d'échange ${eur(o.trade_fee)}${S.st.payments_live ? '' : ' (mode test)'}`);
    else A.push(`<span class="small mut">✔ Tes frais d'échange sont payés.${paidThem ? '' : ' En attente de ceux de ' + esc(other) + '.'}</span>`);
    if (!seller) b('cancel', 'Annuler', 'ghost');
  }
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
    ${GT[o.status] ? gtip(...GT[o.status]) : ''}<div class="acts">${A.join('')}</div>
    ${o.status === 'completed' && !S.reviewed?.has(o.id) ? `<form class="chatf" data-review="${o.id}" data-target="${seller ? o.buyer_id : o.seller_id}" style="margin-top:10px"><select aria-label="Note" style="width:auto">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select><input placeholder="Avis sur ${esc(other)} (optionnel)" maxlength="300"><button class="btn sm">Noter</button></form>` : ''}
    <div class="chat"><div class="msgs" id="m-${o.id}"></div><form class="chatf" data-chat="${o.id}"><input placeholder="Message (pas de coordonnées)" maxlength="500" aria-label="Message"><button class="btn sm">Envoyer</button></form><p class="err" id="e-${o.id}"></p></div>
  </div></div>`;
}
async function loadChat(id) {
  const { data } = await sb.from('messages').select('*').eq('offer_id', id).order('created_at');
  const box = $('#m-' + id); if (!box) return;
  box.innerHTML = (data || []).map(m => `<div class="msg ${m.sender_id === S.user.id ? 'me' : ''}">${esc(m.body)}${m.sender_id === S.user.id ? '' : `<button type="button" class="rpt" data-report="message:${m.id}" title="Signaler ce message" aria-label="Signaler ce message">⚠</button>`}</div>`).join('') || '<span class="small mut">Pose tes questions ici (état, envoi…).</span>';
  box.scrollTop = box.scrollHeight;
}
async function act(id, a) {
  let tracking = null;
  if (a === 'ship') {
    modal(`<form class="form" id="shipf"><h2 style="margin:0">Numéro de suivi</h2><p class="small mut">Envoi obligatoirement suivi (Lettre suivie, Colissimo, Mondial Relay). Carte sous sleeve + toploader. <a href="#/guide" target="_blank">Guide d'emballage</a></p><input id="trk" required pattern="[A-Za-z0-9]{8,30}" placeholder="Ex : 6A12345678901"><button class="btn">Valider l'expédition</button></form>`);
    tracking = await new Promise(r => { $('#shipf').onsubmit = e => { e.preventDefault(); r($('#trk').value.trim()); }; dlg.addEventListener('close', () => r(null), { once: true }); });
    close(); if (!tracking) return;
  }
  if (a === 'tradepay' && S.st.payments_live) {
    const { data, error } = await sb.functions.invoke('payments/trade', { body: { offer_id: id } });
    if (error || !data?.url) return toast(data?.error || 'Paiement indisponible, réessaie.', true);
    location.href = data.url; return;
  }
  if (a === 'tradepay') {
    modal(`<div class="form"><h2 style="margin:0">Frais d'échange</h2><p>Chaque membre paie ${eur(S.st.trade_fee ?? 0.99)} pour un échange carte contre carte : c'est ce qui finance la protection, la messagerie et la médiation. (3 échanges offerts à l'inscription, +1 par ami parrainé.)</p><p class="small mut">Mode test : aucun argent réel n'est débité.</p><button class="btn" id="okpay">Simuler le paiement</button></div>`);
    const ok = await new Promise(r => { $('#okpay').onclick = () => r(true); dlg.addEventListener('close', () => r(false), { once: true }); });
    close(); if (!ok) return;
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
  toast({ accept: 'Offre acceptée', decline: 'Offre refusée', cancel: 'Offre annulée', pay: 'Paiement bloqué en séquestre', tradepay: 'Frais d\'échange payés', ship: 'Expédition enregistrée', receive: 'Réception confirmée', dispute: 'Litige ouvert' }[a]);
  await loadSession(); offres();
}

// ---------- forum : 5 sections ----------
const SECTIONS = [
  ['libre', '💬 Expression libre', 'Ce qui te passe par la tête, entre collectionneurs.'],
  ['recherche', '🔎 Recherche de cartes', 'Dis ce que tu cherches : quelqu\'un l\'a peut-être en double.'],
  ['idees', '💡 Améliorations / propositions', 'Propose une idée pour le site et vote pour celles des autres.'],
  ['presentation', '👋 Présentez-vous', 'Ton pseudo, ta région, ce que tu collectionnes.'],
  ['blog', '📰 Autour des articles', 'Les discussions nées des articles du blog.']
];
const secName = k => (SECTIONS.find(x => x[0] === k) || SECTIONS[0])[1];
const maskNote = '<p class="small mut">Les coordonnées (téléphone, e-mail, lien, nom de famille) sont automatiquement masquées en <b class="mono">######</b> : écris librement, le site te protège.</p>';
async function forum() {
  const sec = S.fsec || 'libre', idees = sec === 'idees';
  let q = sb.from('posts').select('*, blog:blog(slug,title)').eq('section', sec).limit(80);
  q = idees ? q.order('votes', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
  const [{ data }, { data: mv }] = await Promise.all([q, S.profile ? sb.from('post_votes').select('post_id') : Promise.resolve({ data: [] })]);
  S.myvotes = new Set((mv || []).map(v => v.post_id));
  await pseudos((data || []).map(p => p.user_id));
  const [, titre, sous] = SECTIONS.find(x => x[0] === sec) || SECTIONS[0];
  view.innerHTML = `<h2>Le forum de la table</h2>
  <div class="seg wrapseg" style="margin-bottom:14px">${SECTIONS.map(([k, n]) => `<button data-fs="${k}" aria-pressed="${sec === k}">${n}</button>`).join('')}</div>
  <div class="panel"><h3 style="margin-top:0">${titre}</h3><p class="small mut">${sous}</p>
  ${S.profile ? `<form class="form" id="pf">${idees ? '<label class="f">Titre de ta proposition<input id="pt" maxlength="90" required></label>' : ''}
    <textarea id="pb" maxlength="1900" rows="4" placeholder="${idees ? 'Décris ton idée : à quoi ça sert, pour qui ?' : sec === 'presentation' ? 'Présente-toi : depuis quand tu collectionnes, ce que tu cherches…' : sec === 'recherche' ? 'Les cartes que tu cherches (extension, numéro, état voulu)…' : 'Une question sur une cote, une carte, un conseil d\'état ?'}"></textarea>
    <div class="bar" style="margin:0">${sec === 'libre' || sec === 'recherche' ? `<select id="ps" style="width:auto"><option value="">Général</option>${S.sets.filter(x => x.lang === S.lang).slice(0, 80).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}<button class="btn">Publier</button></div>
    ${maskNote}<p class="err" id="perr"></p></form>` : `<p class="mut">Lecture libre. <a href="#/compte">Connecte-toi</a> pour participer.</p>`}
  ${(data || []).map(p => { const u = S.pseudos[p.user_id], mine = p.user_id === S.user?.id, voted = S.myvotes.has(p.id);
    return `<div class="post">${av(u?.pseudo, u)}<div style="flex:1">
      <b>${who(p.user_id, u)}</b> <span class="small mut">${new Date(p.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${p.set_id ? ' · ' + esc(setName(S.sets.find(x => x.id === p.set_id))) : ''}${p.blog ? ` · <a href="#/blog/${esc(p.blog.slug)}">${esc(p.blog.title)}</a>` : ''}</span>
      ${p.title ? `<h4 style="margin:4px 0">${esc(p.title)}</h4>` : ''}
      <div style="white-space:pre-wrap">${esc(p.body)}</div>
      ${p.edited_at ? `<span class="small mut">(modifié le ${new Date(p.edited_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</span>` : ''}
      <div class="acts" style="margin-top:6px">${idees ? `<button class="btn ghost sm${voted ? ' on' : ''}" data-vote="${p.id}">👍 ${p.votes}${voted ? ' · voté' : ''}</button>` : ''}
      ${mine ? `<button class="btn ghost sm" data-editpost="${p.id}">✏️ Modifier</button><button class="btn ghost sm" data-delpost="${p.id}">Supprimer</button>` : `<button class="btn ghost sm" data-report="post:${p.id}">Signaler</button>`}</div>
    </div></div>`; }).join('') || '<div class="empty">Sois le premier à écrire ici.</div>'}</div>`;
  const f = $('#pf'); if (!f) return;
  f.onsubmit = async e => { e.preventDefault();
    const body = $('#pb').value.trim(); if (body.length < 2) return;
    const row = { body, section: sec, set_id: $('#ps')?.value || null, title: $('#pt')?.value.trim() || null };
    const { error } = await sb.from('posts').insert(row);
    if (error) return $('#perr').textContent = errMsg(error);
    forum(); };
}
// corriger son propre message (fautes de frappe) : le masquage est réappliqué par la base
async function editPost(id) {
  const { data: p, error } = await sb.from('posts').select('id,body,title,section').eq('id', id).maybeSingle();
  if (error || !p) return toast('Message introuvable', true);
  modal(`<form class="form" id="epf"><h2 style="margin:0">✏️ Modifier mon message</h2>
  ${p.section === 'idees' ? `<label class="f">Titre<input id="ept" maxlength="90" value="${esc(p.title || '')}"></label>` : ''}
  <label class="f">Message<textarea id="epb" maxlength="1900" rows="6">${esc(p.body)}</textarea></label>
  ${maskNote}<p class="err" id="eperr"></p><button class="btn">Enregistrer</button></form>`);
  $('#epf').onsubmit = async e => { e.preventDefault();
    const body = $('#epb').value.trim();
    if (body.length < 2) return $('#eperr').textContent = 'Ton message doit faire au moins 2 caractères.';
    const upd = { body }; if ($('#ept')) upd.title = $('#ept').value.trim() || null;
    const { error: er } = await sb.from('posts').update(upd).eq('id', id);
    if (er) return $('#eperr').textContent = errMsg(er);
    close(); toast('Message modifié'); route(); };
}
async function votePost(id) {
  if (needAccount()) return;
  if (S.myvotes?.has(id)) await sb.from('post_votes').delete().eq('post_id', id).eq('user_id', S.user.id);
  else { const { error } = await sb.from('post_votes').insert({ post_id: id, user_id: S.user.id }); if (error) return toast(errMsg(error), true); }
  forum();
}

// ---------- blog : un article par semaine, écrit à partir des vraies cotes ----------
const md = t => {
  const lines = esc(t).split(/\r?\n/), out = []; let ul = false;
  const inline = x => x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const l of lines) {
    const t2 = l.trim();
    if (/^- /.test(t2)) { if (!ul) { out.push('<ul>'); ul = true; } out.push(`<li>${inline(t2.slice(2))}</li>`); continue; }
    if (ul) { out.push('</ul>'); ul = false; }
    if (/^### /.test(t2)) out.push(`<h4>${inline(t2.slice(4))}</h4>`);
    else if (/^## /.test(t2)) out.push(`<h3>${inline(t2.slice(3))}</h3>`);
    else if (/^# /.test(t2)) out.push(`<h2>${inline(t2.slice(2))}</h2>`);
    else if (t2) out.push(`<p>${inline(t2)}</p>`);
  }
  if (ul) out.push('</ul>');
  return out.join('');
};
const blogDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
async function blog() {
  const slug = location.hash.split('/')[2];
  if (slug) return article(slug);
  const { data } = await sb.from('blog').select('id,slug,title,excerpt,tag,published_at,status').eq('status', 'published').order('published_at', { ascending: false }).limit(30);
  view.innerHTML = `<h2>📰 Le blog de Sharing Cards</h2>
  <p class="mut small">Un article par semaine, écrit à partir des cotes et des extensions du site. Les commentaires ouvrent une discussion dans le <a href="#/forum">forum</a>.</p>
  ${(data || []).length ? `<div class="bloglist">${data.map(a => `<a class="panel blogcard" href="#/blog/${esc(a.slug)}">
    <span class="pill p-tr">${esc(a.tag || 'Article')}</span>
    <h3>${esc(a.title)}</h3><p class="small mut">${blogDate(a.published_at)}</p><p>${esc(a.excerpt || '')}</p></a>`).join('')}</div>`
  : '<div class="empty">Le premier article arrive lundi. 📅</div>'}`;
}
async function article(slug) {
  const { data: a } = await sb.from('blog').select('*').eq('slug', slug).maybeSingle();
  if (!a) { view.innerHTML = '<div class="empty">Article introuvable. <a href="#/blog">Retour au blog</a></div>'; return; }
  const { data: cs } = await sb.from('posts').select('*').eq('blog_id', a.id).order('created_at');
  await pseudos((cs || []).map(c => c.user_id));
  view.innerHTML = `<article class="panel post-art">
    <p class="small mut"><a href="#/blog">← Le blog</a> · ${esc(a.tag || '')} · ${blogDate(a.published_at)}${a.status !== 'published' ? ' · <b>brouillon</b>' : ''}</p>
    <h1>${esc(a.title)}</h1>${a.excerpt ? `<p class="lead">${esc(a.excerpt)}</p>` : ''}
    <div class="artbody">${md(a.body)}</div>
    <p class="small mut">Cotes Cardmarket via TCGdex, relevées la nuit précédant la publication. Les prix bougent : vérifie toujours la fiche de la carte.</p></article>
  <h2>Commentaires <span class="mut small">${(cs || []).length}</span></h2>
  <div class="panel">
  ${S.profile ? `<form class="form" id="cf"><textarea id="cb" maxlength="1900" rows="4" placeholder="Ton avis sur l'article…"></textarea><div class="bar" style="margin:0"><button class="btn">Commenter</button></div>${maskNote}<p class="err" id="cerr"></p></form>` : `<p class="mut"><a href="#/compte">Connecte-toi</a> pour commenter.</p>`}
  ${(cs || []).map(c => { const u = S.pseudos[c.user_id], mine = c.user_id === S.user?.id;
    return `<div class="post">${av(u?.pseudo, u)}<div style="flex:1"><b>${who(c.user_id, u)}</b> <span class="small mut">${new Date(c.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
    <div style="white-space:pre-wrap">${esc(c.body)}</div>
    ${c.edited_at ? `<span class="small mut">(modifié)</span>` : ''}
    <div class="acts" style="margin-top:6px">${mine ? `<button class="btn ghost sm" data-editpost="${c.id}">✏️ Modifier</button><button class="btn ghost sm" data-delpost="${c.id}">Supprimer</button>` : `<button class="btn ghost sm" data-report="post:${c.id}">Signaler</button>`}</div></div></div>`; }).join('') || '<p class="mut small">Pas encore de commentaire.</p>'}</div>`;
  const f = $('#cf'); if (!f) return;
  f.onsubmit = async e => { e.preventDefault(); const body = $('#cb').value.trim(); if (body.length < 2) return;
    const { error } = await sb.from('posts').insert({ body, section: 'blog', blog_id: a.id });
    if (error) return $('#cerr').textContent = errMsg(error);
    article(slug); };
}

// ---------- compte ----------
async function compte() {
  if (S.profile) {
    const t = S.ev || { lvl: 1 }, { data: ls } = await sb.from('listings').select('*, card:cards(*)').eq('user_id', S.user.id).in('status', ['active', 'reserved']).order('created_at', { ascending: false });
    remember((ls || []).map(l => l.card));
    view.innerHTML = `${suspBanner()}<div class="panel" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${av(S.profile.pseudo, S.profile)}<div style="flex:1"><h2 style="margin:0">${esc(S.profile.pseudo)}</h2><p class="mut small" style="margin:2px 0"><a href="#/trophees">Niveau ${t.lvl}${t.title ? ' · ' + esc(t.title) : ''}</a> · ${S.profile.trades_done} échange(s) · ${esc(S.profile.region || '')}</p></div><button class="btn ghost" id="logout">Se déconnecter</button></div>
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
        <label class="f">Téléphone (demandé par le transporteur, jamais affiché)<input id="adp" type="tel" inputmode="tel" pattern="\\+?[0-9 .\\-]{9,20}" maxlength="20" placeholder="06 12 34 56 78"></label>
        <p class="err" id="aerr"></p><button class="btn sm">Enregistrer mon adresse</button></form>
      <p class="small" style="margin-top:12px">📍 Mon point relais de réception : <b id="myrelay">—</b> <button class="btn sm ghost" data-pickrelay>Choisir</button></p></div>
    <div class="panel" style="margin-top:12px"><h3>Vendre contre de l'argent</h3>${S.profile.payouts_enabled ? '<p class="small">✔ Compte vendeur vérifié : tu reçois tes paiements automatiquement.</p>' : `<p class="small mut">Pour recevoir de l'argent, notre partenaire de paiement Stripe vérifie ton identité (18+). Tes coordonnées bancaires restent chez Stripe, jamais chez nous. Les échanges carte contre carte n'en ont pas besoin.</p><button class="btn sm" data-connect>Activer mes ventes</button>`}</div>
    <div class="panel" style="margin-top:12px"><h3>🎁 Parraine un collectionneur</h3><p class="small mut">Ton ami reçoit 1 échange offert à l'inscription, toi 1 aussi dès sa première transaction réussie. (Échanges gratuits pendant la bêta, puis 0,99 €.)</p>
      <div class="acts"><input readonly id="reflink" value="${location.origin}/?ref=${S.profile.ref_code}" style="flex:1;min-width:200px"><button class="btn sm" id="refshare">Partager</button></div>
      <p class="small">Code : <b>${S.profile.ref_code}</b> · ${S.profile.filleuls || 0} filleul(s) actif(s) · ${S.profile.free_trades} échange(s) offert(s)</p></div>
    <div class="panel" style="margin-top:12px"><h3>Installer l'appli</h3>${S.install ? '<button class="btn sm" id="install">Installer sur cet appareil</button>' : '<p class="small mut">iPhone : bouton Partager puis « Sur l\'écran d\'accueil ». Android : menu ⋮ puis « Installer l\'application ».</p>'}</div>
    <div class="panel" style="margin-top:12px"><h3>Mes données</h3><p class="small mut">Tes droits RGPD : récupère toutes tes données ou supprime ton compte. <a href="#/legal/confidentialite">En savoir plus</a></p>
      <div class="acts"><button class="btn sm ghost" data-export>📥 Télécharger mes données</button><button class="btn sm ghost" data-csv>⬆️ Importer / exporter mon classeur (CSV)</button><button class="btn sm ghost" data-delacct style="color:#ff8a80">Supprimer mon compte</button></div>
      <p class="small mut">Conservation : messages et forum 3 ans, contrôles d'authenticité 2 ans, compte anonymisé après 3 ans sans visite.</p></div>
    <div class="panel" style="margin-top:12px"><h3>⭐ Ma liste de souhaits</h3><p class="small mut">Les cartes que tu cherches : la table peut les filtrer et les autres membres peuvent te les proposer.</p><a class="btn sm" href="#/souhaits">Voir ma liste${S.wish.size ? ` (${S.wish.size})` : ''}</a></div>
    ${S.profile.is_admin ? `<div class="panel" style="margin-top:12px"><h3>🛡️ Modération</h3><p class="small mut">Signalements, litiges et purge des données.</p><a class="btn sm" href="#/moderation">Ouvrir la modération</a></div>` : ''}
    <h2>Mes doubles sur la table</h2><div class="grid">${(ls || []).map(l => `<div class="tile">${l.photo_path ? `<img class="cimg" src="${photoUrl(l.photo_path)}" alt="">` : img(l.card)}<div class="meta"><span class="nm">${esc(nm(l.card))}</span><span class="v">${l.price ? eur(l.price) : 'Échange'}</span></div><div class="seller small"><span class="pill p-${l.condition}">${l.condition}</span>${authBadge(l) || `<button class="btn ghost sm" data-auth="${l.card_id}" data-lid="${l.id}">🔍 Authentifier</button>`}${l.status === 'reserved' ? '<span class="pill p-tr">réservée</span>' : `<button class="btn ghost sm" data-rmlist="${l.id}">Retirer</button>`}</div></div>`).join('') || '<div class="empty" style="grid-column:1/-1">Aucun double posé. <a href="#/classeur">Va dans ton classeur</a> et touche « Poser » sur une carte en double.</div>'}</div>`;
    $('#refshare').onclick = async () => { const url = $('#reflink').value, text = 'Rejoins-moi sur Sharing Cards, l\'espace des collectionneurs Pokémon :';
      if (navigator.share) { try { await navigator.share({ title: 'Sharing Cards', text, url }); } catch {} } else { await navigator.clipboard?.writeText(url); toast('Lien copié !'); } };
    if ($('#install')) $('#install').onclick = async () => { S.install.prompt(); S.install = null; compte(); };
    S.pav = S.profile.avatar ? [+S.profile.avatar[0], +S.profile.avatar[2]] : null; drawAvPick();
    sb.from('addresses').select('*').eq('user_id', S.user.id).maybeSingle().then(({ data: a }) => { if (a?.relay) $('#myrelay').textContent = a.relay.name; if (a) [['adn', 'name'], ['adc', 'country'], ['ad1', 'line1'], ['ad2', 'line2'], ['adz', 'zip'], ['adv', 'city'], ['adp', 'phone']].forEach(([i, k]) => $('#' + i).value = a[k] || ''); });
    $('#pfav').addEventListener('focus', async () => { if ($('#pknames').children.length) return; const { data } = await sb.from('pokemon_names').select('fr').order('species'); $('#pknames').innerHTML = (data || []).map(r => `<option value="${esc(r.fr)}">`).join(''); }, { once: true });
    $('#pf').onsubmit = async e => { e.preventDefault(); const bio = $('#pbio').value.trim(), fav = $('#pfav').value.trim();
      if (contactViolation(bio) || contactViolation(fav)) return $('#perr').textContent = 'Pas de coordonnées dans la bio.';
      const upd = { bio: bio || null, fav: fav || null, theme: $('#pth').value, show_collection: $('#pcol').checked, show_badges: $('#pbdg').checked, avatar: S.pav ? S.pav.join(':') : null };
      const { error } = await sb.from('profiles').update(upd).eq('id', S.user.id); if (error) return $('#perr').textContent = errMsg(error);
      Object.assign(S.profile, upd); S.pseudos[S.user.id] = null; toast('Profil enregistré'); compte(); };
    $('#adf').onsubmit = async e => { e.preventDefault();
      const row = { user_id: S.user.id, name: $('#adn').value.trim(), country: $('#adc').value.trim(), line1: $('#ad1').value.trim(), line2: $('#ad2').value.trim() || null, zip: $('#adz').value.trim(), city: $('#adv').value.trim(), phone: $('#adp').value.trim() || null, updated_at: new Date().toISOString() };
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
  <label class="ck"><input type="checkbox" id="arules" required><span> J'accepte les <a href="#/legal/cgu" target="_blank">CGU</a>, les <a href="#/legal/cgv" target="_blank">conditions de vente</a> et la <a href="#/legal/confidentialite" target="_blank">politique de confidentialité</a> : pas d'échange de coordonnées, toutes les transactions passent par l'appli.</span></label>`;
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
   <li><b>Aucune coordonnée.</b> Dans les annonces et la messagerie privée, téléphone, e-mail, réseaux sociaux, liens, IBAN et rendez-vous en main propre sont <b>bloqués</b>. Dans le forum et les commentaires du blog, ils sont <b>masqués</b> automatiquement (<span class="mono">######</span>) : ton message reste lisible, tes coordonnées ne partent pas. Les noms de famille (deux mots avec majuscule) sont également masqués ; un prénom seul passe.</li>
   <li><b>Paiement en séquestre.</b> L'argent de l'acheteur est bloqué jusqu'à ce qu'il confirme la réception de la carte, comme le « Trustee Service » de Cardmarket.</li>
   <li><b>Envoi suivi obligatoire.</b> Numéro de suivi requis pour marquer une carte expédiée. Protection : sleeve + toploader + enveloppe rigide.</li>
   <li><b>État honnête.</b> NM = comme neuve, EX = micro-défauts, GD = usure visible, PL = abîmée. Photo de ta propre carte recommandée.</li>
   <li><b>Litige.</b> Carte non reçue ou non conforme : ouvre un litige depuis l'offre. L'argent reste bloqué pendant l'examen.</li>
   <li><b>Contrôle d'authenticité.</b> Chaque carte peut passer un contrôle photo (couleurs comparées à l'officielle, texte, dos, test de la lampe). Le score est affiché sur l'annonce, et l'acheteur peut refaire le contrôle à la réception avant de confirmer. Il est indicatif et ne remplace pas une expertise.</li>
   <li><b>Contrefaçons interdites.</b> Toute fausse carte signalée entraîne l'exclusion définitive.</li>
   <li><b>Trophées mérités.</b> Les compteurs (cartes, scans, défis) sont tenus par la base, pas par ton téléphone. Une carte compte pour les trophées après 7 jours dans ton classeur, et un trophée s'éteint si la condition n'est plus vraie.</li>
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

// ---------- liste de souhaits ----------
async function loadWish() {
  if (!S.profile) { S.wish = new Set(); return; }
  const { data } = await sb.from('wishlist').select('card_id');
  S.wish = new Set((data || []).map(r => r.card_id));
}
const wishStar = id => `<button type="button" class="wish${S.wish.has(id) ? ' on' : ''}" data-wish="${id}" title="Liste de souhaits" aria-label="${S.wish.has(id) ? 'Retirer de' : 'Ajouter à'} ma liste de souhaits">${S.wish.has(id) ? '★' : '☆'}</button>`;
async function toggleWish(id) {
  if (needAccount()) return;
  if (S.wish.has(id)) {
    const { error } = await sb.from('wishlist').delete().eq('user_id', S.user.id).eq('card_id', id);
    if (error) return toast(errMsg(error), true);
    S.wish.delete(id); toast('Retirée de ta liste de souhaits');
  } else {
    const { error } = await sb.from('wishlist').insert({ user_id: S.user.id, card_id: id });
    if (error) return toast(errMsg(error), true);
    S.wish.add(id); Game.track('wish'); checkUnlock(); toast('⭐ Ajoutée à ta liste de souhaits');
  }
  route();
}
async function souhaits() {
  if (!S.profile) { view.innerHTML = `<div class="empty"><h2>⭐ Ma liste de souhaits</h2><p>Connecte-toi pour noter les cartes que tu cherches.</p><a class="btn" href="#/compte">Se connecter</a></div>`; return; }
  const ids = [...S.wish];
  const [{ data: cs }, { data: ls }] = await Promise.all([
    ids.length ? sb.from('cards').select('*').in('id', ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('listings').select('*, card:cards(*, set:sets(name,name_fr,code,serie_name)), auction:auctions(*)').eq('status', 'active').in('card_id', ids) : Promise.resolve({ data: [] })
  ]);
  remember(cs); await pseudos((ls || []).map(l => l.user_id));
  for (const l of ls || []) l.auc = [].concat(l.auction || [])[0] || null;
  S.listings = [...(S.listings || []).filter(x => !(ls || []).some(y => y.id === x.id)), ...(ls || [])];
  const byCard = {}; for (const l of ls || []) (byCard[l.card_id] ||= []).push(l);
  view.innerHTML = `<h2>⭐ Ma liste de souhaits <span class="mut small">${ids.length} carte(s)</span></h2>
  <p class="mut small">Touche l'étoile ☆ d'une carte (classeur, scan, annonce) pour l'ajouter. Les annonces disponibles apparaissent ici, et le tri « ⭐ Ma liste » de la table ne montre que ces cartes.</p>
  ${ids.length ? `<div class="grid">${(cs || []).map(c => { const l = byCard[c.id], px = (l || []).map(x => x.price).filter(x => x != null);
    return `<div class="tile">${img(c)}${wishStar(c.id)}
    <div class="meta"><span class="nm">${c.local_id} · ${esc(nm(c))}</span><span class="v">${eur(c.price_eur)}</span></div>
    <div class="seller"><span>${flag(c.lang)} ${esc(setName(S.sets.find(s => s.id === c.set_id)))}</span></div>
    ${l ? `<button class="btn sm" data-l="${l[0].id}">${l.length} annonce(s)${px.length ? ' · dès ' + eur(Math.min(...px)) : ''}</button>` : '<span class="small mut">Aucune annonce pour l\'instant</span>'}</div>`; }).join('')}</div>`
  : '<div class="empty">Ta liste est vide : touche ☆ sur une carte qui te manque.</div>'}`;
}

// ---------- import / export CSV du classeur ----------
function parseCSV(text) {
  const head = text.split(/\r?\n/)[0] || '';
  const sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : (head.match(/\t/g) || []).length ? '\t' : ',';
  const rows = []; let f = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n') { row.push(f); if (row.some(x => x.trim())) rows.push(row); f = ''; row = []; }
    else if (ch !== '\r') f += ch; }
  row.push(f); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
const CSVCOL = { set: /^(set|sets?.?name|extension|edition|édition|serie|série|expansion)$/i, num: /^(num|n°|no|number|numero|numéro|card.?number|collector.?number|local.?id)$/i,
  name: /^(nom|name|carte|card|card.?name|nom.?de.?la.?carte)$/i, qty: /^(qty|quantity|quantite|quantité|nb|count|exemplaires|amount)$/i, lang: /^(lang|langue|language)$/i };
function csvRows(text) {
  const rows = parseCSV(text); if (!rows.length) return { err: 'Fichier vide.' };
  const head = rows[0].map(h => h.trim().replace(/^\uFEFF/, '')), map = {};
  for (const [k, re] of Object.entries(CSVCOL)) { const i = head.findIndex(h => re.test(h)); if (i >= 0) map[k] = i; }
  if (map.num == null && map.name == null) return { err: 'Il manque une colonne « numero » ou « nom » dans la première ligne du fichier.' };
  const out = rows.slice(1).map(r => ({ set: map.set != null ? r[map.set] : '', num: map.num != null ? r[map.num] : '', name: map.name != null ? r[map.name] : '', lang: map.lang != null ? r[map.lang] : '', qty: map.qty != null ? parseInt(r[map.qty], 10) || 1 : 1 }))
    .filter(r => (r.num || '').trim() || (r.name || '').trim());
  return out.length ? { rows: out.slice(0, 2000) } : { err: 'Aucune ligne de carte trouvée.' };
}
function csvModal() {
  modal(`<div class="form"><h2 style="margin:0">⬆️ Importer / exporter mon classeur</h2>
  <p class="small mut">Fichier <b>CSV</b> (ou texte collé) avec une première ligne de titres. Colonnes reconnues : <b>extension</b>, <b>numero</b>, <b>nom</b>, <b>quantite</b>, <b>langue</b>. Exemple :</p>
  <pre class="small mono" style="white-space:pre-wrap;margin:0">extension;numero;nom;quantite;langue
Évolutions Prismatiques;005;Phyllali;2;fr
151;025;Pikachu;1;fr</pre>
  <label class="f" style="margin-top:10px">Choisir un fichier<input type="file" id="csvf" accept=".csv,.txt,text/csv,text/plain"></label>
  <label class="f">…ou coller le contenu<textarea id="csvt" rows="5" placeholder="extension;numero;nom;quantite"></textarea></label>
  <label class="f">Langue par défaut (si la colonne manque)<select id="csvl">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  <label class="ck"><input type="checkbox" id="csvadd"> Ajouter aux quantités déjà présentes (sinon remplace)</label>
  <p class="err" id="csve"></p>
  <div class="acts"><button class="btn" id="csvgo">Analyser le fichier</button><button class="btn ghost" id="csvdl">📥 Exporter mon classeur</button></div>
  <div id="csvres"></div></div>`);
  $('#csvdl').onclick = () => csvExport();
  $('#csvf').onchange = async e => { const f = e.target.files[0]; if (f) $('#csvt').value = await f.text(); };
  $('#csvgo').onclick = async () => {
    $('#csve').textContent = ''; const txt = $('#csvt').value.trim();
    if (!txt) return $('#csve').textContent = 'Choisis un fichier ou colle le contenu.';
    const r = csvRows(txt); if (r.err) return $('#csve').textContent = r.err;
    $('#csvres').innerHTML = '<p class="small mut">Reconnaissance des cartes en cours…</p>';
    const res = [];
    for (let i = 0; i < r.rows.length; i += 200) {
      const { data, error } = await sb.rpc('csv_match', { p_rows: r.rows.slice(i, i + 200), p_lang: $('#csvl').value });
      if (error) return $('#csve').textContent = errMsg(error);
      res.push(...(data || []));
    }
    const ok = res.filter(x => x.card_id), ko = res.filter(x => !x.card_id);
    S.csv = { ok, add: $('#csvadd').checked };
    $('#csvres').innerHTML = `<div class="panel" style="margin-top:12px"><p><b>${ok.length}</b> carte(s) reconnue(s)${ko.length ? `, <b>${ko.length}</b> non trouvée(s)` : ''}.</p>
      ${ok.length ? `<ul class="small" style="max-height:160px;overflow:auto">${ok.slice(0, 60).map(x => `<li>×${x.qty} ${esc(x.label)}</li>`).join('')}${ok.length > 60 ? `<li class="mut">… et ${ok.length - 60} autres</li>` : ''}</ul>` : ''}
      ${ko.length ? `<details class="small"><summary>Lignes non reconnues</summary><ul>${ko.slice(0, 40).map(x => `<li>${esc(x.raw || '—')}</li>`).join('')}</ul><p class="mut">Astuce : ajoute la colonne « extension » ou vérifie le numéro (ex. 005 ou 5).</p></details>` : ''}
      ${ok.length ? '<button class="btn" id="csvok">Importer dans mon classeur</button>' : ''}</div>`;
    if ($('#csvok')) $('#csvok').onclick = csvApply;
  };
}
async function csvApply() {
  const { ok, add } = S.csv || {}; if (!ok?.length) return;
  $('#csvok').disabled = true; $('#csvok').textContent = 'Import en cours…';
  let n = 0;
  if (S.profile) {
    const rows = ok.map(x => ({ user_id: S.user.id, card_id: x.card_id, qty: Math.min(99, add ? (S.coll[x.card_id] || 0) + x.qty : x.qty) }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('collection').upsert(rows.slice(i, i + 500));
      if (error) { toast(errMsg(error), true); break; }
      n += rows.slice(i, i + 500).length;
    }
    await loadCollection();
  } else { for (const x of ok) { await setQty(x.card_id, add ? (S.coll[x.card_id] || 0) + x.qty : x.qty); n++; } }
  Game.track('add', n); checkUnlock(); close(); toast(`${n} carte(s) importée(s) dans ton classeur`);
  if (location.hash.startsWith('#/classeur')) classeur();
}
async function csvExport() {
  const ids = Object.keys(S.coll).filter(k => S.coll[k] > 0);
  if (!ids.length) return toast('Ton classeur est vide.', true);
  const miss = ids.filter(k => !S.info[k]);
  for (let i = 0; i < miss.length; i += 1000) { const { data } = await sb.rpc('coll_info', { p_ids: miss.slice(i, i + 1000) }); for (const r of data || []) S.info[r.id] = r; }
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['extension;numero;nom;quantite;langue;cote_eur'];
  for (const id of ids) { const c = S.info[id]; if (!c) continue;
    lines.push([setName(S.sets.find(s => s.id === c.set_id)) || c.set_id, c.local_id, c.name_fr || c.name, S.coll[id], c.lang, c.price_eur ?? ''].map(q).join(';')); }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })), download: 'mon-classeur-sharing-cards.csv' });
  a.click(); URL.revokeObjectURL(a.href); toast('Classeur exporté en CSV');
}

// ---------- signalement ----------
const REASONS = ['Fausse carte / contrefaçon', 'Coordonnées ou vente hors appli', 'Revendeur professionnel', 'Propos insultants ou interdits', 'Annonce trompeuse (état, photo)', 'Autre'];
function reportModal(target) {
  const [type, id] = target.split(':');
  modal(`<form class="form" id="rpf"><h2 style="margin:0">Signaler</h2>
  <p class="small mut">Envoyé à la modération. Le membre visé ne sait pas qui l'a signalé.</p>
  <label class="f">Motif<select id="rpr">${REASONS.map(r => `<option>${r}</option>`).join('')}</select></label>
  <label class="f">Précisions (optionnel)<textarea id="rpn" maxlength="300"></textarea></label>
  <p class="err" id="rpe"></p><button class="btn">Envoyer le signalement</button></form>`);
  $('#rpf').onsubmit = async e => { e.preventDefault();
    const note = $('#rpn').value.trim(), reason = $('#rpr').value + (note ? ' — ' + note : '');
    const { error } = await sb.from('reports').insert({ target_type: type, target_id: id, reason });
    if (error) return $('#rpe').textContent = errMsg(error);
    close(); toast('Merci, signalement envoyé à la modération');
  };
}

// ---------- modération (réservée aux comptes admin) ----------
const askNote = (title) => new Promise(r => {
  modal(`<form class="form" id="nf"><h2 style="margin:0">${esc(title)}</h2>
  <label class="f">Note interne / motif (optionnel)<textarea id="nt" maxlength="300"></textarea></label><button class="btn">Valider</button></form>`);
  $('#nf').onsubmit = e => { e.preventDefault(); const v = $('#nt').value.trim(); close(); r(v || null); };
  dlg.addEventListener('close', () => r(undefined), { once: true });
});
async function moderation() {
  if (!S.profile?.is_admin) { view.innerHTML = '<div class="empty">Page réservée à la modération.</div>'; return; }
  const tab = S.mtab || 'rep', { data: ov, error } = await sb.rpc('admin_overview');
  if (error) { view.innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
  view.innerHTML = `<h2>🛡️ Modération</h2>
  <div class="kpis">${[['membres', 'membres'], ['annonces', 'annonces actives'], ['offres_en_cours', 'offres en cours'], ['signalements_ouverts', 'signalements'], ['litiges', 'litiges'], ['suspendus', 'suspendus']].map(([k, n]) => `<div><b>${ov[k] ?? 0}</b><span>${n}</span></div>`).join('')}</div>
  <div class="seg wrapseg" style="margin:14px 0">${[['rep', 'Signalements'], ['dis', 'Litiges & remboursements'], ['blog', 'Blog'], ['rgpd', 'RGPD & données']].map(([k, n]) => `<button data-mt="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
  <div id="mbody"><div class="skel"><div class="sk sk-card"></div></div></div>`;
  if (tab === 'rep') return modReports();
  if (tab === 'dis') return modDisputes();
  if (tab === 'blog') return modBlog();
  modRgpd(ov);
}
async function modReports() {
  const st = S.mstatus || 'open', { data, error } = await sb.rpc('admin_reports', { p_status: st });
  if (error) return $('#mbody').innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`;
  $('#mbody').innerHTML = `<div class="seg" style="margin-bottom:12px">${[['open', 'À traiter'], ['handled', 'Traités'], ['dismissed', 'Ignorés'], ['all', 'Tous']].map(([k, n]) => `<button data-mst="${k}" aria-pressed="${st === k}">${n}</button>`).join('')}</div>
  ${(data || []).map(r => `<div class="panel mod">
    <p class="small mut" style="margin:0">#${r.id} · ${new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(r.type)} · signalé par ${esc(r.reporter || '?')}${r.status !== 'open' ? ` · <span class="pill p-tr">${esc(r.status)}</span>` : ''}</p>
    <p style="margin:6px 0"><b>Motif :</b> ${esc(r.reason || '—')}</p>
    <p class="panel small" style="white-space:pre-wrap;margin:6px 0">${esc(r.content || '(contenu déjà supprimé)')}</p>
    ${r.photo ? `<img class="cimg" style="max-width:160px" src="${photoUrl(r.photo)}" alt="Photo de l'annonce signalée">` : ''}
    <p class="small">Membre visé : ${r.author_id ? `<a href="#/membre/${r.author_id}">${esc(r.author || '?')}</a>` : '—'} · ${r.reports_total || 0} signalement(s) au total${r.suspended_until ? ' · <b>déjà suspendu</b>' : ''}</p>
    <div class="acts">${r.status === 'open' ? `<button class="btn sm" data-ract="${r.id}:remove">Retirer le contenu</button><button class="btn sm ghost" data-ract="${r.id}:suspend">Suspendre 7 j</button><button class="btn sm ghost" data-ract="${r.id}:ban">Bannir</button><button class="btn sm ghost" data-ract="${r.id}:dismiss">Ignorer</button>` : ''}${r.suspended_until ? `<button class="btn sm ghost" data-ract="${r.id}:unsuspend">Lever la suspension</button>` : ''}${r.author_id ? `<button class="btn sm ghost" data-rstat="${r.author_id}">Remettre ses trophées à zéro</button>` : ''}</div>
    ${r.note ? `<p class="small mut">Note : ${esc(r.note)}</p>` : ''}</div>`).join('') || '<div class="empty">Rien à traiter 🎉</div>'}`;
}
async function modDisputes() {
  const { data, error } = await sb.rpc('admin_disputes');
  if (error) return $('#mbody').innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`;
  $('#mbody').innerHTML = (data || []).map(o => `<div class="panel mod">
    <p class="small mut" style="margin:0">${esc(o.id.slice(0, 8))} · ${new Date(o.updated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · <span class="pill p-PL">${esc(o.status)}</span>${o.refund_requested ? ` · remboursement ${o.refunded_at ? 'effectué' : 'en attente'}` : ''}</p>
    <h3 style="margin:6px 0">${esc(o.card || '?')} <span class="pill p-${esc(o.condition || 'NM')}">${esc(o.condition || '')}</span></h3>
    <p class="small">Acheteur <a href="#/membre/${o.buyer_id}">${esc(o.buyer || '?')}</a> · Vendeur <a href="#/membre/${o.seller_id}">${esc(o.seller || '?')}</a> · ${o.trade ? 'échange' : 'vente'} ${eur(o.cash)}${o.fee ? ` (+ ${eur(o.fee)} de frais)` : ''}${o.has_payment ? '' : ' · <b>pas de paiement Stripe</b> (mode test)'}</p>
    <p class="small mut">Suivi vendeur ${esc(o.seller_tracking || '—')} · suivi acheteur ${esc(o.buyer_tracking || '—')} · reçu par l'acheteur : ${o.buyer_received ? 'oui' : 'non'}${o.auth_score != null ? ` · contrôle de l'annonce ${o.auth_score}/100` : ''}</p>
    ${(o.checks || []).map(c => `<p class="small">🔍 contrôle à la réception : ${c.score}/100 — ${esc(c.verdict || '')}</p>`).join('')}
    ${o.photo ? `<img class="cimg" style="max-width:160px" src="${photoUrl(o.photo)}" alt="Photo de l'annonce">` : ''}
    <details class="small" style="margin:8px 0"><summary>Messages (${(o.messages || []).length})</summary>${(o.messages || []).map(m => `<p style="margin:4px 0"><b>${esc(m.who || '?')}</b> : ${esc(m.body)}</p>`).join('') || '<p class="mut">aucun</p>'}</details>
    <div class="acts"><button class="btn sm" data-oact="${o.id}:release">Verser au vendeur</button><button class="btn sm ghost" data-oact="${o.id}:refund">Rembourser l'acheteur</button><button class="btn sm ghost" data-oact="${o.id}:reopen">Rouvrir (sans décision)</button><button class="btn sm ghost" data-oact="${o.id}:note">Note</button></div>
    ${o.admin_note ? `<p class="small mut">Note : ${esc(o.admin_note)}</p>` : ''}</div>`).join('') || '<div class="empty">Aucun litige en cours 🎉</div>';
}
function modRgpd(ov) {
  const p = ov?.a_purger || {}, last = ov?.derniere_purge;
  $('#mbody').innerHTML = `<div class="panel"><h3 style="margin-top:0">Purge automatique (RGPD)</h3>
  <p class="small mut">Chaque nuit à 4 h 23, l'appli efface : messages et posts de plus de 3 ans, contrôles d'authenticité de plus de 2 ans, signalements traités de plus d'un an ; et anonymise les comptes sans visite depuis 3 ans (sauf transaction en cours). Les transactions terminées sont conservées sans nom (obligation comptable).</p>
  <div class="kpis"><div><b>${p.comptes_inactifs ?? 0}</b><span>comptes inactifs à anonymiser</span></div><div><b>${p.messages ?? 0}</b><span>messages de +3 ans</span></div><div><b>${p.posts ?? 0}</b><span>posts de +3 ans</span></div><div><b>${ov?.remboursements_a_faire ?? 0}</b><span>remboursements en attente</span></div></div>
  <p class="small">Dernière purge : ${last ? new Date(last.at).toLocaleString('fr-FR') + ' · ' + esc(JSON.stringify(last.result)) : 'jamais'}</p>
  <button class="btn sm" data-purge>Lancer la purge maintenant</button></div>`;
}
async function modBlog() {
  const { data, error } = await sb.rpc('admin_blog', { p_action: 'list' });
  if (error) return $('#mbody').innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`;
  $('#mbody').innerHTML = `<div class="panel"><h3 style="margin-top:0">Articles</h3>
  <p class="small mut">Un article est généré automatiquement chaque lundi à partir des cotes et des extensions, et reste en <b>brouillon</b> jusqu'à ce que tu le publies. Les commentaires d'un article arrivent dans la section « Autour des articles » du forum.</p>
  <button class="btn sm" data-bgen>✍️ Générer un article maintenant</button></div>
  ${(data || []).map(a => `<div class="panel mod"><p class="small mut" style="margin:0">${esc(a.tag || '')} · créé le ${new Date(a.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · <span class="pill p-${a.status === 'published' ? 'NM' : 'GD'}">${esc(a.status)}</span> · ${a.comments} commentaire(s)</p>
    <h3 style="margin:6px 0">${esc(a.title)}</h3><p class="small">${esc(a.excerpt || '')}</p>
    <details class="small"><summary>Lire / modifier</summary><pre style="white-space:pre-wrap">${esc(a.body || '')}</pre></details>
    <div class="acts"><a class="btn sm ghost" href="#/blog/${esc(a.slug)}">Aperçu</a>
    ${a.status === 'published' ? `<button class="btn sm ghost" data-bact="${a.id}:unpublish">Dépublier</button>` : `<button class="btn sm" data-bact="${a.id}:publish">Publier</button>`}
    <button class="btn sm ghost" data-bedit="${a.id}">Modifier</button><button class="btn sm ghost" data-bact="${a.id}:trash">Corbeille</button></div></div>`).join('') || '<div class="empty">Aucun article pour l\'instant : touche « Générer un article maintenant ».</div>'}`;
}
async function modBlogEdit(id) {
  const { data } = await sb.rpc('admin_blog', { p_action: 'list' });
  const a = (data || []).find(x => x.id === id); if (!a) return;
  modal(`<form class="form" id="bef"><h2 style="margin:0">Modifier l'article</h2>
  <label class="f">Titre<input id="bet" maxlength="140" value="${esc(a.title)}"></label>
  <label class="f">Chapeau<input id="bee" maxlength="240" value="${esc(a.excerpt || '')}"></label>
  <label class="f">Rubrique<input id="beg" maxlength="30" value="${esc(a.tag || '')}"></label>
  <label class="f">Texte (markdown : ## titre, - liste, **gras**)<textarea id="beb" rows="14">${esc(a.body || '')}</textarea></label>
  <button class="btn">Enregistrer</button></form>`);
  $('#bef').onsubmit = async e => { e.preventDefault();
    const patch = { title: $('#bet').value.trim(), excerpt: $('#bee').value.trim(), tag: $('#beg').value.trim(), body: $('#beb').value };
    const { error } = await sb.rpc('admin_blog', { p_action: 'edit', p_id: id, p_patch: patch });
    close(); toast(error ? errMsg(error) : 'Article enregistré', !!error); if (!error) moderation(); };
}
async function modAct(v) {
  const [id, action] = v.split(':');
  const titles = { remove: 'Retirer ce contenu', suspend: 'Suspendre le membre 7 jours', ban: 'Bannir définitivement ce membre', dismiss: 'Ignorer ce signalement', unsuspend: 'Lever la suspension' };
  const note = await askNote(titles[action] || 'Action de modération');
  if (note === undefined) return;
  const { error } = await sb.rpc('admin_act', { p_report: +id, p_action: action, p_note: note });
  toast(error ? errMsg(error) : 'Action enregistrée', !!error); if (!error) moderation();
}
async function modOffer(v) {
  const i = v.indexOf(':'), id = v.slice(0, i), action = v.slice(i + 1);
  const titles = { release: 'Verser l\'argent au vendeur', refund: 'Rembourser l\'acheteur', reopen: 'Rouvrir la transaction', note: 'Note interne' };
  const note = await askNote(titles[action] || 'Décision');
  if (note === undefined) return;
  const { error } = await sb.rpc('admin_offer_resolve', { p_offer: id, p_action: action, p_note: note });
  toast(error ? errMsg(error) : 'Décision enregistrée', !!error); if (!error) moderation();
}

// ---------- événements ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-set],[data-f],[data-tog],[data-iq],[data-dq],[data-put],[data-l],[data-buy],[data-trade],[data-rmlist],[data-report],[data-act],[data-ot],[data-am],[data-ts],[data-card],[data-close],[data-delpost],[data-scan],[data-express],[data-names],[data-connect],[data-auth],[data-export],[data-delacct],[data-prep],[data-label],[data-dl],[data-paylbl],[data-ordlbl],[data-pickrelay],[data-avk],[data-avh],[data-wish],[data-csv],[data-mt],[data-mst],[data-ract],[data-oact],[data-purge],[data-fs],[data-vote],[data-bgen],[data-bact],[data-bedit],[data-rstat],[data-editpost]');
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
  else if (d.report) { if (needAccount()) return; reportModal(d.report); }
  else if (d.wish) toggleWish(d.wish);
  else if ('csv' in d) csvModal();
  else if (d.mt) { S.mtab = d.mt; moderation(); }
  else if (d.mst) { S.mstatus = d.mst; modReports(); }
  else if (d.ract) modAct(d.ract);
  else if (d.oact) modOffer(d.oact);
  else if ('purge' in d) { const { data, error } = await sb.rpc('admin_purge'); toast(error ? errMsg(error) : 'Purge faite : ' + JSON.stringify(data), !!error); if (!error) moderation(); }
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
  else if (d.delpost) { await sb.from('posts').delete().eq('id', d.delpost); route(); }
  else if (d.editpost) editPost(+d.editpost);
  else if (d.fs) { S.fsec = d.fs; forum(); }
  else if (d.vote) votePost(+d.vote);
  else if ('bgen' in d) { t.disabled = true; t.textContent = 'Écriture en cours…';
    const { data, error } = await sb.functions.invoke('blog/generate');
    toast(error || data?.error ? (data?.error || 'Génération impossible') : `Brouillon prêt : ${data.article.title}`, !!(error || data?.error));
    moderation(); }
  else if (d.bact) { const [id, action] = d.bact.split(':');
    const { error } = await sb.rpc('admin_blog', { p_action: action, p_id: id });
    toast(error ? errMsg(error) : 'C\'est fait', !!error); if (!error) moderation(); }
  else if (d.bedit) modBlogEdit(d.bedit);
  else if (d.rstat) { const { error } = await sb.rpc('admin_reset_stats', { p_user: d.rstat });
    toast(error ? errMsg(error) : 'Trophées et compteurs remis à zéro', !!error); }
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
Game.init({ bump: (k, n) => { sb.rpc('bump', { p_k: k, p_n: n }); } });
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
  const [{ data: p }, { data: col }, { data: ls }, { data: wl }] = await Promise.all([
    sb.from('public_profiles').select('*').eq('id', id).maybeSingle(),
    sb.rpc('public_collection', { p_user: id }),
    sb.from('listings').select('*, card:cards(*)').eq('user_id', id).eq('status', 'active').order('created_at', { ascending: false }).limit(24),
    sb.rpc('public_wishlist', { p_user: id })
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
  ${wl && !wl.private && wl.cards?.length ? `<h2>⭐ Ses cartes recherchées</h2><div class="grid">${wl.cards.map(c => `<div class="tile">${c.image ? `<img class="cimg" loading="lazy" src="${c.image}/low.webp" alt="${esc(c.name)}">` : ''}<div class="meta"><span class="nm">${esc(c.local_id)} · ${esc(c.name)}</span><span class="v">${eur(c.price)}</span></div><div class="seller"><span>${flag(c.lang)} ${esc(c.set || '')}</span>${S.coll[c.card_id] > 1 ? '<span class="pill p-tr">tu l\'as en double</span>' : ''}</div></div>`).join('')}</div>` : ''}
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
