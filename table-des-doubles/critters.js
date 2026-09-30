// Petites créatures originales qui traversent le site : jamais la même, jamais au même endroit, jamais de la même taille.
// Elles ne bloquent aucun clic ; les toucher les « attrape » (trophée secret).
const O = 'stroke="#1c1410" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const eye = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${O} stroke-width="2"/><circle cx="${x + r * .25}" cy="${y}" r="${r * .55}" fill="#1c1410"/><circle cx="${x + r * .45}" cy="${y - r * .35}" r="${r * .22}" fill="#fff"/>`;
const shine = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".35"/>`;
const shade = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#000" opacity=".18"/>`;
// chaque créature regarde vers la droite ; h = teinte
const KINDS = [
  ['salamandre', h => `<path d="M18 62c-10-4-14-14-8-22 2 8 8 12 16 12" fill="hsl(${h + 20} 95% 55%)" ${O}/><path d="M10 40c-4-8 2-16 8-18-1 6 2 10 6 12" fill="hsl(45 100% 60%)" ${O}/>
    <ellipse cx="48" cy="60" rx="26" ry="16" fill="hsl(${h} 85% 55%)" ${O}/>${shade(48, 68, 22, 7)}<circle cx="74" cy="46" r="16" fill="hsl(${h} 85% 58%)" ${O}/>${shine(70, 40, 7, 4)}${eye(78, 44)}
    <path d="M36 74l-3 9M58 74l3 9" ${O} fill="none"/><path d="M84 52q4 3 0 5" ${O} fill="none" stroke-width="2"/>`],
  ['poisson-bulle', h => `<path d="M16 50l-12-14v28z" fill="hsl(${h + 30} 80% 60%)" ${O}/><circle cx="52" cy="50" r="32" fill="hsl(${h} 75% 62%)" ${O}/>${shade(52, 64, 26, 12)}${shine(42, 34, 12, 7)}
    <path d="M50 20q6-10 14-4-6 2-8 8z" fill="hsl(${h + 30} 80% 60%)" ${O}/>${eye(66, 44, 7)}<path d="M76 58q4 3 0 6" ${O} fill="none" stroke-width="2"/>
    <circle cx="92" cy="30" r="4" fill="none" stroke="#bfe8ff" stroke-width="2"/><circle cx="96" cy="18" r="2.5" fill="none" stroke="#bfe8ff" stroke-width="2"/>`],
  ['esprit-feuille', h => `<path d="M50 90C20 70 18 35 50 10c32 25 30 60 0 80z" fill="hsl(${h + 100} 60% 48%)" ${O}/>${shade(50, 70, 18, 12)}<path d="M50 88V22" stroke="hsl(${h + 100} 60% 30%)" stroke-width="2.5" fill="none"/>
    ${shine(40, 36, 7, 10)}${eye(42, 50, 5)}${eye(60, 50, 5)}<path d="M46 62q5 4 10 0" ${O} fill="none" stroke-width="2"/><path d="M50 10q6-8 14-6" ${O} fill="none"/>`],
  ['feu-follet', h => `<path d="M50 10c22 0 34 18 34 40v34l-8-7-9 8-8-8-9 8-8-8-9 8-8-7V50c0-22 12-40 25-40z" fill="hsl(${h + 180} 70% 80%)" opacity=".92" ${O}/>${shine(40, 28, 9, 6)}
    ${eye(40, 46, 6)}${eye(62, 46, 6)}<ellipse cx="51" cy="62" rx="5" ry="4" fill="#1c1410"/>`],
  ['golem', h => `<path d="M20 78c-6-24 4-50 30-56 28-4 40 24 34 54-2 10-60 12-64 2z" fill="hsl(${h + 200} 10% 55%)" ${O}/>${shade(52, 74, 30, 8)}${shine(40, 34, 10, 6)}
    <path d="M40 40l6 8-4 6M66 60l-6 6 4 6" stroke="#1c1410" stroke-width="2" fill="none"/><circle cx="12" cy="62" r="8" fill="hsl(${h + 200} 10% 50%)" ${O}/><circle cx="90" cy="62" r="8" fill="hsl(${h + 200} 10% 50%)" ${O}/>
    ${eye(44, 48, 5)}${eye(64, 48, 5)}<path d="M72 30l6-8 2 10" fill="hsl(${h} 90% 55%)" ${O} stroke-width="2"/>`],
  ['oiseau-eclair', h => `<path d="M30 54L6 40l18 20-16 6 26-2z" fill="hsl(${h + 50} 95% 55%)" ${O}/><ellipse cx="52" cy="56" rx="26" ry="20" fill="hsl(${h + 50} 95% 58%)" ${O}/>${shade(52, 66, 20, 7)}
    <path class="flap" d="M44 50l10-26 4 14 10-16-2 24z" fill="hsl(${h + 50} 100% 70%)" ${O}/>${shine(46, 48, 8, 4)}${eye(66, 50, 5)}<path d="M76 56l14 3-14 5z" fill="#ff9d2e" ${O} stroke-width="2"/>
    <path d="M46 74l-2 8M58 74l2 8" ${O} fill="none" stroke-width="2"/>`],
  ['papillon-fee', h => `<g class="flap"><path d="M48 50C30 20 6 18 8 38c2 14 20 18 40 12z" fill="hsl(${h + 280} 80% 70%)" ${O}/><path d="M48 54C28 60 14 76 26 84c10 6 20-10 22-30z" fill="hsl(${h + 300} 80% 65%)" ${O}/>
    <circle cx="24" cy="36" r="5" fill="#fff" opacity=".6"/></g><ellipse cx="54" cy="52" rx="8" ry="22" fill="hsl(${h + 260} 50% 40%)" ${O}/><circle cx="58" cy="28" r="10" fill="hsl(${h + 260} 50% 45%)" ${O}/>
    ${eye(61, 27, 4)}<path d="M58 18q2-10 10-12M62 20q6-6 14-4" ${O} fill="none" stroke-width="2"/>`],
  ['bebe-dragon', h => `<path class="flap" d="M40 42C30 20 14 16 6 22c10 4 12 10 10 16 8 0 14 2 16 8z" fill="hsl(${h + 330} 70% 50%)" ${O}/><path d="M22 70c-12 2-18-4-18-10 6 4 12 4 18 0" fill="hsl(${h + 340} 75% 55%)" ${O}/>
    <ellipse cx="44" cy="62" rx="24" ry="20" fill="hsl(${h + 340} 75% 58%)" ${O}/><ellipse cx="48" cy="68" rx="13" ry="10" fill="#ffe6b0" ${O} stroke-width="2"/><circle cx="70" cy="42" r="18" fill="hsl(${h + 340} 75% 60%)" ${O}/>
    ${shine(64, 34, 7, 4)}<path d="M62 26l-2-10 8 6M74 25l2-10 5 9" fill="#ffe6b0" ${O} stroke-width="2"/>${eye(74, 41, 5.5)}<circle cx="86" cy="48" r="1.6" fill="#1c1410"/>`]
];

