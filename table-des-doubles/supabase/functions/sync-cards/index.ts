import { createClient } from 'npm:@supabase/supabase-js@2';

// Catalogue multi-langues + cotes depuis TCGdex (base MIT).
// Cotes : TCGdex relaie deux marchés, Cardmarket (Europe, en euros) et TCGplayer (États-Unis, en dollars).
// On garde les valeurs brutes des deux et on note laquelle sert de cote affichée (`price_basis`).
// Les cartes japonaises ont leur propre fiche Cardmarket : elles sont cotées à part, comme les anglaises.
const API = 'https://api.tcgdex.net/v2';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ja', 'zh-cn', 'zh-tw'];
const NEW_LANGS = ['zh-cn', 'zh-tw'];
const PRICED = ['en', 'ja']; // langues dont on lit la fiche carte par carte
const PRIO: Record<string, number> = { en: 0, fr: 1, ja: 2, 'zh-cn': 2, 'zh-tw': 3 };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};

// Taux du jour dollar -> euro (Banque centrale européenne). En cas de panne : 0,90.
let usdEur = 0;
async function rate() {
  if (usdEur) return usdEur;
  try { usdEur = (await json('https://api.frankfurter.app/latest?from=USD&to=EUR')).rates.EUR; } catch { usdEur = 0.9; }
  return usdEur;
}
const pos = (v: unknown) => typeof v === 'number' && v > 0 ? v : null;
const r2 = (v: number | null) => v == null ? null : Math.round(v * 100) / 100;

// Une carte qui n'existe qu'en holo est vendue au prix « holo » : c'était la cause de cotes trop basses.
function quote(card: any, fx: number) {
  const cm = card.pricing?.cardmarket ?? {}, tp = card.pricing?.tcgplayer ?? {}, v = card.variants ?? {};
  const holoOnly = v.normal === false && (v.holo || v.reverse);
  const pick = (k: string) => holoOnly ? (pos(cm[`${k}-holo`]) ?? pos(cm[k])) : (pos(cm[k]) ?? pos(cm[`${k}-holo`]));
  const trend = pick('trend'), avg30 = pick('avg30'), avg7 = pick('avg7'), avg = pick('avg'), low = pick('low');
  const t = holoOnly ? (tp.holofoil ?? tp['reverse-holofoil'] ?? tp.normal) : (tp.normal ?? tp.holofoil ?? tp['reverse-holofoil']);
  const usd = pos(t?.marketPrice) ?? pos(t?.midPrice), alt = usd != null ? r2(usd * fx) : null;
  // La tendance réagit vite mais s'emballe sur une seule vente : si elle s'écarte de plus du double
  // de la moyenne 30 jours, on retient la moyenne 30 jours, plus stable.
  let eur = trend, basis = 'trend';
  if (trend != null && avg30 != null && (trend > avg30 * 2 || trend < avg30 / 2)) { eur = avg30; basis = 'avg30'; }
  if (eur == null) { eur = avg30; basis = 'avg30'; }
  if (eur == null) { eur = avg7; basis = 'avg7'; }
  if (eur == null) { eur = avg; basis = 'avg'; }
  if (eur == null) { eur = alt; basis = 'tcgplayer'; }
  // numéro du produit chez TCGplayer : sert de visuel de dernier recours quand aucune autre source n'en a
  const tpId = t?.productId ?? card.variants_detailed?.find((x: any) => x.thirdParty?.tcgplayer)?.thirdParty.tcgplayer ?? null;
  return { eur: r2(eur), basis: eur == null ? null : basis + (holoOnly && basis !== 'tcgplayer' ? '-holo' : ''), trend, avg30, avg7, low, usd, alt, tp: tpId != null ? String(tpId) : null };
}

async function plan(langs = LANGS) {
  const imported: Record<string, number> = {};
  for (const lang of langs) {
    const sets: any[] = await json(`${API}/${lang}/sets`);
    const setRows = sets.map((set, sort) => ({
      id: `${lang}:${set.id}`, lang, code: set.id, name: set.name,
      logo: set.logo ?? null, symbol: set.symbol ?? null,
      total: set.cardCount?.official || set.cardCount?.total || 0, sort,
    }));
    const setsResult = await db.from('sets').upsert(setRows, { ignoreDuplicates: true });
    if (setsResult.error) throw setsResult.error;
    const queueResult = await db.from('sync_queue').upsert(
      sets.map(set => ({ lang, set_code: set.id, prio: PRIO[lang] ?? 3, status: 'pending' })),
      { ignoreDuplicates: true },
    );
    if (queueResult.error) throw queueResult.error;
    imported[lang] = sets.length;
  }
  return imported;
}

