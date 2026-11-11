// طفّيها — the virtual guide's face (assets/mentor/mentor-layers.svg, drawn in Claude Design).
// The drawing has one group per eye, brow and mouth shape; this shows one of each at a time, so
// the guide blinks, changes expression and moves his mouth with the voice.
//
//   const m = await createMentor(el);
//   m.mood('smile');            // 'rest' | 'smile' | 'attentive'
//   m.speak(audioElement, ctx); // mouth follows the sound until it ends (ctx: an AudioContext a tap started)
//   m.destroy();

const MOODS = {
  rest: { eyes: 'eyes-open', brows: 'brows-rest', mouth: 'mouth-rest' },
  smile: { eyes: 'eyes-smile', brows: 'brows-smile', mouth: 'mouth-smile' },
  attentive: { eyes: 'eyes-attentive', brows: 'brows-raised', mouth: 'mouth-attentive' },
};
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
let drawing = null;

export async function createMentor(host) {
  drawing ||= fetch(new URL('../assets/mentor/mentor-layers.svg', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error('mentor');
    return r.text();
  });
  // our own file, shipped with the app; parsed as an image document, so nothing in it can run
  const svg = new DOMParser().parseFromString(await drawing, 'image/svg+xml').documentElement;
  svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('mentor');
  host.replaceChildren(svg);

  const pick = (group, id) => {
    for (const g of svg.querySelectorAll(`#${group} > g`)) g.setAttribute('display', g.id === id ? 'inline' : 'none');
  };
  let mood = MOODS.rest, talking = false, blinkTimer = 0, frame = 0, audioCtx = null, alive = true;
  const face = () => { pick('eyes', mood.eyes); pick('brows', mood.brows); if (!talking) pick('mouth', mood.mouth); };
  face();

  function blink() {
    if (!alive) return;
    pick('eyes', 'eyes-closed');
    setTimeout(() => alive && pick('eyes', mood.eyes), 130);
    blinkTimer = setTimeout(blink, 2400 + Math.random() * 3600);
  }
  if (!RM) blinkTimer = setTimeout(blink, 1800);

  // loudness 0…1 → a mouth shape; the wide and round shapes alternate so speech doesn't look like a flap
  let flip = false, lastShape = '';
  function mouthFor(level) {
    const shape = level < 0.06 ? mood.mouth : level < 0.16 ? 'mouth-ee' : (flip ? 'mouth-oo' : 'mouth-aa');
    if (shape !== lastShape) { if (shape === mood.mouth || shape === 'mouth-ee') flip = !flip; lastShape = shape; pick('mouth', shape); }
  }

  function stop() {
    talking = false;
    cancelAnimationFrame(frame);
    lastShape = '';
    face();
  }

  return {
    el: svg,
    mood(name) { mood = MOODS[name] || MOODS.rest; face(); },
    // for sound that isn't an <audio> element: call with the loudness (0…1) as it plays, then quiet()
    level(v) { talking = true; mouthFor(v); },
    quiet: stop,
    speak(audio, ctx) {
      stop();
      if (RM) return;
      try {
        audioCtx = ctx || audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume?.().catch(() => {});
        // one source and analyser per audio element, made once (an element can only be wired once)
        audio.__mentorSource ||= audioCtx.createMediaElementSource(audio);
        if (!audio.__mentorAnalyser) {
          audio.__mentorAnalyser = audioCtx.createAnalyser();
          audio.__mentorAnalyser.fftSize = 256;
          audio.__mentorSource.connect(audio.__mentorAnalyser);
          audio.__mentorAnalyser.connect(audioCtx.destination);
        }
        const an = audio.__mentorAnalyser;
        const buf = new Uint8Array(an.fftSize);
        talking = true;
        let shown = 0;
        const tick = (now) => {
          if (!talking) return;
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) * (v - 128);
          if (now - shown > 70) { shown = now; mouthFor(Math.min(1, Math.sqrt(sum / buf.length) / 40)); } // ~14 shapes a second
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        audio.addEventListener('ended', stop, { once: true });
        audio.addEventListener('pause', stop, { once: true });
      } catch { stop(); }
    },
    destroy() { alive = false; stop(); clearTimeout(blinkTimer); svg.remove(); }, // the sound context is shared; it stays open
  };
}
