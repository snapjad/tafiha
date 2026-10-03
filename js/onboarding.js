// طفّيها — the first-launch welcome (design: Claude Design «Tafiha Onboarding», 6 screens).
// Shown once, before the interview. «اسأل دكتور» appears only while the service is switched
// on in the admin area. Resolves 'start' (go to the interview) or 'login' («عندي حساب»).
const SEEN = 'tafiha.intro';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function seen() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(SEEN, '1'); } catch { /* shows again next time */ }
}

// line icons drawn for this screen set, same style as the app's sprite (.ico)
const ico = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const I = {
  next: ico('<use href="#i-arrow"/>'),
  back: ico('<use href="#i-arrow" transform="rotate(180 12 12)"/>'),
  timer: ico('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>'),
  chat: ico('<path d="M4.5 19.5l1.2-3.6A7.8 7.8 0 1 1 8.6 18.6z"/><path d="M9 10.5h6M9 13.5h4"/>'),
  path: ico('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'),
  download: ico('<use href="#i-download"/>'),
  medal: ico('<circle cx="12" cy="14.5" r="5"/><path d="M9 10.2 6.5 3.5h4L12 7l1.5-3.5h4L15 10.2"/>'),
  goal: ico('<path d="M4 15v-2.5a8 8 0 0 1 16 0V15"/><rect x="3.5" y="14" width="4" height="6" rx="1.6"/><rect x="16.5" y="14" width="4" height="6" rx="1.6"/>'),
  story: ico('<use href="#i-story"/>'),
  doctor: ico('<path d="M6.5 3.5V8a3.5 3.5 0 0 0 7 0V3.5"/><path d="M10 11.5V14a4.5 4.5 0 0 0 9 0v-1.5"/><circle cx="19" cy="10.5" r="2"/>'),
  phone: ico('<path d="M6.2 4h2.6l1.4 3.7-1.9 1.4a10.5 10.5 0 0 0 6.6 6.6l1.4-1.9 3.7 1.4v2.6a1.6 1.6 0 0 1-1.7 1.6A15 15 0 0 1 4.6 5.7 1.6 1.6 0 0 1 6.2 4z"/>'),
  video: ico('<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="m15.5 10.5 5-3v9l-5-3"/>'),
  lock: ico('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
};

const mark = (h, dark = true) => `<img class="intro-mark" src="assets/brand/tafiha-mark-transparent-${dark ? 'dark' : 'light'}.svg" alt="" width="${Math.round(h * 128 / 166)}" height="${h}">`;
const step = (n, text, accent = false) => `<li><span class="intro-num${accent ? ' accent' : ''}">${n}</span><span>${text}</span></li>`;
const tip = (icon, text) => `<li><span class="intro-tip-ico">${icon}</span><span>${text}</span></li>`;

function screens(consult) {
  const list = [
    {
      id: 'welcome', dark: true, title: 'أهلاً فيك بطفّيها',
      sub: 'سجاير، فيب، أو أرجيلة؟ بنطفّيها سوا، خطوة خطوة.',
      body: `
        <svg class="intro-hero" viewBox="226 -200 160 216" width="220" height="297" aria-hidden="true">
          <path class="intro-smoke" d="M306 -50 C 298 -78, 318 -98, 306 -124 C 296 -146, 316 -164, 304 -192"/>
          <path d="M269.8 -74.3 A 46 46 0 1 0 342.2 -74.3" fill="none" stroke="#fff" stroke-width="24"/>
          <g transform="rotate(-22 306 -46)">
            <rect x="294" y="-147" width="24" height="36" fill="#E5A548"/>
            <rect x="294" y="-108" width="24" height="50" fill="#fff"/>
            <rect class="intro-ember" x="294" y="-55" width="24" height="15"/>
          </g>
        </svg>
        <div class="intro-chips"><span>سجاير</span><span>فيب</span><span>أرجيلة</span></div>`,
    },
    {
      id: 'plan', title: 'خطة إلك إنت',
      sub: 'أسئلة متل عيادة الإقلاع، وبالآخر بتاخد تقرير وخطة على قدّك.',
      body: `
        <div class="intro-card intro-report">
          <div class="intro-card-head"><b>تقريرك وخطتك</b>${mark(25)}</div>
          <dl>
            <div><dt>مستوى الاعتماد</dt><dd>متوسط <span class="intro-level" aria-hidden="true"><i></i><i></i><i></i></span></dd></div>
            <div><dt>الطريقة</dt><dd>توقف مباشر بيوم محدد</dd></div>
            <div><dt>العلاج البديل</dt><dd>علكة نيكوتين 4mg</dd></div>
            <div><dt>يوم الطفي</dt><dd class="ember">الخميس</dd></div>
          </dl>
          <span class="intro-pill">${I.download}نزّل التقرير PDF</span>
        </div>
        <ul class="intro-tips">
          ${tip(I.timer, 'تقريباً 5 دقايق')}
          ${tip(I.chat, 'أسئلة عن: قديش بتدخن، أول سيجارة بعد ما تصحى، محاولاتك قبل، صحتك وأدويتك، وشو بيحرّك الرغبة عندك')}
          ${tip(I.path, 'الطريقة إلك: توقف مباشر، أو تخفيف تدريجي، وبدائل النيكوتين المناسبة (علكة أو لزقة)')}
        </ul>`,
    },
    {
      id: 'wave', title: 'الرغبة موجة، وبتعدّي',
      sub: 'كبسة وحدة على «عندي رغبة» وبنمرق الموجة سوا.',
      body: `
        <div class="intro-card intro-breath-card">
          <div class="intro-breath">
            <i class="intro-breath-ring" aria-hidden="true"></i>
            <i class="intro-breath-fill" aria-hidden="true"></i>
            <span class="intro-breath-in"><b>شهيق</b><small>4 ثواني</small></span>
            <span class="intro-breath-out"><b>زفير</b><small>6 ثواني</small></span>
          </div>
          <div class="intro-tabbar" aria-hidden="true">
            ${ico('<use href="#i-home"/>')}${ico('<use href="#i-plan"/>')}
            <span class="intro-crave"><i></i><small>عندي رغبة</small></span>
            ${ico('<use href="#i-body"/>')}${ico('<use href="#i-wins"/>')}
          </div>
        </div>
        <ol class="intro-steps">
          ${step(1, 'قيّم رغبتك من 1 لـ 10')}
          ${step(2, 'شو حرّكها؟ (قهوة، توتر، بعد الأكل، مع الشباب…)')}
          ${step(3, 'خطة لهالموقف بالذات')}
          ${step(4, 'موجة 3 دقايق بنفس هادي', true)}
          ${step(5, 'قيّم كمان مرة، وشوف قديش نزلت')}
        </ol>`,
    },
    {
      id: 'days', title: 'كل يوم إلك',
      sub: 'عدّاد أيامك، وقديش وفّرت، وصحتك كيف عم ترجع.',
      body: `
        <div class="intro-card intro-days">
          <span class="intro-label">صارلك طافيها</span>
          <div class="intro-clock"><span><b class="big">12</b>يوم</span><span><b>4</b><small>ساعات</small></span><span><b>37</b><small>دقيقة</small></span></div>
          <div class="intro-duo">
            <div><span><b>34.20</b>دينار</span><small>وفّرت</small></div>
            <div><b>240</b><small>سيجارة ما دخّنتها</small></div>
          </div>
          <div class="intro-mile">
            <p><span class="intro-mile-ico">${I.medal}</span><span><b>أسبوع:</b> عدّيت أصعب أسبوع. الرغبات بتصير أقصر وأبعد عن بعض.</span></p>
            <i class="intro-bar" style="--p:74%"></i>
            <small>الإنجاز الجاي: أسبوعين</small>
          </div>
        </div>
        <div class="intro-row">
          <div class="intro-goal"><span>${I.goal}سماعات: 34 من 120 دينار</span><i class="intro-bar" style="--p:28%"></i></div>
          <span class="intro-share">${I.story}شارك بالستوري</span>
        </div>`,
    },
    consult && {
      id: 'doctor', title: 'اسأل دكتور',
      sub: 'استشارة مجانية مع دكتور مختص، على التلفون أو بـ Google Meet.',
      body: `
        <div class="intro-card intro-doctor">
          <span class="intro-badge">مجانية</span>
          <div class="intro-doc"><span class="intro-doc-ico">${I.doctor}</span><span><b>دكتور مختص</b><small>بالإقلاع عن التدخين</small></span></div>
          <div class="intro-ways"><span>${I.phone}اتصال</span><span>${I.video}Google Meet</span></div>
        </div>
        <p class="intro-label strong">كيف بتشتغل</p>
        <ol class="intro-steps">
          ${step(1, 'اطلب استشارة من التطبيق')}
          ${step(2, 'اختار: اتصال ولا Google Meet، والوقت اللي بيناسبك')}
          ${step(3, 'الدكتور بيتواصل معك، أو بيبعتلك رابط الـ Meet')}
        </ol>
        <p class="intro-note">${I.lock}الدكتور بيشوف ملخص خطتك بس إذا إنت وافقت.</p>`,
    },
    {
      id: 'ready', title: 'جاهز؟', sub: 'بتاخد منك 5 دقايق.', last: true,
      body: `
        <div class="intro-card intro-timeline">
          ${[
            'أسئلة سريعة عنك وعن عادتك',
            'حساب مجاني (بـ Google أو بالإيميل)، حتى تنحفظ خطتك على كل أجهزتك',
            'تقريرك وخطتك، وبتبلّش',
          ].map((t, i) => `<div class="intro-tl${i === 2 ? ' end' : ''}"><span class="intro-num big${i === 2 ? ' ember' : ''}">${i + 1}</span><span>${t}</span></div>`).join('')}
        </div>
        ${consult ? `<p class="intro-soft">${I.doctor}ووقت ما بدك، اسأل دكتور مجاناً.</p>` : ''}`,
    },
  ];
  return list.filter(Boolean);
}

// One page per screen, side by side on a track that follows the finger. In Arabic the next
// screen sits to the left, so dragging to the right moves on. Letting go snaps to the nearest
// screen (a quick flick is enough); the ends resist; the content trails the page slightly.
const SNAP = 'transform 380ms cubic-bezier(.2,.8,.2,1)';

function pageHTML(s, i, list) {
  const dots = list.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('');
  return `
    <section class="intro-page" data-theme="${s.dark ? 'dark' : 'light'}" data-screen="${s.id}" aria-label="${i + 1} من ${list.length}">
      <div class="intro-screen">
        ${s.dark
          ? '<div class="intro-brand"><img src="assets/brand/tafiha-logo-transparent-light.svg" alt="طفّيها" width="132" height="76"></div>'
          : `<div class="intro-top">
              <button class="intro-round" type="button" data-back aria-label="رجوع">${I.back}</button>
              ${s.last ? '' : '<button class="intro-skip" type="button" data-skip>تخطّي</button>'}
            </div>`}
        <div class="intro-main">
          ${s.last ? mark(55) : ''}
          ${s.dark ? `<div class="intro-visual intro-depth">${s.body}</div>` : ''}
          <h1 class="intro-title" tabindex="-1">${s.title}</h1>
          <p class="intro-sub">${s.sub}</p>
          ${s.dark ? '' : `<div class="intro-body intro-depth">${s.body}</div>`}
        </div>
        <div class="intro-foot">
          <div class="intro-dots" aria-hidden="true">${dots}</div>
          ${s.last
            ? `<button class="intro-btn" type="button" data-start>ابدأ استشارتك</button>
               <button class="intro-btn line" type="button" data-login>عندي حساب</button>
               <p class="intro-fine">بياناتك إلك. ما في إعلانات، وما منبيعها لحدا.</p>`
            : `<button class="intro-btn" type="button" data-next>التالي${I.next}</button>`}
        </div>
      </div>
    </section>`;
}

export function run({ consult = false } = {}) {
  return new Promise((resolve) => {
    const list = screens(consult);
    const last = list.length - 1;
    let pos = 0;
    let width = 0;
    const covered = [...document.body.children].filter((el) => !['SCRIPT', 'SVG'].includes(el.tagName.toUpperCase()));
    const inertBefore = covered.map((el) => el.inert);
    covered.forEach((el) => { el.inert = true; });

    const root = document.createElement('div');
    root.className = `intro${RM ? ' still' : ''}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'أهلاً فيك بطفّيها');
    root.innerHTML = `<div class="intro-track">${list.map((s, i) => pageHTML(s, i, list)).join('')}</div>`;
    document.body.appendChild(root);
    const track = root.querySelector('.intro-track');
    const pages = [...track.children];

    // offset: how far the finger has dragged, in px (positive = towards the next screen)
    function place(offset = 0, animate = true) {
      const t = animate && !RM ? SNAP : 'none';
      track.style.transition = t;
      track.style.transform = `translate3d(${pos * width + offset}px, 0, 0)`;
      const f = pos + (width ? offset / width : 0);
      // only the pages next to the current one can be on screen; the rest keep their place
      pages.forEach((p, i) => {
        if (Math.abs(i - pos) > 1 && offset) return;
        p.style.setProperty('--o', Math.max(-1, Math.min(1, i - f)).toFixed(4));
        p.style.setProperty('--snap', t);
      });
    }

    function settle() {
      pages.forEach((p, i) => {
        p.inert = i !== pos;
        if (i !== pos) p.setAttribute('aria-hidden', 'true'); else p.removeAttribute('aria-hidden');
      });
      root.dataset.theme = list[pos].dark ? 'dark' : 'light';
    }

    function go(to, animate = true) {
      const target = Math.max(0, Math.min(last, to));
      const moved = target !== pos;
      pos = target;
      place(0, animate);
      settle();
      if (moved) setTimeout(() => pages[pos].querySelector('.intro-title').focus({ preventScroll: true }), animate && !RM ? 400 : 0);
    }

    function finish(v) {
      markSeen();
      window.removeEventListener('resize', onResize);
      root.remove();
      covered.forEach((el, i) => { el.inert = inertBefore[i]; });
      resolve(v);
    }

    root.addEventListener('click', (ev) => {
      if (dragged) { ev.stopPropagation(); ev.preventDefault(); return; }
      const b = ev.target.closest('button');
      if (!b) return;
      if ('next' in b.dataset) go(pos + 1);
      else if ('back' in b.dataset) go(pos - 1);
      else if ('skip' in b.dataset) go(last);
      else if ('start' in b.dataset) finish('start');
      else if ('login' in b.dataset) finish('login');
    }, true);

    // ---- dragging
    let drag = null;
    let dragged = false;
    track.addEventListener('pointerdown', (ev) => {
      if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: 0, axis: null, trail: [[ev.timeStamp, ev.clientX]] };
      dragged = false;
    });
    track.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'x') {
          try { track.setPointerCapture(ev.pointerId); } catch { /* the pointer already ended */ }
          root.classList.add('dragging');
          dragged = true;
        }
      }
      if (drag.axis !== 'x') return;
      ev.preventDefault();
      // no screen before the first or after the last: the page gives a little and comes back
      const edge = (pos === 0 && dx < 0) || (pos === last && dx > 0);
      drag.dx = edge ? dx / (1 + Math.abs(dx) / (width * 0.25)) * 0.5 : dx;
      drag.trail.push([ev.timeStamp, ev.clientX]);
      if (drag.trail.length > 6) drag.trail.shift();
      place(drag.dx, false);
    });
    const end = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      root.classList.remove('dragging');
      if (d.axis !== 'x') return;
      const [t0, x0] = d.trail[0];
      const [t1, x1] = d.trail[d.trail.length - 1];
      const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0; // px per ms; positive = towards the next screen
      let to = pos;
      if (d.dx > width * 0.22 || (v > 0.35 && d.dx > 0)) to = pos + 1;
      else if (d.dx < -width * 0.22 || (v < -0.35 && d.dx < 0)) to = pos - 1;
      go(to);
      setTimeout(() => { dragged = false; }, 0);
    };
    track.addEventListener('pointerup', end);
    // iOS: once a sideways drag has started, the page must not start scrolling under it
    track.addEventListener('touchmove', (ev) => { if (drag && drag.axis === 'x') ev.preventDefault(); }, { passive: false });
    // if the system takes the touch away mid-drag, finish it like a release instead of freezing
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    root.addEventListener('dragstart', (ev) => ev.preventDefault());

    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft') go(pos + 1);
      else if (ev.key === 'ArrowRight') go(pos - 1);
      else if (ev.key === 'Tab') {
        const items = [...pages[pos].querySelectorAll('button')];
        const first = items[0];
        const lastItem = items.at(-1);
        if (ev.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('intro-title'))) { ev.preventDefault(); lastItem.focus(); }
        else if (!ev.shiftKey && document.activeElement === lastItem) { ev.preventDefault(); first.focus(); }
      }
    });

    function onResize() { width = root.clientWidth; place(0, false); }
    window.addEventListener('resize', onResize);
    width = root.clientWidth;
    place(0, false);
    settle();
    pages[0].querySelector('.intro-title').focus({ preventScroll: true });
  });
}
