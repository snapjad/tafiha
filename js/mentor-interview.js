// طفّيها — the spoken interview with «مرشد طفّيها», the virtual guide.
//
// Same questions, order and rules as the written interview (js/assessment.js decides which
// question comes next and js/plan.js builds the plan). The guide says each question; the person
// answers by voice, by typing or by tapping an answer. A tap or an exact answer is taken here;
// anything else goes to the «mentor» Edge Function, which only maps it onto this question's own
// answers and writes the guide's reply in his own words, or says one fixed sentence when it is
// off topic. The guide's voice is a Jordanian neural voice made by the same function; listening is
// the phone's own, free. Without the server the words stay on screen and taps keep working.
import { buildSteps, choiceOptions, finalize } from './assessment.js';
import { createMentor } from './mentor.js';
import * as Voice from './voice.js';
import { SUPABASE_URL, SUPABASE_ANON, MENTOR_ON } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// on for everyone once MENTOR_ON is set; until then a tester turns it on with localStorage
// (or by opening tafiha.com/?mentor=1 once, which is easier on a phone; ?mentor=0 turns it off)
export function mentorEnabled() {
  if (MENTOR_ON) return true;
  try {
    const q = new URL(location.href).searchParams.get('mentor');
    if (q === '1') localStorage.setItem('tafiha.mentor', '1');
    if (q === '0') localStorage.removeItem('tafiha.mentor');
    return localStorage.getItem('tafiha.mentor') === '1';
  } catch { return false; }
}

// Arabic letters compared loosely: no vowel marks or stretching, one alef, ى = ي, ة = ه
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim();
const AR_DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
const latin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).replace(/٫/g, '.');
const YES = ['اه', 'ايوه', 'اكيد', 'نعم', 'صح', 'يب', 'بلى', 'ايه'];
const NO = ['لا', 'لاء', 'ابدا', 'مش', 'ما في', 'لأ'];

// One question at a time. Number groups («كم سيجارة باليوم» + price + pack size) are asked one by one.
function questions(a) {
  const out = [];
  for (const step of buildSteps(a).slice(1)) {
    if (step.nums) step.items.forEach((it) => out.push({ step, it }));
    else out.push({ step, it: step.items[0] });
  }
  return out;
}
const answered = (it, a) => (it.type === 'multi' ? Array.isArray(a[it.id]) : a[it.id] !== undefined && a[it.id] !== '' && !Number.isNaN(a[it.id]));

function spokenLabel(it, step) {
  if (it.type === 'num' && step.group) return `${step.group}: ${it.label}`;
  return it.label || step.sec.title;
}

// what the server sees: the question and its answers, keyed by position
function serverQuestion(it, step, a) {
  const kind = it.type === 'choice' ? 'choice' : it.type === 'multi' ? 'multi' : it.type === 'scale' ? 'scale' : 'num';
  const opts = it.type === 'choice' ? choiceOptions(it, a) : it.type === 'multi' ? it.options : [];
  return {
    id: it.id,
    label: spokenLabel(it, step),
    ...(it.hint ? { hint: it.hint } : {}),
    kind,
    ...(opts.length ? { options: opts.map(([, l, h], i) => ({ v: String(i), l: h ? `${l} (${h})` : l })) } : {}),
    ...(it.none ? { none: true } : {}),
  };
}

