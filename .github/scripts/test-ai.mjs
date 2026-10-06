// Test de l'IA d'identification sur de vraies images de cartes (dont 2 françaises), comme une photo envoyée par l'appli.
const SB = 'https://zfnjljfmhlnctlidtvqm.supabase.co';
const ids = ['fr/sv/sv03.5/199', 'fr/swsh/swsh7/215', 'en/base/base1/4', 'en/sm/sm12/236', 'ja/SV/SV2a/201', 'de/xy/xy1/146'];
for (const id of ids) {
  const img = Buffer.from(await (await fetch(`https://assets.tcgdex.net/${id}/high.jpg`)).arrayBuffer()).toString('base64');
  const t = Date.now(), r = await fetch(`${SB}/functions/v1/identify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: img }) });
  const j = await r.json();
  console.log(JSON.stringify({ id, status: r.status, ms: Date.now() - t, model: j.model, read: j.read && { n: j.read.name, num: j.read.number, tot: j.read.total, lang: j.read.language, set: j.read.set_name_en }, top: (j.cards || []).slice(0, 2).map(c => `${c.id} ${c.score}`), err: j.error }));
  await new Promise(r => setTimeout(r, 4000));
}