const rnd = (a, b) => a + Math.random() * (b - a);
let last = -1, layer, getCard = () => null, onCatch = () => { };
const live = new Set();

function edgePoint(side, W, H, pad) {
  return side === 0 ? { x: -pad, y: rnd(.05, .9) * H } : side === 1 ? { x: W + pad, y: rnd(.05, .9) * H }
    : side === 2 ? { x: rnd(0, 1) * W, y: -pad } : { x: rnd(0, 1) * W, y: H + pad };
}

function spawn() {
  if (document.hidden || live.size >= 2 || document.documentElement.classList.contains('intro-on')) return;
  const W = innerWidth, H = innerHeight;
  const size = Math.round(rnd(28, W < 600 ? 90 : 140));
  const card = Math.random() < .05 ? getCard() : null;
  let k; do k = Math.floor(Math.random() * KINDS.length); while (k === last); last = k;
  const from = Math.floor(Math.random() * 4); let to; do to = Math.floor(Math.random() * 4); while (to === from);
  const a = edgePoint(from, W, H, size * 1.5), b = edgePoint(to, W, H, size * 1.5);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const style = Math.floor(Math.random() * 4), amp = rnd(30, 140), waves = rnd(1, 3.5), dur = rnd(6000, 16000);
  const flip = dx < 0 ? -1 : 1, frames = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24; let off = 0, ox = 0, oy = 0;
    if (style === 0) off = Math.sin(u * Math.PI * 2 * waves) * amp; // vague
    else if (style === 1) off = -Math.abs(Math.sin(u * Math.PI * 2 * waves)) * amp; // rebonds
    else if (style === 2) off = Math.sin(u * Math.PI) * amp * 1.4; // planée
    else { ox = Math.cos(u * Math.PI * 6) * amp * .4; oy = Math.sin(u * Math.PI * 6) * amp * .4; } // tourbillon
    const x = a.x + dx * u + nx * off + ox, y = a.y + dy * u + ny * off + oy;
    const tilt = style === 3 ? Math.sin(u * 18) * 14 : Math.cos(u * Math.PI * 2 * waves) * 10;
    frames.push({ transform: `translate(${x}px,${y}px) scaleX(${card ? 1 : flip}) rotate(${card ? u * 720 : tilt}deg)` });
  }
  const el = document.createElement('div');
  el.className = 'critter' + (card ? ' card' : '');
  el.style.width = el.style.height = size + 'px';
  el.style.marginLeft = el.style.marginTop = -size / 2 + 'px';
  if (card) { el.style.height = size * 1.4 + 'px'; el.innerHTML = `<img src="${card}" alt="">`; }
  else el.innerHTML = `<svg viewBox="0 0 100 100">${KINDS[k][1](rnd(0, 360) | 0)}</svg>`;
  el.style.animationDuration = rnd(.35, .8) + 's';
  layer.appendChild(el); live.add(el);
  const an = el.animate(frames, { duration: dur, easing: 'linear' });
  const end = () => { live.delete(el); el.remove(); };
  an.onfinish = end; el._end = end; el._an = an;
}

