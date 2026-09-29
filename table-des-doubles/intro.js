// Cinématique d'ouverture : un dragon (création originale) crache du feu qui recouvre l'écran, puis révèle le site.
// Jouée à la 1re visite ; rejouable via le lien « Revoir l'intro » en bas de page.
const KEY = 'sc_intro';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const DRAGON = `<svg viewBox="0 0 600 500" class="dragon" aria-hidden="true">
<defs>
  <linearGradient id="dgBody" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0d0604"/><stop offset=".55" stop-color="#2b120a"/><stop offset="1" stop-color="#4a1f0e"/></linearGradient>
  <linearGradient id="dgWing" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1a0a06"/><stop offset="1" stop-color="#5a2410"/></linearGradient>
  <radialGradient id="dgEye"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffc233"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0"/></radialGradient>
  <radialGradient id="dgMouth"><stop offset="0" stop-color="#fff3b0"/><stop offset=".4" stop-color="#ff9a1f"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
  <filter id="dgGlow"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<g class="wing">
  <path d="M265 300C225 180 150 85 30 35c45 70 30 110-10 135 60 15 55 55 20 90 70 5 85 35 70 70 60-15 95 5 125 30z" fill="url(#dgWing)" stroke="#e0b85c" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M265 300 30 35M250 320 20 170M240 340 40 260M232 355 110 330" stroke="#e0b85c" stroke-width="1.6" opacity=".55" fill="none"/>
</g>
<path d="M40 500C80 380 200 300 300 240c40-25 70-40 92-45l14 55c-45 15-105 50-155 110-40 50-50 95-42 140z" fill="url(#dgBody)" stroke="#e0b85c" stroke-width="2.5"/>
<path d="M120 470c30-80 90-150 170-200M150 490c30-80 85-140 160-185" stroke="#e0b85c" stroke-width="1.4" opacity=".4" fill="none"/>
<path d="M150 395l-22-30 38 12zM190 345l-18-34 36 16zM236 302l-12-36 32 20zM285 268l-6-36 28 24zM335 238l0-34 22 26z" fill="#e0b85c"/>
<path d="M398 178c-25-45-65-68-112-70 42 18 68 42 88 80zM418 176c-8-40-30-66-62-82 24 26 36 50 42 86z" fill="#2b120a" stroke="#e0b85c" stroke-width="2"/>
<g class="jaw-low"><path d="M398 228c50 0 110 0 157-6l-7 16c-48 14-108 19-153 14z" fill="url(#dgBody)" stroke="#e0b85c" stroke-width="2.5"/>
  <path d="M430 232l4 9 5-9M470 231l4 9 5-9M510 229l4 8 5-8" fill="#fff4d0"/></g>
<ellipse class="mouth-glow" cx="500" cy="228" rx="60" ry="16" fill="url(#dgMouth)"/>
<g class="jaw-up"><path d="M380 170c40-20 120-12 180 30l5 12c-45-2-105 3-165 13z" fill="url(#dgBody)" stroke="#e0b85c" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M440 214l4-9 5 9M480 212l4-9 5 9M520 210l4-8 5 8" fill="#fff4d0"/>
  <path d="M548 196l10 4" stroke="#e0b85c" stroke-width="3" stroke-linecap="round"/></g>
<ellipse cx="438" cy="186" rx="16" ry="9" fill="url(#dgEye)" filter="url(#dgGlow)"/>
<ellipse class="eye" cx="438" cy="186" rx="8" ry="4.5" fill="#fff1a8"/>
<path d="M436 182v8" stroke="#2b0f05" stroke-width="2.2" stroke-linecap="round"/>
<circle class="mouth-pt" cx="560" cy="218" r="1" fill="none"/>
</svg>`;

let running = null;

