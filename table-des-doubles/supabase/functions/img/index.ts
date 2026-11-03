// Relais d'images officielles pour les comparaisons pixel par pixel côté navigateur.
// Liste fermée : TCGdex et le CDN public PikaQian, jamais un proxy ouvert.
const allowed = [
  /^https:\/\/assets\.tcgdex\.net\/[\w\-./]+\.(?:webp|png|jpe?g)$/i,
  /^https:\/\/images\.pikaqian\.com\/[\w\-./]+\.(?:webp|png|jpe?g|avif)$/i,
];

Deno.serve(async (req) => {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  if (!allowed.some(pattern => pattern.test(u))) return new Response('refusé', { status: 400 });
  const r = await fetch(u);
  if (!r.ok) return new Response('introuvable', { status: 404 });
  return new Response(r.body, {
    headers: {
      'Content-Type': r.headers.get('Content-Type') ?? 'image/webp',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=604800',
    },
  });
});
