import { createClient } from 'npm:@supabase/supabase-js@2';

// Bordereaux prépayés. Deux fournisseurs :
//  - Boxtal API v3 (clés BOXTAL_KEY + BOXTAL_SECRET ; étiquettes réelles seulement si BOXTAL_LIVE=1)
//  - Test (par défaut) : bordereau PDF d'essai, pour tester tout le parcours
// Routes : /relays?zip= · /create {shipment_id} · /status · /setup (abonnement suivi) · /webhook (suivi transporteur)
const SITE = 'https://table-des-doubles.vercel.app';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const BK = Deno.env.get('BOXTAL_KEY'), BS = Deno.env.get('BOXTAL_SECRET');
const BOXTAL = !!(BK && BS);
// Étiquettes réelles (payantes) seulement si BOXTAL_LIVE=1 : tant que Stripe est en mode test, on reste sur des bordereaux d'essai.
const LIVE = BOXTAL && Deno.env.get('BOXTAL_LIVE') === '1';
const BX = Deno.env.get('BOXTAL_ENV') === 'sandbox' ? 'https://api.boxtal.build' : 'https://api.boxtal.com';

async function me(req: Request) {
  const t = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data } = await db.auth.getUser(t);
  if (!data.user) throw new Error('Non connecté');
  return data.user;
}