function poof(x, y) {
  const p = document.createElement('div'); p.className = 'poof'; p.style.left = x + 'px'; p.style.top = y + 'px';
  p.innerHTML = '✦✧✦✧✦✧'.split('').map((c, i) => `<i style="--a:${i * 60}deg">${c}</i>`).join('');
  layer.appendChild(p); setTimeout(() => p.remove(), 700);
}

export function initCritters(opts = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || layer) return;
  getCard = opts.getCard || getCard; onCatch = opts.onCatch || onCatch;
  layer = document.createElement('div'); layer.id = 'critters'; layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  // attraper : on teste la position du doigt sans bloquer le clic sur le site
  addEventListener('pointerdown', e => {
    for (const el of live) {
      const r = el.getBoundingClientRect(), m = r.width * .15;
      if (e.clientX > r.left + m && e.clientX < r.right - m && e.clientY > r.top + m && e.clientY < r.bottom - m) {
        el._an.cancel(); el._end(); poof(e.clientX, e.clientY); onCatch(); break;
      }
    }
  }, true);
  const loop = () => { spawn(); setTimeout(loop, rnd(8000, 25000)); };
  setTimeout(loop, rnd(3000, 7000));
}

// avatars : même dessin que les créatures, 8 teintes au choix
export const CRITTER_NAMES = KINDS.map(k => k[0]);
export const HUES = [0, 45, 90, 140, 190, 230, 280, 320];
export const critterSVG = (k, h) => `<svg viewBox="0 0 100 100">${(KINDS[k] || KINDS[0])[1](HUES[h] ?? 0)}</svg>`;
