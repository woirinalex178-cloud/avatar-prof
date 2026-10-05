// Test de bout en bout de la reconnaissance dans un vrai navigateur (Chromium) : 20 cartes au hasard,
// photo simulée (rotation, lumière, marges) -> recog.js doit retrouver la bonne illustration.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('table-des-doubles'), types = { js: 'text/javascript', json: 'application/json', bin: 'application/octet-stream', html: 'text/html' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'text/plain' }); fs.createReadStream(f).pipe(r); }).listen(8799);
const meta = JSON.parse(fs.readFileSync('table-des-doubles/idx/meta.json'));
const cfg = fs.readFileSync('table-des-doubles/config.js', 'utf8'), SB = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], KEY = cfg.match(/SUPABASE_KEY\s*=\s*'([^']+)'/)[1];
const picks = Array.from({ length: 20 }, () => meta.keys[Math.floor(Math.random() * meta.keys.length)]);
const rows = await (await fetch(`${SB}/rest/v1/cards?select=id,image&id=in.(${picks.map(k => `"en:${k}","ja:${k}","fr:${k}"`).join(',')})`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
const img = Object.fromEntries(rows.filter(r => r.image).map(r => [r.id.replace(/^[a-z]{2}:/, ''), `${SB}/functions/v1/img?u=${encodeURIComponent(r.image + '/high.webp')}`]));
const b = await chromium.launch(), pg = await b.newPage(); pg.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
await pg.goto('http://127.0.0.1:8799/recog.js');
const out = await pg.evaluate(async ({ img }) => {
  const R = await import('/recog.js'), t0 = performance.now(); await R.loadRecog(); const load = Math.round(performance.now() - t0), res = [];
  for (const [key, url] of Object.entries(img)) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob()), cv = Object.assign(document.createElement('canvas'), { width: 900, height: 1257 }), x = cv.getContext('2d');
    x.fillStyle = '#3c2d23'; x.fillRect(0, 0, 900, 1257); x.filter = `brightness(${0.8 + Math.random() * 0.35}) blur(0.6px)`;
    x.translate(450, 628); x.rotate((Math.random() - .5) * .08); const k = 0.93 + Math.random() * .07; x.drawImage(bmp, -450 * k, -628 * k, 900 * k, 1257 * k);
    const t = performance.now(), top = await R.recognize(cv, 5);
    res.push({ key, rank: top.findIndex(r => r.key === key), s1: +top[0].score.toFixed(3), s2: +top[1].score.toFixed(3), got: top[0].key, ms: Math.round(performance.now() - t) });
  }
  return { load, res };
}, { img });
const ok = out.res.filter(r => r.rank === 0).length;
console.log(JSON.stringify({ load_ms: out.load, top1: `${ok}/${out.res.length}`, top5: out.res.filter(r => r.rank >= 0).length, res: out.res }, null, 1));
fs.writeFileSync('table-des-doubles/idx/browser-test.json', JSON.stringify(out, null, 1));
await b.close(); srv.close();
