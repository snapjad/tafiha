// طفّيها — Instagram story card (1080×1920) drawn on a canvas.
// Follows the brand book's story template: one ink background, a big number,
// one short line, and the wordmark at the bottom as a signature.
import * as S from './store.js';

const INK = '#1b1716';
const PAD = 96;

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function makeStory(s, mode) {
  await Promise.all([
    document.fonts.load('800 400px "Big Shoulders Display"'),
    document.fonts.load('800 120px "Alexandria"'),
    document.fonts.load('500 44px "Readex Pro"'),
    document.fonts.load('400 40px "Readex Pro"'),
  ]).catch(() => {});

  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);

  const d = Math.floor(S.daysFloat(s));
  const right = W - PAD;

  // labels along the top: «اليوم» on the right, what you're free of on the left
  g.fillStyle = 'rgba(255,255,255,.62)';
  g.font = '500 44px "Readex Pro"';
  g.direction = 'rtl';
  g.textAlign = 'right';
  g.fillText('اليوم', right, 200);
  g.textAlign = 'left';
  g.fillText(mode === 'vape' ? 'بدون فيب' : S.primaryHabit(s) === 'argileh' ? 'بدون أرجيلة' : 'بدون دخان', PAD, 200);

  // the big number
  g.fillStyle = '#fff';
  g.direction = 'ltr';
  g.textAlign = 'right';
  g.font = `800 ${d > 999 ? 400 : d > 99 ? 520 : 660}px "Big Shoulders Display"`;
  g.fillText(String(d), right + 12, 1000);

  // one short line, then what it saved
  g.direction = 'rtl';
  g.textAlign = 'right';
  g.font = '800 120px "Alexandria"';
  g.fillText(d === 1 ? 'يوم، وأنا طافيها' : 'صارلي طافيها', right, 1200);

  const saved = S.savings(s).earnedCents / 100;
  const av = S.avoided(s);
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.font = '400 44px "Readex Pro"';
  g.fillText(`وفّرت ${S.fmtMoney(saved)} د.أ · ${S.fmtInt(av.units)} ${av.unitLabel}`, right, 1310);

  // signature: the wordmark (never typeset) and the address
  try {
    const word = await loadImg('assets/brand/tafiha-logo-transparent-light.svg');
    const ww = 300;
    const wh = (word.naturalHeight / word.naturalWidth) * ww;
    g.drawImage(word, right - ww, H - PAD - wh, ww, wh);
  } catch (e) { /* the card still works without the logo */ }
  g.fillStyle = 'rgba(255,255,255,.62)';
  g.direction = 'ltr';
  g.textAlign = 'left';
  g.font = '500 40px "Readex Pro"';
  g.fillText('tafiha.com', PAD, H - PAD - 18);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
