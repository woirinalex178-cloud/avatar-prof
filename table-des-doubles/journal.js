// Le journal du site : liste des articles et lecture d'un article.
// Les articles sont écrits par « La Gazette » (fonction Edge `blog`) à partir des données réelles
// du catalogue, puis publiés après validation. Ici, on ne fait que les afficher.

// Markdown minimal, volontairement limité à ce que la Gazette produit :
// titres ## et ###, listes à puces, **gras**, _italique_, images ![alt](url), liens [texte](url).
export function md(src, esc) {
  const lignes = String(src || '').split('\n');
  const out = [];
  let liste = false, para = [];
  const fermerPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), esc)}</p>`); para = []; } };
  const fermerListe = () => { if (liste) { out.push('</ul>'); liste = false; } };
  for (const l of lignes) {
    const t = l.trim();
    if (!t) { fermerPara(); fermerListe(); continue; }
    const img = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (img) {
      fermerPara(); fermerListe();
      out.push(`<figure class="jr-fig"><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy" decoding="async">${img[1] ? `<figcaption>${inline(img[1], esc)}</figcaption>` : ''}</figure>`);
      continue;
    }
    if (t.startsWith('### ')) { fermerPara(); fermerListe(); out.push(`<h3>${inline(t.slice(4), esc)}</h3>`); continue; }
    if (t.startsWith('## ')) { fermerPara(); fermerListe(); out.push(`<h2>${inline(t.slice(3), esc)}</h2>`); continue; }
    if (t.startsWith('- ')) { fermerPara(); if (!liste) { out.push('<ul>'); liste = true; } out.push(`<li>${inline(t.slice(2), esc)}</li>`); continue; }
    fermerListe(); para.push(t);
  }
  fermerPara(); fermerListe();
  return out.join('\n');
}

// Le gras et l'italique sont appliqués APRÈS l'échappement : le texte reste sûr.
function inline(s, esc) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>');
}

const dateFr = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const lecture = body => Math.max(1, Math.round(String(body || '').split(/\s+/).length / 200));

export function renderJournalList(arts, esc) {
  if (!arts.length) return `<div class="empty">Le journal arrive bientôt. <a href="#/forum">Passe par le forum</a> en attendant.</div>`;
  const [une, ...suite] = arts;
  const carte = a => `<a class="jr-card" href="#/journal/${esc(a.slug)}">
    ${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy" decoding="async">` : '<span class="jr-nocover" aria-hidden="true">🃏</span>'}
    <span class="jr-body"><span class="jr-tag">${esc(a.tag || 'Journal')}</span>
      <b>${esc(a.title)}</b>
      <span class="small mut">${esc(a.excerpt || '')}</span>
      <span class="small mut jr-meta">${dateFr(a.published_at || a.created_at)} · ${lecture(a.body)} min de lecture</span></span></a>`;

  return `<section class="binder-intro"><div><span class="binder-eyebrow">LE JOURNAL DES COLLECTIONNEURS</span>
    <h1>Le journal</h1><p class="mut">Les cotes qui bougent, les nouvelles extensions, et les conseils qui évitent les mauvaises surprises. Écrit à partir des données réelles du catalogue.</p></div></section>
  <a class="jr-une" href="#/journal/${esc(une.slug)}">
    ${une.cover ? `<img src="${esc(une.cover)}" alt="" loading="lazy" decoding="async">` : ''}
    <div><span class="jr-tag">${esc(une.tag || 'Journal')}</span><h2>${esc(une.title)}</h2>
      <p>${esc(une.excerpt || '')}</p>
      <p class="small mut">${dateFr(une.published_at || une.created_at)} · ${lecture(une.body)} min de lecture</p></div></a>
  ${suite.length ? `<div class="jr-grid">${suite.map(carte).join('')}</div>` : ''}`;
}

export function renderArticle(a, esc, fil) {
  return `<article class="jr-article">
    <p class="small"><a href="#/journal">← Tous les articles</a></p>
    <span class="jr-tag">${esc(a.tag || 'Journal')}</span>
    <h1>${esc(a.title)}</h1>
    <p class="mut">${dateFr(a.published_at || a.created_at)} · ${lecture(a.body)} min de lecture · par La Gazette</p>
    ${a.cover ? `<figure class="jr-fig jr-cover"><img src="${esc(a.cover)}" alt="" decoding="async"></figure>` : ''}
    ${a.excerpt ? `<p class="jr-chapo">${esc(a.excerpt)}</p>` : ''}
    <div class="jr-texte">${md(a.body, esc)}</div>
    <div class="panel jr-fin">
      <h3 style="margin-top:0">On en parle ?</h3>
      <p class="small mut">${fil ? 'Un fil est ouvert sur le forum pour cet article.' : 'Le forum est l\'endroit pour en discuter avec les autres collectionneurs.'}</p>
      <div class="seg"><a class="btn" href="#/forum">💬 Rejoindre la discussion</a><a class="btn ghost" href="#/table">Voir la table</a></div>
    </div>
  </article>`;
}
