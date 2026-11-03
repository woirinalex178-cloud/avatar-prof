// TCGdex stocke une URL de base à laquelle on ajoute /low.webp ou /high.webp.
// PikaQian fournit déjà l'URL complète du scan : ne jamais lui ajouter un suffixe.
export function cardImageUrl(card, size = 'low') {
  const url = typeof card === 'string' ? card : card?.image;
  if (!url) return null;
  return /\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url) ? url : `${url}/${size}.webp`;
}

export function isPikaImage(card) {
  try { return new URL(typeof card === 'string' ? card : card?.image).hostname === 'images.pikaqian.com'; }
  catch { return false; }
}

export function pikaCardUrl(card) {
  return card?.pikaqian_id ? `https://pikaqian.com/cards/${encodeURIComponent(card.pikaqian_id)}` : null;
}