async function ensureChineseCatalogs() {
  const missing: string[] = [];
  for (const lang of NEW_LANGS) {
    const { count, error } = await db.from('sets').select('id', { count: 'exact', head: true }).eq('lang', lang);
    if (error) throw error;
    if (!count) missing.push(lang);
  }
  return missing.length ? plan(missing) : {};
}

// Noms coréens des séries (TCGdex les liste, sans leurs cartes) puis catalogue coréen calqué sur le japonais.
async function korean() {
  try {
    const sets: any[] = await json(`${API}/ko/sets`);
    await db.from('ko_set_names').upsert(sets.map(s => ({ code: s.id, name: s.name })));
  } catch (e) { console.error('ko', (e as Error).message); }
  const { data, error } = await db.rpc('ko_mirror');
  if (error) throw error;
  return data;
}

async function processSet(lang: string, code: string) {
  const setId = `${lang}:${code}`;
  const set = await json(`${API}/${lang}/sets/${encodeURIComponent(code)}`);
  if (set.serie?.id === 'tcgp') {
    await db.from('sets').delete().eq('id', setId);
    return 'skip tcgp';
  }
  const cards: any[] = set.cards ?? [];
  // Structure seule : on ne touche ni aux cotes ni aux visuels déjà trouvés ailleurs.
  const rows: any[] = cards.map(card => ({
    id: `${lang}:${card.id}`, lang, tcg_id: card.id, set_id: setId,
    local_id: card.localId, num: parseInt(card.localId, 10) || null, name: card.name,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const result = await db.from('cards').upsert(rows.slice(i, i + 500));
    if (result.error) throw result.error;
  }
  const basics = cards.filter(c => c.image).map(c => ({ id: `${lang}:${c.id}`, image: c.image }));

  let priced = 0;
  if (PRICED.includes(lang)) {
    const fx = await rate(), out: any[] = [];
    for (let i = 0; i < cards.length; i += 16) {
      await Promise.all(cards.slice(i, i + 16).map(async c => {
        try {
          const card = await json(`${API}/${lang}/cards/${encodeURIComponent(c.id)}`);
          out.push({ id: `${lang}:${c.id}`, rarity: card.rarity ?? null, image: card.image ?? c.image ?? null, ...quote(card, fx) });
        } catch { out.push({ id: `${lang}:${c.id}`, image: c.image ?? null }); }
      }));
    }
    for (let i = 0; i < out.length; i += 400) {
      const { data, error } = await db.rpc('price_apply', { p: out.slice(i, i + 400) });
      if (error) throw error;
      priced += data ?? 0;
    }
  } else if (basics.length) {
    const { error } = await db.rpc('price_apply', { p: basics });
    if (error) throw error;
  }

  const setResult = await db.from('sets').update({
    serie_id: set.serie?.id ?? null, serie_name: set.serie?.name ?? null,
    released: set.releaseDate || null, logo: set.logo ?? null, symbol: set.symbol ?? null,
    total: set.cardCount?.official || set.cardCount?.total || rows.length, card_count: rows.length,
  }).eq('id', setId);
  if (setResult.error) throw setResult.error;
  if (lang === 'en') await db.rpc('copy_en_set', { p_code: code });
  else if (lang !== 'ja') await db.rpc('copy_intl', { p_set: setId });
  return `${rows.length} cartes${PRICED.includes(lang) ? `, ${priced} cotées` : ''}`;
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (url.searchParams.get('plan')) return Response.json(await plan());
  if (url.searchParams.get('ko')) return Response.json({ ko: await korean() });

  const planned = await ensureChineseCatalogs();
  const started = Date.now(), done: string[] = [];
  while (Date.now() - started < 100_000) {
    const { data } = await db.rpc('claim_sync');
    const item = data?.[0];
    if (!item) break;
    try {
      const info = await processSet(item.lang, item.set_code);
      await db.from('sync_queue').update({ status: 'done', info, updated_at: new Date().toISOString() })
        .match({ lang: item.lang, set_code: item.set_code });
      done.push(`${item.lang}:${item.set_code}`);
    } catch (error) {
      await db.from('sync_queue').update({
        status: item.tries >= 3 ? 'error' : 'pending', info: String(error).slice(0, 300), updated_at: new Date().toISOString(),
      }).match({ lang: item.lang, set_code: item.set_code });
    }
  }
  return Response.json({ planned, done });
});
