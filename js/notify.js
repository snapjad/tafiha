// طفّيها — reminders on the phone (the Android app). Local notifications only: they're scheduled
// on the device from the journey, so they work offline and nothing about the person leaves the
// phone. On the website this module does nothing; the settings say the reminders live in the app.
//
// Kinds (each can be switched off in the settings):
//   danger      the times the interview said are hard (coffee, after meals, nights…), every day
//   milestones  each health milestone, and the evening before / morning of the quit day
//   daily       the day's message, the patch in the morning, and a nudge after 3 quiet days
//   news        announcements from the team (push, comes later with the store release)
import * as S from './store.js';
import * as Content from './content.js';

const PREFS = 'tafiha.notify';
const DEFAULTS = { danger: true, milestones: true, daily: true, news: true, asked: false };
const DAY = 86400000;
const CHANNEL = 'reminders';

export const native = () => !!globalThis.Capacitor?.isNativePlatform?.();
const plugin = () => globalThis.Capacitor?.Plugins?.LocalNotifications;

export function prefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function setPrefs(change) {
  const next = { ...prefs(), ...change };
  try { localStorage.setItem(PREFS, JSON.stringify(next)); } catch { /* defaults next time */ }
  return next;
}

// The usual time for each trigger from the interview, and what to say then.
export const DANGER = {
  wake: { at: [7, 30], text: 'صباح الخير. أول ساعة بعد الصحيان أصعب وحدة، اشرب كاسة مي قبل أي إشي.' },
  coffee: { at: [9, 0], text: 'وقت القهوة؟ اشربها بمكان جديد، وخلّي إيدك مشغولة بالكاسة.' },
  work: { at: [11, 0], text: 'جاي البريك؟ اطلع مع ناس ما بيدخّنوا، أو خلّيه مشية قصيرة.' },
  meal: { at: [14, 30], text: 'خلّصت أكل؟ قوم عن السفرة، وامضغ علكة أو اغسل سنانك.' },
  bored: { at: [16, 30], text: 'إذا زهقت، عندك 5 دقايق؟ مشي، رسالة لحدا، أو دوش.' },
  car: { at: [17, 30], text: 'بالسيارة؟ حط جنبك علكة أو مكسرات، وشغّل إشي بتحبه.' },
  friends: { at: [20, 0], text: 'طالع مع الشباب؟ خبّرهم إنك تارك، وخلّي معك علكة.' },
  phone: { at: [21, 0], text: 'عالتلفون؟ حط إشي بإيدك الثانية، كاسة مي أو قلم.' },
  night: { at: [22, 30], text: 'السهر من أصعب الأوقات. إذا إجت الرغبة، كبسة «عندي رغبة» وبتعدّي.' },
};

const at = (day, h, m) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d; };
// Reminders never wake anyone: whatever falls between 21:30 and 9:00 moves to 9:00. (The danger
// times are exempt; they are the person's own hard moments, late nights included.)
export function daytime(t) {
  const d = new Date(t);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes >= 21 * 60 + 30) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else if (minutes < 9 * 60) d.setHours(9, 0, 0, 0);
  return d;
}
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Everything to schedule for this journey, from `now` (pure, so it can be tested).
export function plan(state, p = prefs(), now = Date.now()) {
  const list = [];
  if (!state) return list;
  const quitAt = state.quitAt;
  const started = quitAt <= now;
  const add = (id, title, body, schedule, extra = {}) => list.push({ id, title, body, schedule: { allowWhileIdle: true, ...schedule }, extra, channelId: CHANNEL });

  if (p.danger) {
    const triggers = (state.assessment?.triggers || []).filter((t) => DANGER[t]);
    triggers.forEach((t, i) => {
      const [hour, minute] = DANGER[t].at;
      add(3000 + i, 'طفّيها', DANGER[t].text, { on: { hour, minute } }, { open: 'craving' });
    });
  }

  if (p.milestones) {
    if (!started) {
      const eve = at(quitAt - DAY, 20, 0);
      if (eve.getTime() > now) add(1900, 'بكرا يوم الطفي', 'جهّز علكتك، وشيل الولاعات والطفّايات من البيت.', { at: eve });
      const morning = at(quitAt, 9, 0);
      if (morning.getTime() > now && morning.getTime() >= quitAt) add(1901, 'اليوم يوم الطفي', 'إنت قدها. وإذا إجت الرغبة، «عندي رغبة» جاهزة.', { at: morning });
    }
    S.milestonesFor(state).forEach((m, i) => {
      const when = quitAt + m.at;
      if (when <= now + 60000 || when > now + 120 * DAY) return;
      add(1000 + i, `صارلك ${m.name} طافيها`, Content.plain('milestone', m.id, m.text), { at: daytime(when) });
    });
  }

  if (p.daily) {
    for (let d = 0; d < 21; d++) {
      const day = startOfDay(now) + d * DAY;
      const when = at(day, 10, 0);
      if (when.getTime() <= now || when.getTime() < quitAt) continue;
      const n = Math.floor((when.getTime() - quitAt) / DAY) + 1;
      const text = Content.dailyText(n);
      if (text) add(2000 + d, `يوم ${n}`, text, { at: when });
    }
    if (state.patch?.active) add(2100, 'اللزقة', 'حطيت لزقة اليوم؟', { on: { hour: 8, minute: 0 } });
    // a nudge if the app isn't opened for 3 days (moved forward every time it opens)
    add(2200, 'كيف صاير معك؟', 'افتح طفّيها وشوف قديش وفّرت لهلأ.', { at: daytime(now + 3 * DAY) });
  }
  return list;
}

export async function permission() {
  const LN = plugin();
  if (!native() || !LN) return 'unsupported';
  try { return (await LN.checkPermissions()).display; } catch { return 'denied'; }
}

// Shows the system question once the person said yes in the app's own sheet.
export async function ask() {
  const LN = plugin();
  if (!native() || !LN) return 'unsupported';
  setPrefs({ asked: true });
  try { return (await LN.requestPermissions()).display; } catch { return 'denied'; }
}

let chain = Promise.resolve();
// Replaces every scheduled reminder with a fresh set for this journey (calls run one at a time).
export function reschedule(state) {
  chain = chain.then(async () => {
    const LN = plugin();
    if (!native() || !LN || await permission() !== 'granted') return;
    try {
      await LN.createChannel({ id: CHANNEL, name: 'تذكيرات طفّيها', description: 'أوقات الخطر، والإنجازات، ورسالة اليوم', importance: 3, visibility: 1 });
    } catch { /* the channel already exists */ }
    const { notifications: pending } = await LN.getPending();
    if (pending.length) await LN.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    const list = plan(state);
    if (list.length) await LN.schedule({ notifications: list });
  }).catch(() => {});
  return chain;
}

export async function cancelAll() {
  const LN = plugin();
  if (!native() || !LN) return;
  try {
    const { notifications: pending } = await LN.getPending();
    if (pending.length) await LN.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
  } catch { /* nothing scheduled */ }
}

// Tapping a danger-time reminder opens «عندي رغبة».
export function onOpen(handler) {
  const LN = plugin();
  if (!native() || !LN) return;
  LN.addListener('localNotificationActionPerformed', (ev) => handler(ev?.notification?.extra || {}));
}