// a reply that needs no server: an answer's own words, yes/no, or a plain number
function localMatch(text, it, a) {
  const t = norm(text);
  if (!t) return null;
  if (it.type === 'num' || it.type === 'scale') {
    const m = latin(text).match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return it.type === 'scale' && (n > 10 || !Number.isInteger(n)) ? null : { number: n };
  }
  const opts = it.type === 'choice' ? choiceOptions(it, a) : it.options;
  const yesno = opts.length === 2 && typeof opts[0][0] === 'boolean';
  if (yesno) {
    if (YES.includes(t)) return { picks: [opts.findIndex(([v]) => v === true)] };
    if (NO.includes(t)) return { picks: [opts.findIndex(([v]) => v === false)] };
  }
  const i = opts.findIndex(([, l]) => norm(l) === t);
  if (i >= 0) return { picks: [i] };
  // a part of one answer said on its own («لا» for «لا، أو ما بينطبق»)
  const parts = opts.map(([, l]) => String(l).split(/[،,(]| أو /).map(norm).filter(Boolean));
  const hits = parts.map((p, k) => (p.includes(t) ? k : -1)).filter((k) => k >= 0);
  if (hits.length === 1) return { picks: hits };
  if (it.type === 'multi' && it.none && norm(it.none) === t) return { picks: [] };
  return null;
}

async function askServer(body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/mentor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(r.status === 429 ? 'busy' : 'server');
  return r.json();
}

export function runMentorInterview(prev = {}) {
  return new Promise(async (resolve) => {
    const a = { ...prev };
    let muted = false, closed = false, listening = false;

    const root = document.createElement('div');
    root.className = 'mentor-room';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'المقابلة مع مرشد طفّيها');
    root.innerHTML = `
      <header class="mr-top">
        <img class="mr-logo" src="assets/brand/tafiha-logo-transparent-light.svg" alt="طفّيها" width="92" height="53">
        <div class="mr-tools">
          <button class="mr-round" type="button" data-mute aria-pressed="false" aria-label="اكتم صوت المرشد"><svg class="ico" aria-hidden="true"><use href="#i-sound"/></svg></button>
          <button class="mr-round" type="button" data-close aria-label="ارجع للأسئلة المكتوبة"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button>
        </div>
      </header>
      <div class="mr-stage"><div class="mr-glow" aria-hidden="true"></div><div class="mr-face"></div></div>
      <p class="mr-say" aria-live="polite"></p>
      <div class="mr-answer"></div>
      <form class="mr-type" hidden>
        <input name="t" maxlength="300" autocomplete="off" placeholder="اكتب جوابك" aria-label="جوابك">
        <button class="btn btn-red" type="submit">ابعت</button>
      </form>
      <div class="mr-controls">
        <button class="mr-mic" type="button" data-mic aria-label="احكي جوابك"><svg class="ico" aria-hidden="true"><use href="#i-mic"/></svg></button>
        <button class="link-btn" type="button" data-typing>اكتب بدل الحكي</button>
      </div>
      <p class="mr-fine">مرشد افتراضي بالذكاء الاصطناعي، مش بديل عن الدكتور.</p>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const $ = (s) => root.querySelector(s);
    const sayEl = $('.mr-say'), answerEl = $('.mr-answer'), typeForm = $('.mr-type'), mic = $('[data-mic]');

    let face = null;
    try { face = await createMentor($('.mr-face')); } catch { $('.mr-stage').hidden = true; }
    const canListen = await Voice.canListen();
    if (!canListen) { mic.hidden = true; $('[data-typing]').hidden = true; typeForm.hidden = false; }

    // the conversation so far, for the guide to read (the last few turns)
    const history = [];
    const remember = (who, text) => { history.push({ who, text: String(text).slice(0, 400) }); if (history.length > 8) history.shift(); };

    // the guide's voice: the same sentence comes back as speech; repeated ones are kept
    const voices = new Map();
    function voiceFor(text) {
      if (!voices.has(text)) {
        const p = fetch(`${SUPABASE_URL}/functions/v1/mentor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
          body: JSON.stringify({ say: text.slice(0, 500) }),
          signal: AbortSignal.timeout(15000),
        }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('voice')))).then((b) => URL.createObjectURL(b));
        p.catch(() => voices.delete(text));
        voices.set(text, p);
      }
      return voices.get(text);
    }

    // shows the sentence, then says it; resolves when he's done (or right away when there's no voice)
    let speaking = null;
    async function say(text, mood = 'rest') {
      sayEl.textContent = text;
      face?.mood(mood);
      remember('guide', text);
      const { player, context } = Voice.sound();
      if (muted || closed || !player) { await sleep(Math.min(2200, 500 + text.length * 30)); return; }
      let url;
      try { url = await voiceFor(text); } catch { return; }
      if (closed || muted) return;
      await new Promise((resolve) => {
        const done = () => { player.onended = player.onerror = null; speaking = null; face?.quiet(); resolve(); };
        speaking = done;
        player.onended = done;
        player.onerror = done;
        player.src = url;
        face?.speak(player, context);
        player.play().catch(done);
      });
    }
    const hush = () => { const { player } = Voice.sound(); player?.pause(); speaking?.(); };

    function leave(result) {
      if (closed) return;
      closed = true;
      hush();
      Voice.stopListening();
      face?.destroy();
      root.classList.add('leave');
      document.body.style.overflow = '';
      setTimeout(() => root.remove(), 400);
      resolve(result);
    }
    $('[data-close]').onclick = () => leave({ __back: true, partial: a });
    $('[data-mute]').onclick = (ev) => {
      muted = !muted;
      ev.currentTarget.setAttribute('aria-pressed', String(muted));
      if (muted) hush();
    };
    $('[data-typing]').onclick = () => { typeForm.hidden = !typeForm.hidden; if (!typeForm.hidden) typeForm.t.focus(); };

    // one reply from the person: a tap, typed words or spoken words
    // a reply given while the guide is still talking waits here until he asks for it
    let settle = null, early = null;
    const reply = () => (early ? Promise.resolve(((v) => { early = null; return v; })(early)) : new Promise((r) => { settle = r; }));
    const give = (v) => { if (settle) { const s = settle; settle = null; s(v); } else early = v; };
    typeForm.onsubmit = (ev) => { ev.preventDefault(); const t = typeForm.t.value.trim(); if (t) { typeForm.t.value = ''; remember('person', t); give({ text: t }); } };
    mic.onclick = async () => {
      if (listening) { Voice.stopListening(); return; }
      hush();
      listening = true;
      mic.classList.add('on');
      face?.mood('attentive');
      const before = sayEl.textContent;
      sayEl.textContent = 'عم بسمعك… احكي، ولما تخلص اسكت ثانية.';
      try {
        const heard = await Voice.listen();
        if (heard) { sayEl.textContent = `«${heard}»`; remember('person', heard); give({ text: heard }); }
        else sayEl.textContent = `ما سمعتك. اكبس المايك واحكي، أو اختار من الأجوبة. (${before})`;
      } catch {
        sayEl.textContent = 'ما في إذن للمايك أو للإملاء. فعّلهم من الإعدادات، أو اكتب أو اختار من الأجوبة.';
        mic.hidden = true;
        typeForm.hidden = false;
      } finally { listening = false; mic.classList.remove('on'); face?.mood('rest'); }
    };

    function showAnswers(it, step) {
      if (it.type === 'choice') {
        answerEl.innerHTML = `<div class="mr-opts">${choiceOptions(it, a).map(([, l], i) => `<button type="button" data-i="${i}">${esc(l)}</button>`).join('')}</div>`;
        answerEl.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => give({ picks: [Number(b.dataset.i)] }); });
      } else if (it.type === 'multi') {
        const on = new Set();
        answerEl.innerHTML = `<div class="mr-opts multi">${it.options.map(([, l], i) => `<button type="button" data-i="${i}" aria-pressed="false">${esc(l)}</button>`).join('')}
          ${it.none ? `<button type="button" data-none aria-pressed="false">${esc(it.none)}</button>` : ''}</div>
          <button class="btn btn-white mr-ok" type="button" data-ok>تمام</button>`;
        answerEl.querySelectorAll('[data-i]').forEach((b) => {
          b.onclick = () => { const i = Number(b.dataset.i); on.has(i) ? on.delete(i) : on.add(i); b.setAttribute('aria-pressed', String(on.has(i))); answerEl.querySelector('[data-none]')?.setAttribute('aria-pressed', 'false'); };
        });
        const none = answerEl.querySelector('[data-none]');
        if (none) none.onclick = () => { on.clear(); answerEl.querySelectorAll('[data-i]').forEach((x) => x.setAttribute('aria-pressed', 'false')); none.setAttribute('aria-pressed', 'true'); give({ picks: [] }); };
        answerEl.querySelector('[data-ok]').onclick = () => { if (on.size || !it.req) give({ picks: [...on] }); };
      } else if (it.type === 'scale') {
        answerEl.innerHTML = `<div class="mr-scale">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-n="${i}">${i}</button>`).join('')}</div>
          <div class="mr-ends"><span>${esc(it.low)}</span><span>${esc(it.high)}</span></div>`;
        answerEl.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => give({ number: Number(b.dataset.n) }); });
      } else if (it.type === 'num') {
        answerEl.innerHTML = `<form class="mr-num"><input type="number" inputmode="decimal" min="0" step="${it.step}" value="${esc(a[it.id] ?? it.value)}" aria-label="${esc(it.label)}"><button class="btn btn-white" type="submit">تمام</button></form>`;
        answerEl.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); give({ number: parseFloat(ev.target.querySelector('input').value) }); };
      } else if (it.type === 'date') {
        const now = Date.now();
        const p = (n) => String(n).padStart(2, '0');
        const local = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
        const def = it.future ? (() => { const d = new Date(now + 7 * 864e5); d.setHours(8, 0, 0, 0); return d.getTime(); })() : now;
        answerEl.innerHTML = `<form class="mr-num"><input type="datetime-local" value="${local(a[it.id] || def)}" ${it.future ? `min="${local(now)}" max="${local(now + 60 * 864e5)}"` : `max="${local(now)}"`} aria-label="${esc(it.label)}"><button class="btn btn-white" type="submit">تمام</button></form>`;
        answerEl.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); give({ date: new Date(ev.target.querySelector('input').value).getTime() }); };
      }
      // dates are picked, not said
      mic.disabled = it.type === 'date';
    }

    // a reply → the answer's value, or a sentence to say before asking again
    async function understand(r, it, step) {
      if (r.date !== undefined) {
        if (!Number.isFinite(r.date)) return { again: 'اختار التاريخ.' };
        if (it.future && r.date <= Date.now()) return { again: 'يوم الإقلاع لازم يكون بالمستقبل.' };
        return { value: r.date };
      }
      let got = r.text === undefined ? r : localMatch(r.text, it, a);
      let said = '';
      if (!got) {
        try {
          const out = await askServer({ q: serverQuestion(it, step, a), text: r.text.slice(0, 400), history: history.slice(0, -1), ...(a.name ? { name: a.name } : {}) });
          if (out.kind !== 'answer') return { again: out.reply, mood: out.kind === 'urgent' ? 'attentive' : 'rest' };
          got = out.picks ? { picks: out.picks.map(Number) } : { number: out.number };
          said = out.reply || '';
        } catch (e) {
          return { again: e.message === 'busy' ? 'في ضغط هلأ. اختار من الأجوبة أو اكتب الجواب بالأرقام.' : 'ما قدرت أفهم هلأ. اختار من الأجوبة.' };
        }
      }
      if (it.type === 'num') {
        if (!(got.number > 0)) return { again: 'بدي رقم أكبر من صفر.' };
        return { value: got.number, said };
      }
      if (it.type === 'scale') return Number.isInteger(got.number) && got.number >= 0 && got.number <= 10 ? { value: got.number, said } : { again: 'اختار رقم من 0 لـ 10.' };
      const opts = it.type === 'choice' ? choiceOptions(it, a) : it.options;
      const values = (got.picks || []).filter((i) => Number.isInteger(i) && opts[i]).map((i) => opts[i][0]);
      if (it.type === 'choice') return values.length === 1 ? { value: values[0], said } : { again: 'اختار جواب واحد.' };
      if (!values.length && !it.none && it.req) return { again: 'اختار شي واحد على الأقل.' };
      return { value: values, said };
    }

    // ---------------------------------------------------------------- the conversation
    const first = String(a.name || '').trim().split(/\s+/)[0];
    if (first) a.name = first;
    else {
      await say('أهلين، أنا مرشد طفّيها، مساعد افتراضي. رح أسألك نفس أسئلة عيادة الإقلاع، وبالآخر بتاخد تقرير وخطة إلك. شو اسمك؟', 'smile');
      answerEl.innerHTML = '';
      while (!closed && !a.name) {
        const r = await reply();
        const n = String(r.text || '').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).pop()?.slice(0, 24) || '';
        if (n.length >= 2) a.name = n;
        else await say('ما لقطت اسمك. احكيه أو اكتبه.');
      }
    }
    if (closed) return;
    await say(`أهلين يا ${a.name}. يلا نبلّش. جاوب بصراحة، وبأي طريقة بتريحك: احكي، أو اكتب، أو اختار.`, 'smile');

    let ack = ''; // his reaction to the last answer, said together with the next question
    for (;;) {
      if (closed) return;
      const next = questions(a).find(({ it }) => !answered(it, a));
      if (!next) break;
      const { it, step } = next;
      showAnswers(it, step);
      await say(ack ? `${ack} ${spokenLabel(it, step)}` : spokenLabel(it, step), ack ? 'smile' : 'rest');
      ack = '';
      for (;;) {
        if (closed) return;
        const got = await understand(await reply(), it, step);
        if (got.again) { await say(got.again, got.mood); continue; }
        a[it.id] = got.value;
        ack = got.said || '';
        break;
      }
    }

    answerEl.innerHTML = '';
    mic.hidden = true;
    await say(`${ack ? `${ack} ` : ''}خلصنا يا ${a.name}. شكراً على صراحتك. هلأ بجهّزلك تقريرك وخطتك.`, 'smile');
    leave(finalize(a));
  });
}
