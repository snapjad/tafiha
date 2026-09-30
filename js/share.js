// طفّيها — Instagram story card (1080×1920) drawn on a canvas.
import * as S from './store.js';
import { u, LAYOUT } from './cigarette.js';

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pill(g, text, cx, y, font) {
  g.font = font;
  const w = g.measureText(text).width + 84;
  const h = 96;
  const x = cx - w / 2;
  g.fillStyle = 'rgba(255,255,255,.14)';
  g.beginPath();
  g.roundRect(x, y, w, h, 48);
  g.fill();
  g.fillStyle = '#fff';
  g.fillText(text, cx, y + 64);
}

// a lit cigarette, a little way into burning, built from the same layers as the hero
async function drawCigarette(g, x, y, w) {
  const [body, tip] = await Promise.all([loadImg('assets/cig-body.webp'), loadImg('assets/cig-tip-idle.webp')]);
  const h = (body.height / body.width) * w;
  const burn = LAYOUT.B0 - 1.1;
  const cut = u(burn - LAYOUT.OVER / 2);
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((-5 * Math.PI) / 180);
  g.shadowColor = 'rgba(60,0,0,.35)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 24;
  g.drawImage(body, 0, 0, body.width * cut, body.height, -w / 2, -h / 2, w * cut, h);
  g.shadowColor = 'transparent';
  g.drawImage(tip, -w / 2 + ((burn - LAYOUT.B0) / LAYOUT.ORTHO) * w, -h / 2, w, h);
  g.restore();
}

export async function makeStory(s, mode) {
  await Promise.all([
    document.fonts.load('900 200px "Big Shoulders Display"'),
    document.fonts.load('700 80px "Readex Pro"'),
    document.fonts.load('500 40px "Readex Pro"'),
  ]).catch(() => {});

  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  const bg = g.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.46, H * 0.85);
  bg.addColorStop(0, '#f2402f');
  bg.addColorStop(0.45, '#e1261c');
  bg.addColorStop(1, '#9e130d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.direction = 'rtl';
  g.textAlign = 'center';
  g.fillStyle = '#fff';

  g.font = '700 70px "Readex Pro"';
  g.fillText('طفّيها', W / 2, 190);

  const d = Math.floor(S.daysFloat(s));
  g.font = '500 58px "Readex Pro"';
  g.globalAlpha = 0.85;
  g.fillText('صارلي طافيها', W / 2, 430);
  g.globalAlpha = 1;

  g.direction = 'ltr';
  g.font = `900 ${d > 99 ? 470 : 580}px "Big Shoulders Display"`;
  g.fillText(String(d), W / 2, 960);
  g.direction = 'rtl';
  g.font = '700 112px "Readex Pro"';
  g.fillText(S.word(d, 'يوم', 'أيام'), W / 2, 1110);

  try {
    if (mode === 'vape') {
      const img = await loadImg('assets/hero-vape.webp');
      const iw = 1000;
      const ih = (img.height / img.width) * iw;
      g.save();
      g.shadowColor = 'rgba(60,0,0,.35)';
      g.shadowBlur = 50;
      g.shadowOffsetY = 30;
      g.drawImage(img, (W - iw) / 2, 1080, iw, ih);
      g.restore();
    } else {
      await drawCigarette(g, 70, 1250, 940);
    }
  } catch (e) { /* the card still works without the render */ }

  const mo = S.money(s);
  const av = S.avoided(s);
  pill(g, `وفّرت ${S.fmtMoney(Math.max(0, mo.net))} د.أ`, W / 2, 1600, '600 50px "Readex Pro"');
  g.font = '400 40px "Readex Pro"';
  g.globalAlpha = 0.9;
  g.fillText(`${S.fmtInt(av.units)} ${av.unitLabel}`, W / 2, 1780);
  g.globalAlpha = 0.7;
  g.font = '400 34px "Readex Pro"';
  g.fillText('اترك معي · طفّيها', W / 2, 1862);
  g.globalAlpha = 1;

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
