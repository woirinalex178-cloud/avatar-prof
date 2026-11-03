import { createClient } from 'npm:@supabase/supabase-js@2';

// Import dédié aux cartes chinoises simplifiées de PikaQian.
// Il est volontairement séparé de sync-cards : aucune clé PikaQian ne touche le navigateur.
const API = 'https://api.pikaqian.com/v1';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type PikaSet = {
  id: string; name?: string | null; local_name?: string | null; release_date?: string | null;
  card_count?: { actual?: number | null } | null;
};
type PikaCard = {
  id: string; card_number?: string | null; name?: string | null; local_name?: string | null;
  rarity?: string | null; image_url?: string | null; is_variant?: boolean | null;
};
type ExistingSet = { id: string; code: string; pikaqian_id?: string | null };
type ExistingCard = { id: string; local_id: string; image?: string | null; pikaqian_id?: string | null };

const json = async (path: string, key: string) => {
  const r = await fetch(`${API}${path}`, { headers: { 'X-API-Key': key } });
  if (!r.ok) throw new Error(`PikaQian ${r.status}: ${(await r.text()).slice(0, 220)}`);
  return r.json();
};

async function pages<T>(path: string, key: string): Promise<T[]> {
  const all: T[] = []; let cursor = '';
  do {
    const u = new URL(`${API}${path}`);
    u.searchParams.set('page_size', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const body = await json(`${u.pathname}${u.search}`, key);
    all.push(...(body.data || []));
    cursor = body.pagination?.next_cursor || '';
  } while (cursor);
  return all;
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const safeImage = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' && u.hostname === 'images.pikaqian.com' && /\.(webp|png|jpe?g|avif)$/i.test(u.pathname) ? u.toString() : null;
  } catch { return null; }
};
const chunks = <T>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function existingCards(setId: string) {
  const rows: ExistingCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('cards').select('id,local_id,image,pikaqian_id').eq('set_id', setId).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function grouped<T>(rows: T[], key: (row: T) => string) {
  const out = new Map<string, T[]>();
  for (const row of rows) { const k = key(row); if (k) out.set(k, [...(out.get(k) || []), row]); }
  return out;
}

Deno.serve(async req => {
  // Même un JWT utilisateur ne suffit pas : seul le service role peut lancer
  // une importation. La clé PikaQian n'est donc jamais accessible au navigateur.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return new Response('not found', { status: 404 });
  }

  const apiKey = Deno.env.get('PIKAQIAN_API_KEY');
  if (!apiKey) return Response.json({ error: 'PIKAQIAN_API_KEY absent' }, { status: 503 });

  try {
    const url = new URL(req.url);
    const apply = url.searchParams.get('apply') === '1';
    const existingOnly = url.searchParams.get('existing_only') === '1';
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
    const take = Math.min(12, Math.max(1, Number(url.searchParams.get('take') || '6') || 6));

    const [pikaSets, dbSetsResult] = await Promise.all([
      pages<PikaSet>('/sets', apiKey),
      db.from('sets').select('id,code,pikaqian_id').eq('lang', 'zh-cn'),
    ]);
    if (dbSetsResult.error) throw dbSetsResult.error;
    const dbSets = (dbSetsResult.data || []) as ExistingSet[];
    const knownSets = new Map(dbSets.map(set => [norm(set.code), set]));
    const selected = pikaSets.sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + take);
    const report = { dry_run: !apply, offset, take: selected.length, total_sets: pikaSets.length, next_offset: offset + selected.length < pikaSets.length ? offset + selected.length : null, sets_created: 0, sets_matched: 0, cards_created: 0, cards_updated: 0, cards_kept: 0, cards_ambiguous: 0, cards_without_image: 0, skipped_variants: 0, details: [] as Array<Record<string, unknown>> };

    for (const pikaSet of selected) {
      let target = knownSets.get(norm(pikaSet.id));
      if (!target && existingOnly) { report.details.push({ set: pikaSet.id, skipped: 'set absent du catalogue actuel' }); continue; }

      if (!target) {
        target = { id: `zh-cn:${pikaSet.id}`, code: pikaSet.id, pikaqian_id: pikaSet.id };
        if (apply) {
          const { error } = await db.from('sets').insert({
            id: target.id, lang: 'zh-cn', code: pikaSet.id,
            name: pikaSet.name || pikaSet.local_name || pikaSet.id,
            total: pikaSet.card_count?.actual || 0, card_count: 0,
            released: pikaSet.release_date || null, pikaqian_id: pikaSet.id,
          });
          if (error) throw error;
        }
        knownSets.set(norm(pikaSet.id), target); report.sets_created++;
      } else {
        report.sets_matched++;
        if (apply && !target.pikaqian_id) {
          const { error } = await db.from('sets').update({ pikaqian_id: pikaSet.id }).eq('id', target.id).is('pikaqian_id', null);
          if (error) throw error;
        }
      }

      const [current, pikaCards] = await Promise.all([
        existingCards(target.id),
        pages<PikaCard>(`/cards?set_id=${encodeURIComponent(pikaSet.id)}`, apiKey),
      ]);
      const local = grouped(current, card => norm(card.local_id));
      const remote = grouped(pikaCards.filter(card => !card.is_variant), card => norm(card.card_number) || `id:${card.id}`);
      const creates: Record<string, unknown>[] = [], updates: Array<{ id: string; image: string; pikaqian_id: string }> = [];
      let kept = 0, ambiguous = 0, withoutImage = 0, skippedVariants = pikaCards.filter(card => card.is_variant).length;

      for (const [number, cards] of remote) {
        if (cards.length !== 1) { ambiguous++; continue; }
        const source = cards[0], image = safeImage(source.image_url), matches = local.get(number) || [];
        if (!image) withoutImage++;
        if (matches.length > 1) { ambiguous++; continue; }
        if (matches.length === 1) {
          const targetCard = matches[0];
          if (!targetCard.image && image) updates.push({ id: targetCard.id, image, pikaqian_id: source.id });
          else kept++;
          continue;
        }
        creates.push({
          id: `${target.id}:pika:${source.id}`, set_id: target.id, lang: 'zh-cn', tcg_id: `pika:${source.id}`,
          local_id: source.card_number || source.id, num: /^\d+$/.test(source.card_number || '') ? Number(source.card_number) : null,
          name: source.name || source.local_name || source.card_number || source.id,
          rarity: source.rarity || null, image, pikaqian_id: source.id,
          price_eur: null, price_updated: null,
        });
      }

      if (apply) {
        for (const rows of chunks(creates, 250)) {
          if (!rows.length) continue;
          const { error } = await db.from('cards').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
          if (error) throw error;
        }
        for (const group of chunks(updates, 20)) await Promise.all(group.map(async row => {
          const { error } = await db.from('cards').update({ image: row.image, pikaqian_id: row.pikaqian_id }).eq('id', row.id).is('image', null);
          if (error) throw error;
        }));
        const { error } = await db.from('sets').update({ card_count: current.length + creates.length }).eq('id', target.id);
        if (error) throw error;
      }
      report.cards_created += creates.length; report.cards_updated += updates.length; report.cards_kept += kept;
      report.cards_ambiguous += ambiguous; report.cards_without_image += withoutImage; report.skipped_variants += skippedVariants;
      report.details.push({ set: pikaSet.id, set_id: target.id, existing: current.length, remote_base: remote.size, create: creates.length, update: updates.length, kept, ambiguous, without_image: withoutImage, skipped_variants: skippedVariants });
    }
    return Response.json(report);
  } catch (error) {
    console.error(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});