export function playIntro(force = false) {
  if (running) return;
  let seen = false; try { seen = !!localStorage.getItem(KEY); } catch { }
  if ((seen && !force) || (reduced() && !force)) return;
  try { localStorage.setItem(KEY, '1'); } catch { }

  const ov = document.createElement('div');
  ov.id = 'intro';
  ov.innerHTML = `<canvas></canvas><div class="dwrap">${DRAGON}</div>
    <div class="ilogo"><img src="img/logo.webp" alt=""><b>Sharing <span>Cards</span></b><small>Collectionnez. Échangez. Partagez.</small></div>
    <button class="iskip" type="button">Passer ›</button>`;
  document.body.appendChild(ov);
  document.documentElement.classList.add('intro-on');
  const cv = ov.querySelector('canvas'), ctx = cv.getContext('2d');
  const mobile = innerWidth < 700, dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
  let W, H;
  const size = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener('resize', size);

  const P = [], t0 = performance.now();
  const EMIT = mobile ? 14 : 30;
  // braises d'ambiance
  const ember = () => P.push({ x: Math.random() * W, y: H + 10, vx: (Math.random() - .5) * .6, vy: -(1 + Math.random() * 2.2), r: 1 + Math.random() * 2.4, life: 0, max: 140 + Math.random() * 120, k: 'e' });
  const mouth = () => { const r = ov.querySelector('.mouth-pt').getBoundingClientRect(); return { x: r.left, y: r.top }; };
  const flame = (m, k) => {
    const a = -.12 + (Math.random() - .5) * (.6 + k * 1.4), sp = (mobile ? 7 : 10) + Math.random() * 9;
    P.push({ x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8 + Math.random() * 12, grow: 1.4 + Math.random() * 1.4, life: 0, max: 55 + Math.random() * 45, k: 'f' });
  };
  // sprites de flamme doux (dégradés radiaux pré-rendus), du cœur blanc-jaune à la fumée
  const sprite = (c0, c1) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, c0); rg.addColorStop(.4, c1); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return c; };
  const SPR = [sprite('rgba(255,250,220,.9)', 'rgba(255,210,90,.35)'), sprite('rgba(255,190,60,.8)', 'rgba(255,110,20,.3)'), sprite('rgba(240,90,20,.7)', 'rgba(170,30,10,.25)'), sprite('rgba(60,45,40,.45)', 'rgba(30,25,22,.2)')];
  let raf, done = false, heat = 0;
  const T = { enter: 0, open: 1100, fire: 1300, heat: 2000, fireEnd: 3300, reveal: 3350, end: 4600 };
  const frame = now => {
    const t = now - t0;
    ov.classList.toggle('open', t > T.open && t < T.reveal);
    ov.classList.toggle('shake', t > T.fire && t < T.fireEnd);
    ov.classList.toggle('logo', t > T.fireEnd - 300);
    ov.classList.toggle('reveal', t > T.reveal);
    if (Math.random() < .5) ember();
    if (t > T.fire && t < T.fireEnd) { const m = mouth(); const k = Math.min(1, (t - T.fire) / 1500); for (let i = 0; i < EMIT * (1 + k); i++) flame(m, k); }
    heat = t < T.heat ? 0 : t < T.fireEnd ? Math.min(1, (t - T.heat) / 700) : Math.max(0, 1 - (t - T.fireEnd) / 1100);
    ctx.clearRect(0, 0, W, H);
    if (heat > 0) { // la fournaise recouvre l'écran
      const m = mouth(), g = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, Math.max(W, H) * (0.3 + heat));
      g.addColorStop(0, `rgba(255,240,180,${heat})`); g.addColorStop(.35, `rgba(255,150,30,${heat})`); g.addColorStop(1, `rgba(200,45,10,${.97 * heat})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life++;
      const u = p.life / p.max;
      if (u >= 1 || p.y < -200 || p.x > W + 300) { P.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy;
      if (p.k === 'f') { p.vx *= .985; p.vy = p.vy * .985 - .12; p.r += p.grow; }
      if (p.k === 'e') { ctx.fillStyle = `rgba(255,${160 + (p.r * 20 | 0)},60,${1 - u})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); continue; }
      const si = u < .18 ? 0 : u < .45 ? 1 : u < .75 ? 2 : 3;
      ctx.globalCompositeOperation = si === 3 ? 'source-over' : 'lighter';
      ctx.globalAlpha = si === 3 ? 1 - u : Math.min(1, 1.3 - u);
      ctx.drawImage(SPR[si], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalCompositeOperation = 'source-over';
    if (t < T.end) raf = requestAnimationFrame(frame); else finish();
  };
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    ov.classList.add('bye'); removeEventListener('resize', size); removeEventListener('keydown', onKey);
    setTimeout(() => { ov.remove(); document.documentElement.classList.remove('intro-on'); running = null; }, 450);
  };
  const onKey = e => { if (e.key === 'Escape') finish(); };
  addEventListener('keydown', onKey);
  ov.addEventListener('click', finish);
  running = requestAnimationFrame(frame); raf = running;
}
