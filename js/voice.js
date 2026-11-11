// طفّيها — free speech for the spoken interview: the phone's own voice and its own listening.
// In the Android app: the Text-to-Speech and Speech Recognition plugins (Google's engines on the
// phone, no cost). In a browser: speechSynthesis and SpeechRecognition where the browser has them.
// Everything resolves quietly when a part is missing, so the interview still works by tapping.

const cap = () => globalThis.Capacitor;
const native = () => !!cap()?.isNativePlatform?.();
const tts = () => cap()?.Plugins?.TextToSpeech;
const stt = () => cap()?.Plugins?.SpeechRecognition;
const WebRec = () => window.SpeechRecognition || window.webkitSpeechRecognition;

export function canSpeak() {
  return native() ? !!tts() : 'speechSynthesis' in window;
}

let webVoice;
function arabicVoice() {
  if (webVoice !== undefined) return webVoice;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null; // the list loads late on some browsers; try again next time
  webVoice = all.find((v) => /^ar[-_]JO/i.test(v.lang)) || all.find((v) => /^ar/i.test(v.lang)) || null;
  return webVoice;
}

// resolves when the sentence has been said (or could not be)
export async function speak(text) {
  if (!text) return;
  if (native()) {
    if (!tts()) return;
    try { await tts().speak({ text, lang: 'ar', rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' }); } catch { /* no voice */ }
    return;
  }
  if (!('speechSynthesis' in window)) return;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar';
    const v = arabicVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    const done = () => { clearTimeout(guard); resolve(); };
    const guard = setTimeout(done, 4000 + text.length * 150); // some browsers never fire onend
    u.onend = done;
    u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (native()) tts()?.stop?.().catch(() => {});
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}

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
    rec.lang = 'ar-JO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let heard = '';
    rec.onresult = (ev) => { heard = String(ev.results?.[0]?.[0]?.transcript || '').trim(); };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') reject(Object.assign(new Error('denied'), { code: 'denied' }));
    };
    rec.onend = () => { webRec = null; resolve(heard); };
    try { rec.start(); } catch { resolve(''); }
  });
}

export function stopListening() {
  if (native()) stt()?.stop?.().catch(() => {});
  else webRec?.stop();
}
