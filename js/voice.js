// طفّيها — sound for the spoken interview.
//   Listening: the phone's own speech recognition, free. In the Android app the Speech Recognition
//   plugin (Google's engine on the phone); in a browser SpeechRecognition where it exists.
//   Speaking: the guide's real voice comes from the «mentor» function as an mp3 (js/mentor-interview.js)
//   and plays through one audio element that unlock() opens inside the person's tap, because
//   phones only play sound a tap started.

const cap = () => globalThis.Capacitor;
const native = () => !!cap()?.isNativePlatform?.();
const stt = () => cap()?.Plugins?.SpeechRecognition;
const WebRec = () => window.SpeechRecognition || window.webkitSpeechRecognition;

let player = null, context = null;

// a moment of silence as a WAV, made here (no file to load)
function silence() {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// call inside the tap that opens the interview
export function unlock() {
  try {
    player ||= new Audio();
    player.src = silence();
    player.play().catch(() => {});
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) { context ||= new Ctx(); context.resume?.().catch(() => {}); }
  } catch { /* sound stays off; the words are on screen */ }
}

// the shared player and sound context (null until unlock())
export const sound = () => ({ player, context });

export async function canListen() {
  if (native()) {
    try { return !!(await stt()?.available?.())?.available; } catch { return false; }
  }
  return !!WebRec();
}

let webRec = null;

// what the person said, or '' (silence, not understood). Throws {code:'denied'} without the microphone.
export async function listen() {
  if (native()) {
    const p = stt();
    if (!p) return '';
    let perm = await p.checkPermissions().catch(() => ({}));
    if (perm.speechRecognition !== 'granted') perm = await p.requestPermissions().catch(() => ({}));
    if (perm.speechRecognition !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
    try {
      const r = await p.start({ language: 'ar-JO', maxResults: 1, partialResults: false, popup: false });
      return String(r?.matches?.[0] || '').trim();
    } catch { return ''; }
  }
  const Rec = WebRec();
  if (!Rec) return '';
  return new Promise((resolve, reject) => {
    const rec = new Rec();
    webRec = rec;
    // iPhones listen in Saudi Arabic (they have no Jordanian); Chrome knows ar-JO
    rec.lang = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'ar-SA' : 'ar-JO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let heard = '';
    rec.onresult = (ev) => {
      heard = String(ev.results?.[0]?.[0]?.transcript || '').trim();
      if (ev.results?.[0]?.isFinal) { try { rec.abort(); } catch { /* ended */ } }
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') reject(Object.assign(new Error('denied'), { code: 'denied' }));
      // no-speech, aborted, network…: ends with nothing heard
    };
    rec.onend = () => { if (webRec === rec) webRec = null; resolve(heard); };
    try { rec.start(); } catch { resolve(''); }
  });
}

// soft: finish and keep what was said (the person tapped the mic again);
// hard: drop it and free the microphone at once (leaving), so the phone's mic light goes off
export function stopListening(hard = false) {
  if (native()) { stt()?.stop?.().catch(() => {}); return; }
  try { hard ? webRec?.abort() : webRec?.stop(); } catch { /* already ended */ }
  if (hard) webRec = null;
}

// leaving the page or the app (another app, the home screen, a locked phone) frees the microphone
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(true); });
  addEventListener('pagehide', () => stopListening(true));
}
