import { createClient } from 'npm:@supabase/supabase-js@2';

// Bordereaux prépayés. Deux fournisseurs :
//  - Boxtal (actif quand BOXTAL_KEY + BOXTAL_SECRET sont dans les secrets) — à brancher avec la doc de l'API du compte
//  - Test (par défaut) : bordereau PDF d'essai + points relais fictifs, pour tester tout le parcours
// Routes : /relays?zip= · /create {shipment_id} · /label {shipment_id} · /webhook (suivi transporteur)
const SITE = 'https://table-des-doubles.vercel.app';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const BOXTAL = !!(Deno.env.get('BOXTAL_KEY') && Deno.env.get('BOXTAL_SECRET'));

async function me(req: Request) {
  const t = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data } = await db.auth.getUser(t);
  if (!data.user) throw new Error('Non connecté');
  return data.user;
}

type Addr = { name: string; line1: string; line2?: string | null; zip: string; city: string; country: string; relay?: { id: string; name: string; address: string } | null };

// ---------- fournisseur de test ----------
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
function pdf(lines: [number, number, number, string][], bars: string): Uint8Array {
  // A6 paysage : 420 x 298 pt
  let c = 'q 2 w 12 12 396 274 re S Q\n';
  let x = 30; for (const b of bars) { const w = b === '1' ? 2.2 : 1; if (b !== '0') c += `${x} 40 ${w} 42 re f\n`; x += 2.6; }
  for (const [px, py, sz, t] of lines) c += `BT /F1 ${sz} Tf ${px} ${py} Td (${ascii(t)}) Tj ET\n`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 298] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  ];
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
const TestProvider = {
  relays(zip: string) {
    const n = ['Tabac Presse du Centre', 'Superette des Halles', 'Librairie de la Gare', 'Pressing du Marche', 'Fleuriste Les Lilas', 'Cordonnerie Express', 'Relais Casino', 'Bureau Vallee', 'Tabac Le Balto', 'Epicerie Fine'];
    return n.map((name, i) => ({ id: `TEST-${zip}-${i + 1}`, name: `${name} (TEST)`, address: `${10 + i * 7} rue de l'Exemple, ${zip}`, distance: `${(0.3 + i * 0.4).toFixed(1)} km` }));
  },
  async create(sh: Record<string, unknown>, from: Addr, to: Addr) {
    const tracking = 'TEST' + crypto.randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase();
    const bars = Array.from(tracking).map(ch => ch.charCodeAt(0).toString(2).padStart(7, '0')).join('0');
    const dest = sh.mode === 'relay' && to.relay ? [`POINT RELAIS : ${to.relay.name}`, to.relay.address, `A l'attention de ${to.name}`] : [to.name, to.line1, to.line2 || '', `${to.zip} ${to.city}`, to.country];
    const lines: [number, number, number, string][] = [
      [24, 268, 9, `BORDEREAU D'ESSAI - NE PAS UTILISER - ${sh.mode === 'relay' ? 'Point relais' : 'Colissimo domicile'}`],
      [24, 248, 8, `Expediteur : ${from.name}, ${from.line1}, ${from.zip} ${from.city}`],
      [24, 222, 10, 'DESTINATAIRE'],
      ...dest.filter(Boolean).map((t, i) => [24, 204 - i * 17, 14, t] as [number, number, number, string]),
      [30, 26, 11, tracking], [260, 26, 8, 'Sharing Cards - NE PAS PLIER']
    ];
    return { tracking, ref: 'test-' + tracking, pdf: pdf(lines, bars) };
  }
};
// Fournisseur réel : branché quand le compte Boxtal existe (devis, commande, étiquette, suivi)
const BoxtalProvider = {
  relays(_zip: string) { throw new Error('Boxtal : connexion à finaliser avec les clés du compte.'); },
  create(): never { throw new Error('Boxtal : connexion à finaliser avec les clés du compte.'); }
};
const P = BOXTAL ? BoxtalProvider : TestProvider;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url), path = url.pathname.split('/').pop();
  try {
    if (path === 'relays') {
      await me(req);
      const zip = (url.searchParams.get('zip') ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 10);
      if (zip.length < 4) return json({ error: 'Code postal invalide.' }, 400);
      return json({ test: !BOXTAL, relays: await P.relays(zip) });
    }
    if (path === 'create' || path === 'label') {
      const u = await me(req); const { shipment_id } = await req.json();
      const { data: sh } = await db.from('shipments').select('*').eq('id', shipment_id).single();
      if (!sh || sh.sender_id !== u.id) return json({ error: 'Colis introuvable.' }, 404);
      if (!sh.paid) return json({ error: 'Étiquette pas encore payée.' }, 400);
      if (!sh.label_path) {
        const [{ data: from }, { data: to }] = await Promise.all([
          db.from('addresses').select('*').eq('user_id', sh.sender_id).maybeSingle(),
          db.from('addresses').select('*').eq('user_id', sh.recipient_id).maybeSingle()]);
        if (!from) return json({ error: 'Renseigne d\'abord ton adresse (Compte → Mon adresse).' }, 400);
        if (!to) return json({ error: 'Le destinataire n\'a pas encore renseigné son adresse. Préviens-le dans la messagerie de l\'offre.' }, 400);
        if (sh.mode === 'relay' && !to.relay) return json({ error: 'Le destinataire n\'a pas encore choisi son point relais (Compte → Mon adresse).' }, 400);
        const r = await P.create(sh, from, to);
        const path2 = `${sh.offer_id}/${sh.id}.pdf`;
        const up = await db.storage.from('labels').upload(path2, r.pdf, { contentType: 'application/pdf', upsert: true });
        if (up.error) throw up.error;
        await db.from('shipments').update({ provider: BOXTAL ? 'boxtal' : 'test', provider_ref: r.ref, tracking: r.tracking, label_path: path2, status: 'label_ready',
          events: [{ at: new Date().toISOString(), label: 'Étiquette créée' }] }).eq('id', sh.id);
        // le numéro de suivi est renseigné tout seul dans l'offre
        const { data: o } = await db.from('offers').select('seller_id').eq('id', sh.offer_id).single();
        const now = new Date().toISOString();
        await db.from('offers').update(o!.seller_id === sh.sender_id ? { seller_shipped: true, seller_tracking: r.tracking, seller_shipped_at: now, updated_at: now } : { buyer_shipped: true, buyer_tracking: r.tracking, buyer_shipped_at: now, updated_at: now }).eq('id', sh.offer_id);
        sh.label_path = path2;
      }
      const { data: s } = await db.storage.from('labels').createSignedUrl(sh.label_path, 600, { download: `bordereau-sharing-cards.pdf` });
      return json({ url: s?.signedUrl, test: sh.provider !== 'boxtal' });
    }
    if (path === 'webhook') return json({ ok: true }); // suivi Boxtal : à brancher avec le compte
    return json({ error: 'route inconnue' }, 404);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
