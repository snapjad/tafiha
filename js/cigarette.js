// طفّيها — the hero cigarette: burns down puff by puff, goes out, and starts again.
import { createSmoke } from './smoke.js';

// Must match blender/make_assets.py (LIT_*): world X → image fraction.
const CX = 0.175;
const ORTHO = 10;
const B0 = 4.2;       // burn line of a fresh cigarette
const END = -0.72;    // stop short of the filter (the tip's paper reaches 0.7 behind the burn line)
const OVER = 0.35;    // body/tip overlap; the body is cut halfway into it
export const u = (x) => (x - CX) / ORTHO + 0.5;
export const LAYOUT = { B0, OVER, ORTHO };

const PERIOD = 3.2;   // one drag every PERIOD seconds
const DRAG = 1.2;     // how long a drag lasts
const V_IDLE = 0.13;  // burn speed between drags (world units / s)
const V_DRAG = 0.42;  // burn speed while drawing on it

// Layout of the hero, mirrored from app.css so the smoke source can be computed
// without reading layout every frame.
const FLOAT_L = 0.03, FLOAT_W = 0.94, FLOAT_T = 0.60;  // .cig-float in the stage
const MARK_X = 0.929, MARK_Y = 0.46;                    // .tip-mark in .cig (fresh cigarette)
const TILT = -5;                                         // .cig rotation, degrees
const SMOKE_H = 1.9;                                     // #smoke height ÷ stage height
const FLOAT_S = 7;                                       // seconds per float cycle

export function initCigarette(stage, { reduceMotion = false } = {}) {
  const wrap = stage.querySelector('.cig-float');
  const cig = stage.querySelector('.cig');
  const shadow = stage.querySelector('.shadow');
  const body = stage.querySelector('.cig-body');
  const tip = stage.querySelector('.cig-tip');
  const idle = stage.querySelector('.t-idle');
  const hot = stage.querySelector('.t-hot');
  const glow = stage.querySelector('.glow');
  const canvas = stage.querySelector('#smoke');

  let smoke = null;
  if (!reduceMotion) {
    try { smoke = createSmoke(canvas, { small: Math.min(innerWidth, innerHeight) < 700 }); } catch (e) { smoke = null; }
  }

  let burn = B0;
  let phase = 'burn';
  let phaseT = 0;
  let t = 0;
  let smolder = 1;
  let fade = 1;
  let after = 0;
  let raf = 0;
  let last = 0;
  let visible = true;
  let mode = 'cig';
  let W = stage.clientWidth;
  let H = stage.clientHeight;
  let clock = 0;
  let slow = 0;
  let frames = 0;
  new ResizeObserver(() => { W = stage.clientWidth; H = stage.clientHeight; }).observe(stage);

  // where the tip is, in smoke-canvas coordinates (0..1, y up)
  function source(dy, rotDeg) {
    const fw = FLOAT_W * W;
    const fh = fw / 4;
    const cx = FLOAT_L * W + fw / 2;
    const cy = FLOAT_T * H + fh / 2;
    const px = FLOAT_L * W + fw * (MARK_X + (burn - B0) / ORTHO) - cx;
    const py = FLOAT_T * H + fh * MARK_Y - cy;
    const a = ((TILT + rotDeg) * Math.PI) / 180;
    const sx = cx + px * Math.cos(a) - py * Math.sin(a);
    const sy = cy + px * Math.sin(a) + py * Math.cos(a) - fh / 2 + dy;
    return [sx / W, 1 - (sy + (SMOKE_H - 1) * H) / (SMOKE_H * H)];
  }

  function place() {
    const cut = u(burn - OVER / 2) * 100;
    body.style.clipPath = `inset(0 ${(100 - cut).toFixed(3)}% 0 0)`;
    tip.style.transform = `translateX(${(((burn - B0) / ORTHO) * 100).toFixed(3)}%)`;
  }

  const dragAt = (time) => {
    const p = (time + PERIOD - 0.6) % PERIOD;
    if (p > DRAG) return 0;
    const k = Math.sin((Math.PI * p) / DRAG);
    return k * k;
  };

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    let d = 0;

    if (phase === 'burn') {
      d = dragAt(t);
      burn -= (V_IDLE + (V_DRAG - V_IDLE) * d) * dt;
      if (burn <= END) { burn = END; phase = 'out'; phaseT = 0; }
    } else if (phase === 'out') {
      phaseT += dt;
      smolder = Math.max(0, 1 - phaseT / 2.4);
      if (phaseT > 3.4) { phase = 'fade'; phaseT = 0; }
    } else if (phase === 'fade') {
      phaseT += dt;
      fade = Math.max(0, 1 - phaseT / 0.45);
      if (phaseT > 0.55) { burn = B0; smolder = 1; t = 0; phase = 'in'; phaseT = 0; }
    } else if (phase === 'in') {
      phaseT += dt;
      fade = Math.min(1, phaseT / 0.6);
      if (fade >= 1) phase = 'burn';
    }
    if (d > 0.85) after = 1;
    after = Math.max(0, after - dt * 0.7);

    place();
    // gentle float, driven here so the smoke source follows it exactly
    clock += dt;
    const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / FLOAT_S);
    const dy = -0.03 * H * f;
    const rot = -1 * f;
    cig.style.transform = `translateY(calc(-50% + ${dy.toFixed(2)}px)) rotate(${(TILT + rot).toFixed(3)}deg)`;
    shadow.style.transform = `scale(${(1 - 0.14 * f).toFixed(3)})`;
    shadow.style.opacity = (1 - 0.3 * f).toFixed(3);
    const flicker = 0.88 + 0.12 * Math.sin(now / 83) * Math.sin(now / 31 + 1.3);
    idle.style.opacity = (smolder * flicker).toFixed(3);
    hot.style.opacity = (smolder * d).toFixed(3);
    glow.style.opacity = (smolder * (0.3 + 0.7 * d)).toFixed(3);
    wrap.style.opacity = fade.toFixed(3);

    if (smoke) {
      const [x, y] = source(dy, rot);
      // drop the simulation's detail if this device can't keep up
      if (++frames > 45) {
        slow = slow * 0.95 + (dt > 1 / 40 ? 0.05 : 0);
        if (slow > 0.6 && smoke.degrade()) slow = 0;
      }
      // drawing on it pulls air in (less side smoke); right after, a thicker plume
      const rate = smolder * (1 - 0.65 * d) * (1 + 0.8 * after) * fade;
      const k = dt * 60;
      const em = rate > 0.02 ? [{
        x, y, radius: 0.00005,
        amount: 0.14 * rate * k,
        vx: (Math.sin(t * 2.1) * 5 + (Math.random() - 0.5) * 16) * k,
        vy: (16 + Math.random() * 6) * rate * k,
      }] : [];
      smoke.frame(dt, em);
    }
    if (visible && !document.hidden && mode === 'cig') raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && visible && !document.hidden && mode === 'cig' && !reduceMotion) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  // a still, half-smoked cigarette when motion is reduced
  if (reduceMotion) {
    burn = B0 - 1.6;
    place();
    idle.style.opacity = '1';
    glow.style.opacity = '.3';
  } else {
    place();
  }

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(stage);
  document.addEventListener('visibilitychange', kick);

  return {
    setMode(m) {
      mode = m;
      if (m !== 'off') stage.dataset.mode = m;
      if (m === 'cig') kick();
      else if (smoke) smoke.clear();
    },
  };
}
