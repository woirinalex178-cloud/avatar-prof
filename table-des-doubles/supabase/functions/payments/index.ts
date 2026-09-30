import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Paiements sécurisés (Stripe Connect, fonds bloqués par Stripe jusqu'à réception)
// /checkout : l'acheteur paie (carte + frais protection + port éventuel) -> argent sur le compte plateforme Stripe
// /label    : un membre paie l'étiquette de son envoi (échanges)
// /connect  : le vendeur ouvre son compte vendeur (identité vérifiée par Stripe, 18+)
// /webhook  : Stripe confirme paiement (destination « Votre compte ») / compte vendeur (destination « Comptes connectés »)
// /release  : (pg_cron toutes les 15 min) verse la part vendeur quand la transaction est terminée
const SITE = 'https://table-des-doubles.vercel.app';
const key = Deno.env.get('STRIPE_SECRET_KEY');
const stripe = key ? new Stripe(key, { apiVersion: '2024-06-20' }) : null;
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const MODES: Record<string, string> = { relay: 'Livraison en point relais', home: 'Livraison Colissimo à domicile' };

async function me(req: Request) {
  const t = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data } = await db.auth.getUser(t);
  if (!data.user) throw new Error('Non connecté');
  return data.user;
}

// Une clé de signature par destination Stripe : on essaie les deux
async function verifyEvent(body: string, sig: string) {
  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT')].filter(Boolean) as string[];
  for (const s of secrets) { try { return await stripe!.webhooks.constructEventAsync(body, sig, s); } catch { /* clé suivante */ } }
  throw new Error('Signature Stripe invalide');
}

// Jeton de la tâche planifiée : stocké en base (schéma privé) ou secret CRON_SECRET
async function cronOk(req: Request) {
  const t = req.headers.get('x-cron') ?? '';
  if (!t) return false;
  if (Deno.env.get('CRON_SECRET') && t === Deno.env.get('CRON_SECRET')) return true;
  const { data } = await db.rpc('check_cron_token', { t });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const path = new URL(req.url).pathname.split('/').pop();
  if (!stripe) return json({ error: 'Paiements pas encore activés (clé Stripe manquante).' }, 503);
  try {
    if (path === 'checkout') {
      const u = await me(req); const { offer_id } = await req.json();
      const { data: o } = await db.from('offers').select('*, listing:listings(card:cards(name))').eq('id', offer_id).single();
      if (!o || o.buyer_id !== u.id || o.status !== 'accepted') return json({ error: 'Offre non payable.' }, 400);
      const { data: seller } = await db.from('profiles').select('stripe_account_id,payouts_enabled').eq('id', o.seller_id).single();
      if (!seller?.payouts_enabled) return json({ error: 'Le vendeur n\'a pas encore activé son compte vendeur (Compte → Activer mes ventes).' }, 400);
      const items = [
        { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(o.cash * 100), product_data: { name: o.listing.card.name } } },
        { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(o.fee * 100), product_data: { name: 'Protection acheteur' } } }
      ];
      if (o.ship_price > 0) items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(o.ship_price * 100), product_data: { name: MODES[o.ship_mode] ?? 'Livraison' } } });
      const s = await stripe.checkout.sessions.create({
        mode: 'payment', locale: 'fr', customer_email: u.email, line_items: items,
        payment_intent_data: { transfer_group: o.id, metadata: { offer_id: o.id } },
        metadata: { offer_id: o.id },
        success_url: `${SITE}/#/offres`, cancel_url: `${SITE}/#/offres`
      });
      await db.from('offers').update({ stripe_session_id: s.id }).eq('id', o.id);
      return json({ url: s.url });
    }
    if (path === 'label') {
      const u = await me(req); const { shipment_id } = await req.json();
      const { data: sh } = await db.from('shipments').select('*').eq('id', shipment_id).single();
      if (!sh || sh.sender_id !== u.id) return json({ error: 'Colis introuvable.' }, 404);
      if (sh.paid) return json({ paid: true });
      const s = await stripe.checkout.sessions.create({
        mode: 'payment', locale: 'fr', customer_email: u.email,
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(sh.price * 100), product_data: { name: `Bordereau prépayé — ${MODES[sh.mode]}` } } }],
        metadata: { shipment_id: sh.id },
        success_url: `${SITE}/#/offres`, cancel_url: `${SITE}/#/offres`
      });
      await db.from('shipments').update({ stripe_session_id: s.id }).eq('id', sh.id);
      return json({ url: s.url });
    }
    if (path === 'connect') {
      const u = await me(req);
      const { data: p } = await db.from('profiles').select('stripe_account_id').eq('id', u.id).single();
      let acct = p?.stripe_account_id;
      if (!acct) {
        const a = await stripe.accounts.create({ type: 'express', country: 'FR', email: u.email, capabilities: { transfers: { requested: true } }, business_type: 'individual', metadata: { user_id: u.id } });
        acct = a.id; await db.from('profiles').update({ stripe_account_id: acct }).eq('id', u.id);
      }
      const link = await stripe.accountLinks.create({ account: acct, type: 'account_onboarding', refresh_url: `${SITE}/#/compte`, return_url: `${SITE}/#/compte` });
      return json({ url: link.url });
    }
    if (path === 'webhook') {
      const ev = await verifyEvent(await req.text(), req.headers.get('stripe-signature') ?? '');
      if (ev.type === 'checkout.session.completed') {
        const s = ev.data.object as Stripe.Checkout.Session;
        if (s.metadata?.shipment_id) await db.from('shipments').update({ paid: true }).eq('id', s.metadata.shipment_id).eq('stripe_session_id', s.id);
        else await db.from('offers').update({ status: 'paid', paid_amount: (s.amount_total ?? 0) / 100, stripe_payment_intent: String(s.payment_intent), updated_at: new Date().toISOString() })
          .eq('id', s.metadata!.offer_id).eq('status', 'accepted');
      }
      if (ev.type === 'account.updated') {
        const a = ev.data.object as Stripe.Account;
        await db.from('profiles').update({ payouts_enabled: !!a.payouts_enabled }).eq('stripe_account_id', a.id);
      }
      return json({ ok: true });
    }
    if (path === 'release') {
      if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
      const { data: os } = await db.from('offers').select('id,cash,seller_id,stripe_payment_intent').eq('status', 'completed').eq('released', false).not('stripe_payment_intent', 'is', null).limit(50);
      let n = 0;
      for (const o of os ?? []) {
        const { data: s } = await db.from('profiles').select('stripe_account_id').eq('id', o.seller_id).single();
        if (!s?.stripe_account_id) continue;
        const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent);
        await stripe.transfers.create({ amount: Math.round(o.cash * 100), currency: 'eur', destination: s.stripe_account_id, transfer_group: o.id, source_transaction: String(pi.latest_charge) });
        await db.from('offers').update({ released: true }).eq('id', o.id); n++;
      }
      return json({ released: n });
    }
    return json({ error: 'route inconnue' }, 404);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
