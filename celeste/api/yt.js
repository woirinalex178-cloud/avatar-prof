// Relais vers l'API YouTube Data v3 : la clé reste sur le serveur (variable
// d'environnement YT_API_KEY), jamais dans la page. Un seul réglage pour tous
// les appareils. Lecture seule, et seules les routes listées ici sont ouvertes.
const KEY = process.env.YT_API_KEY || '';
const API = 'https://www.googleapis.com/youtube/v3/';

const PATHS = new Set([
  'videos', 'search', 'channels', 'playlistItems', 'playlists',
  'commentThreads', 'videoCategories'
]);

// Paramètres transmis tels quels ; tout le reste est ignoré.
const PARAMS = new Set([
  'part', 'id', 'q', 'type', 'chart', 'regionCode', 'relevanceLanguage',
  'maxResults', 'order', 'pageToken', 'playlistId', 'videoId', 'forHandle',
  'videoCategoryId', 'videoEmbeddable', 'videoDuration', 'textFormat'
]);

// Empêche l'usage de la clé depuis un autre site (le navigateur envoie Origin
// ou Referer ; un appel direct sans en-tête reste possible, d'où le quota).
function sameSite(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const from = req.headers.origin || req.headers.referer || '';
  if (!from) { return true; }
  try {
    const h = new URL(from).host;
    return h === host || h.startsWith('localhost') || h.startsWith('127.0.0.1');
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.searchParams.get('path') || '';

  if (path === 'health') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, key: !!KEY });
  }

  if (!KEY) {
    return res.status(503).json({
      error: { errors: [{ reason: 'serverKeyMissing' }], message: 'YT_API_KEY absente sur le serveur' }
    });
  }
  if (!PATHS.has(path)) {
    return res.status(400).json({ error: { errors: [{ reason: 'badRequest' }], message: 'route non autorisée' } });
  }
  if (!sameSite(req)) {
    return res.status(403).json({ error: { errors: [{ reason: 'forbidden' }], message: 'origine non autorisée' } });
  }

  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (PARAMS.has(k) && v !== '') { params.set(k, v); }
  }
  params.set('key', KEY);

  try {
    const r = await fetch(API + path + '?' + params, { headers: { Accept: 'application/json' } });
    const body = await r.text();
    // Mise en cache par le CDN : autant d'économisé sur le quota quotidien.
    res.setHeader('Cache-Control', r.ok
      ? 'public, s-maxage=1800, stale-while-revalidate=86400'
      : 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(r.status).send(body);
  } catch (err) {
    return res.status(502).json({
      error: { errors: [{ reason: 'upstreamError' }], message: String(err && err.message || err) }
    });
  }
}
