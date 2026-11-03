import { createClient } from 'npm:@supabase/supabase-js@2';

// Catalogue multi-langues + cotes Cardmarket depuis TCGdex (base MIT).
const API = 'https://api.tcgdex.net/v2';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ja', 'zh-cn', 'zh-tw'];
const NEW_LANGS = ['zh-cn', 'zh-tw'];
const PRIO: Record<string, number> = { en: 0, fr: 1, ja: 2, 'zh-cn': 2, 'zh-tw': 3 };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};

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

// Existing installations predate Chinese language support. Plan these two lines
// once, automatically, without re-running every language every minute.
async function ensureChineseCatalogs() {
  const missing: string[] = [];
  for (const lang of NEW_LANGS) {
    const { count, error } = await db.from('sets').select('id', { count: 'exact', head: true }).eq('lang', lang);
    if (error) throw error;
    if (!count) missing.push(lang);
  }
  return missing.length ? plan(missing) : {};
}

async function processSet(lang: string, code: string) {
  const setId = `${lang}:${code}`;
  const set = await json(`${API}/${lang}/sets/${encodeURIComponent(code)}`);
  if (set.serie?.id === 'tcgp') {
    await db.from('sets').delete().eq('id', setId);
    return 'skip tcgp';
  }
  const cards: any[] = set.cards ?? [];
  const rows: any[] = cards.map(card => ({
    id: `${lang}:${card.id}`, lang, tcg_id: card.id, set_id: setId,
    local_id: card.localId, num: parseInt(card.localId, 10) || null,
    name: card.name, image: card.image ?? null, rarity: null,
    price_eur: null, price_updated: null,
  }));

  if (lang === 'en') {
    for (let i = 0; i < rows.length; i += 16) {
      await Promise.all(rows.slice(i, i + 16).map(async row => {
        try {
          const card = await json(`${API}/en/cards/${encodeURIComponent(row.tcg_id)}`);
          row.rarity = card.rarity ?? null;
          row.image ??= card.image ?? null;
          const cm = card.pricing?.cardmarket ?? {}, tp = card.pricing?.tcgplayer ?? {};
          const usd = tp.holofoil?.marketPrice ?? tp.normal?.marketPrice ?? tp.reverseHolofoil?.marketPrice ?? null;
          const price = cm.trend ?? cm.avg ?? cm.avg30 ?? (usd != null ? Math.round(usd * 90) / 100 : null);
          if (price != null) { row.price_eur = price; row.price_updated = new Date().toISOString(); }
        } catch { /* Carte sans détail exploitable. */ }
      }));
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const result = await db.from('cards').upsert(rows.slice(i, i + 500));
    if (result.error) throw result.error;
  }
  const setResult = await db.from('sets').update({
    serie_id: set.serie?.id ?? null, serie_name: set.serie?.name ?? null,
    released: set.releaseDate || null, logo: set.logo ?? null, symbol: set.symbol ?? null,
    total: set.cardCount?.official || set.cardCount?.total || rows.length, card_count: rows.length,
  }).eq('id', setId);
  if (setResult.error) throw setResult.error;
  if (lang === 'en') await db.rpc('copy_en_set', { p_code: code });
  else await db.rpc('copy_intl', { p_set: setId });
  return `${rows.length} cartes`;
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (url.searchParams.get('plan')) return Response.json(await plan());

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