type Addr = { name: string; line1: string; line2?: string | null; zip: string; city: string; country: string; phone?: string | null; relay?: { id: string; name: string; address: string } | null };

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
// ---------- Boxtal (API v3) ----------
let tok: { t: string; exp: number } | null = null;
async function bx(method: string, path: string, body?: unknown) {
  if (!tok || tok.exp < Date.now() + 60000) {
    const r = await fetch(`${BX}/iam/account-app/token`, { method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${BK}:${BS}`), Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Boxtal : connexion refusée (${r.status}). Vérifie les clés API.`);
    const j = await r.json(); tok = { t: j.accessToken, exp: Date.now() + j.expiresIn * 1000 };
  }
  const r = await fetch(BX + path, { method, headers: { Authorization: `Bearer ${tok.t}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j: any = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
  if (!r.ok) throw new Error(`Boxtal ${r.status} : ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const offers = async () => { const { data } = await db.from('settings').select('boxtal_relay_offer,boxtal_home_offer').single(); return data!; };
async function points(zip: string, op: 'ARRIVAL' | 'DEPARTURE') {
  const code = (await offers()).boxtal_relay_offer;
  const q = new URLSearchParams({ countryIsoCode: 'FR', postalCode: zip, operationType: op, shippingOfferCode: code });
  const j = await bx('GET', `/shipping/v3.2/parcel-point-by-shipping-offer?${q}`);
  return (j.content ?? []).slice(0, 10).map((n: any) => { const p = n.parcelPoint ?? {}, l = p.location ?? {};
    return { id: p.code, name: p.name, address: [l.number, l.street, l.postalCode, l.city].filter(Boolean).join(' '), distance: n.distanceFromSearchLocation != null ? `${(n.distanceFromSearchLocation / 1000).toFixed(1)} km` : '' }; });
}
const loc = (a: Addr) => { const m = a.line1.trim().match(/^(\d+\s*(?:bis|ter)?)[ ,]+(.*)$/i);
  return { number: m ? m[1] : '', street: m ? m[2] : a.line1, city: a.city, postalCode: a.zip, countryIsoCode: 'FR' }; };
const contact = (a: Addr & { phone?: string }, email: string) => { const [f, ...l] = a.name.trim().split(/\s+/);
  return { firstName: f, lastName: l.join(' ') || f, email, phone: (a.phone || '').replace(/[ .-]/g, '').replace(/^0/, '+33') }; };
const BoxtalProvider = {
  relays: (zip: string) => points(zip, 'ARRIVAL'),
  async create(sh: any, from: Addr & { phone?: string }, to: Addr & { phone?: string }, emails: { from: string; to: string }, value: number) {
    const o = await offers(), relay = sh.mode === 'relay';
    if (!from.phone || !to.phone) throw new Error('Le transporteur demande un numéro de téléphone : à renseigner dans Compte → Mon adresse (expéditeur et destinataire).');
    const drop = relay ? (await points(from.zip, 'DEPARTURE'))[0] : null;
    const req = { labelType: 'PDF_10x15', shippingOfferCode: relay ? o.boxtal_relay_offer : o.boxtal_home_offer, insured: !relay && value >= 50,
      shipment: { externalId: sh.id,
        packages: [{ type: 'PARCEL', weight: 0.1, width: 13, length: 18, height: 2, value: { value: Math.max(1, value), currency: 'EUR' } }],
        fromAddress: { type: 'RESIDENTIAL', contact: contact(from, emails.from), location: loc(from) },
        toAddress: { type: 'RESIDENTIAL', contact: contact(to, emails.to), location: loc(to) },
        ...(relay ? { pickupPointCode: to.relay!.id, ...(drop?.id ? { dropOffPointCode: drop.id } : {}) } : {}) } };
    const c = await bx('POST', '/shipping/v3.1/shipping-order', req);
    const id = c.content?.id; if (!id) throw new Error('Boxtal : commande non créée.');
    let url = '', tracking = '';
    for (let i = 0; i < 6 && !url; i++) { // l'étiquette est générée en quelques secondes
      await new Promise(r => setTimeout(r, 1500));
      try { const d = await bx('GET', `/shipping/v3.1/shipping-order/${id}/shipping-document`); url = (d.content ?? []).find((x: any) => x.type === 'LABEL')?.url ?? ''; } catch { /* pas encore prêt */ }
    }
    try { const t = await bx('GET', `/shipping/v3.1/shipping-order/${id}/tracking`); tracking = t.content?.[0]?.trackingNumber ?? ''; } catch { /* plus tard via webhook */ }
    const pdfBytes = url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null;
    return { tracking, ref: id, pdf: pdfBytes, drop };
  }
};
const relaysP = BOXTAL ? BoxtalProvider.relays : TestProvider.relays; // vrais points relais dès que les clés existent (gratuit)
const hmac = async (key: string, body: string) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))).map(b => b.toString(16).padStart(2, '0')).join(''); };
const WHSECRET = () => hmac(BS ?? '', 'sharing-cards-webhook');
async function cronOk(req: Request) { const t = req.headers.get('x-cron') ?? ''; if (!t) return false; const { data } = await db.rpc('check_cron_token', { t }); return data === true; }
async function markShipped(sh: any, tracking: string) {
  const { data: o } = await db.from('offers').select('seller_id').eq('id', sh.offer_id).single(); const now = new Date().toISOString();
  await db.from('offers').update(o!.seller_id === sh.sender_id ? { seller_shipped: true, seller_tracking: tracking || null, seller_shipped_at: now, updated_at: now } : { buyer_shipped: true, buyer_tracking: tracking || null, buyer_shipped_at: now, updated_at: now }).eq('id', sh.offer_id);
}
const TRK: Record<string, string> = { SHIPPED: 'in_transit', IN_TRANSIT: 'in_transit', OUT_FOR_DELIVERY: 'in_transit', FAILED_ATTEMPT: 'in_transit', REACHED_DELIVERY_PICKUP_POINT: 'delivered', DELIVERED: 'delivered' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url), path = url.pathname.split('/').pop();
  try {
    if (path === 'relays') {
      await me(req);
      const zip = (url.searchParams.get('zip') ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 10);
      if (zip.length < 4) return json({ error: 'Code postal invalide.' }, 400);
      return json({ test: !BOXTAL, relays: await relaysP(zip) });
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
        const { data: o0 } = await db.from('offers').select('cash, listing:listings(card:cards(price_eur))').eq('id', sh.offer_id).single();
        const value = Number(o0?.cash || o0?.listing?.card?.price_eur || 5);
        let r: { tracking: string; ref: string; pdf: Uint8Array | null; drop?: unknown };
        if (LIVE && sh.provider_ref) { // commande déjà passée : on récupère l'étiquette, jamais de 2e achat
          let url = ''; try { const d = await bx('GET', `/shipping/v3.1/shipping-order/${sh.provider_ref}/shipping-document`); url = (d.content ?? []).find((x: any) => x.type === 'LABEL')?.url ?? ''; } catch { /* pas prêt */ }
          let tracking = sh.tracking ?? ''; if (!tracking) try { const t = await bx('GET', `/shipping/v3.1/shipping-order/${sh.provider_ref}/tracking`); tracking = t.content?.[0]?.trackingNumber ?? ''; } catch { /* plus tard */ }
          r = { tracking, ref: sh.provider_ref, pdf: url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null, drop: sh.drop_point };
        } else if (LIVE) { const [{ data: a }, { data: b }] = await Promise.all([db.auth.admin.getUserById(sh.sender_id), db.auth.admin.getUserById(sh.recipient_id)]);
          r = await BoxtalProvider.create(sh, from, to, { from: a.user!.email!, to: b.user!.email! }, value); }
        else r = await TestProvider.create(sh, from, to);
        if (!r.pdf) { await db.from('shipments').update({ provider: 'boxtal', provider_ref: r.ref, tracking: r.tracking || null, drop_point: r.drop ?? null }).eq('id', sh.id);
          return json({ error: 'Bordereau en cours de création chez le transporteur : réessaie dans une minute.' }, 202); }
        const path2 = `${sh.offer_id}/${sh.id}.pdf`;
        const up = await db.storage.from('labels').upload(path2, r.pdf, { contentType: 'application/pdf', upsert: true });
        if (up.error) throw up.error;
        await db.from('shipments').update({ provider: LIVE ? 'boxtal' : 'test', provider_ref: r.ref, drop_point: r.drop ?? null, tracking: r.tracking, label_path: path2, status: 'label_ready',
          events: [{ at: new Date().toISOString(), label: 'Étiquette créée' }] }).eq('id', sh.id);
        await markShipped(sh, r.tracking); // le numéro de suivi est renseigné tout seul dans l'offre
        sh.label_path = path2;
      }
      const { data: s } = await db.storage.from('labels').createSignedUrl(sh.label_path, 600, { download: `bordereau-sharing-cards.pdf` });
      return json({ url: s?.signedUrl, test: !LIVE });
    }
    if (path === 'status') { // diagnostic (jeton cron pour tester les points relais réels)
      const zip = url.searchParams.get('zip');
      return json({ boxtal_keys: BOXTAL, live_labels: LIVE, env: BX, ...(zip && await cronOk(req) ? { relays: await relaysP(zip).catch((e: Error) => e.message) } : {}) });
    }
    if (path === 'setup') { // abonne le site aux événements de suivi Boxtal (appelé une fois, jeton cron)
      if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
      const cb = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shipping/webhook`, secret = await WHSECRET();
      const cur = await bx('GET', '/shipping/v3.1/subscription'); const have = (cur.content ?? []).map((x: any) => x.eventType + x.callbackUrl);
      const out = [];
      for (const ev of ['TRACKING_CHANGED', 'DOCUMENT_CREATED']) if (!have.includes(ev + cb)) out.push((await bx('POST', '/shipping/v3.1/subscription', { eventType: ev, callbackUrl: cb, webhookSecret: secret })).content?.id);
      return json({ created: out });
    }
    if (path === 'webhook') {
      const raw = await req.text();
      if (!BOXTAL || (await hmac(await WHSECRET(), raw)) !== (req.headers.get('x-bxt-signature') ?? '').trim()) return json({ error: 'signature' }, 401);
      const ev = JSON.parse(raw); const { data: sh } = await db.from('shipments').select('*').eq('id', ev.shipmentExternalId).maybeSingle();
      if (!sh) return json({ ok: true });
      if (ev.type === 'TRACKING_CHANGED') for (const t of ev.payload?.trackings ?? []) {
        const st = TRK[t.status] ?? sh.status, evs = [...(sh.events || []), { at: t.trackingDateTime ?? new Date().toISOString(), label: t.message ?? t.status }];
        await db.from('shipments').update({ status: sh.status === 'delivered' ? 'delivered' : st, tracking: t.trackingNumber ?? sh.tracking, events: evs.slice(-30) }).eq('id', sh.id);
      }
      if (ev.type === 'DOCUMENT_CREATED' && !sh.label_path) {
        const url = (ev.payload?.documents ?? []).find((d: any) => d.type === 'LABEL')?.url;
        if (url) { const p = `${sh.offer_id}/${sh.id}.pdf`; await db.storage.from('labels').upload(p, new Uint8Array(await (await fetch(url)).arrayBuffer()), { contentType: 'application/pdf', upsert: true });
          await db.from('shipments').update({ label_path: p, status: 'label_ready' }).eq('id', sh.id); await markShipped(sh, sh.tracking); }
      }
      return json({ ok: true });
    }
    return json({ error: 'route inconnue' }, 404);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
