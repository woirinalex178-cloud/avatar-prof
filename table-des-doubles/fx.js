// Effets de relief : cartes inclinables avec reflet holographique, apparitions au défilement, compteurs, braises en parallaxe.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let io;

function tilt() {
  let cur = null;
  const reset = el => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('tilt'); };
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('.tile, .fan img');
    if (cur && cur !== el) { reset(cur); cur = null; }
    if (!el) return;
    if (el.classList.contains('tile') && !el.querySelector('.holo')) el.insertAdjacentHTML('beforeend', '<span class="holo"></span>');
    const r = (el.querySelector('.cimg, .ph') || el).getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty('--rx', ((.5 - py) * 18).toFixed(1) + 'deg');
    el.style.setProperty('--ry', ((px - .5) * 22).toFixed(1) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(0) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(0) + '%');
    el.classList.add('tilt'); cur = el;
  }, { passive: true });
}

function embers() {
  const cv = document.createElement('canvas'); cv.id = 'embers'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d'), N = innerWidth < 700 ? 22 : 45, P = [];
  let W, H, mx = 0, my = 0;
  const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
  size(); addEventListener('resize', size);
  addEventListener('pointermove', e => { mx = e.clientX / W - .5; my = e.clientY / H - .5; }, { passive: true });
  for (let i = 0; i < N; i++) P.push({ x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7, s: .0002 + Math.random() * .0006, ph: Math.random() * 6 });
  const draw = t => {
    if (!document.hidden) {
      ctx.clearRect(0, 0, W, H);
      const sy = scrollY * .15;
      for (const p of P) {
        p.y -= p.s * p.z; if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); }
        const x = p.x * W + Math.sin(t / 1500 + p.ph) * 12 - mx * 40 * p.z, y = ((p.y * H - sy * p.z) % H + H) % H - my * 30 * p.z;
        const a = .25 + .35 * Math.sin(t / 700 + p.ph) ** 2;
        ctx.fillStyle = `rgba(243,216,146,${a * p.z})`; ctx.beginPath(); ctx.arc(x, y, 1.2 + p.z * 1.8, 0, 6.283); ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function count(el) {
  const m = el.textContent.replace(/[\s  ]/g, '').match(/^(\d+)(.*)$/); if (!m) return;
  const end = +m[1], suf = m[2], t0 = performance.now(), fmt = n => n.toLocaleString('fr-FR') + (suf ? ' ' + suf : '');
  if (!end) return;
  const step = t => { const u = Math.min(1, (t - t0) / 1200), e = 1 - (1 - u) ** 3; el.textContent = fmt(Math.round(end * e)); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function initFx() {
  if (reduced) return;
  document.documentElement.classList.add('fx');
  tilt(); embers();
  io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    if (e.target.matches('.stats b')) count(e.target);
  }), { rootMargin: '0px 0px -40px 0px' });
}

// à appeler après chaque changement de page
export function refreshFx(view) {
  if (reduced || !io) return;
  view.classList.remove('pg'); void view.offsetWidth; view.classList.add('pg');
  let i = 0;
  view.querySelectorAll('.panel, .step, h2, .tile, .banner, .stats b').forEach(el => {
    if (el.classList.contains('rv')) return;
    el.classList.add('rv'); el.style.transitionDelay = (el.classList.contains('tile') ? (i++ % 10) * 35 : 0) + 'ms';
    io.observe(el);
  });
}
