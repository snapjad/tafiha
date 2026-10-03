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

export function run({ consult = false } = {}) {
  return new Promise((resolve) => {
    const list = screens(consult);
    let idx = 0;
    const covered = [...document.body.children].filter((el) => !['SCRIPT', 'SVG'].includes(el.tagName.toUpperCase()));
    const inertBefore = covered.map((el) => el.inert);
    covered.forEach((el) => { el.inert = true; });

    const root = document.createElement('div');
    root.className = 'intro';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'أهلاً فيك بطفّيها');
    document.body.appendChild(root);

    function finish(v) {
      markSeen();
      root.remove();
      covered.forEach((el, i) => { el.inert = inertBefore[i]; });
      resolve(v);
    }

    function go(to) {
      if (to < 0 || to >= list.length || to === idx) return;
      const dir = to > idx ? 1 : -1;
      idx = to;
      render(dir);
    }

    function render(dir = 0) {
      const s = list[idx];
      root.dataset.theme = s.dark ? 'dark' : 'light';
      root.dataset.screen = s.id;
      const dots = list.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
      root.innerHTML = `
        <div class="intro-screen ${dir > 0 ? 'fwd' : dir < 0 ? 'bwd' : ''}">
          ${s.dark
            ? '<div class="intro-brand"><img src="assets/brand/tafiha-logo-transparent-light.svg" alt="طفّيها" width="132" height="76"></div>'
            : `<div class="intro-top">
                <button class="intro-round" type="button" data-back aria-label="رجوع">${I.back}</button>
                ${s.last ? '' : '<button class="intro-skip" type="button" data-skip>تخطّي</button>'}
              </div>`}
          <div class="intro-main">
            ${s.last ? mark(55) : ''}
            ${s.dark ? `<div class="intro-visual">${s.body}</div>` : ''}
            <h1 class="intro-title" tabindex="-1">${s.title}</h1>
            <p class="intro-sub">${s.sub}</p>
            ${s.dark ? '' : `<div class="intro-body">${s.body}</div>`}
          </div>
          <div class="intro-foot">
            <div class="intro-dots" role="img" aria-label="${idx + 1} من ${list.length}">${dots}</div>
            ${s.last
              ? `<button class="intro-btn" type="button" data-start>ابدأ استشارتك</button>
                 <button class="intro-btn line" type="button" data-login>عندي حساب</button>
                 <p class="intro-fine">بياناتك إلك. ما في إعلانات، وما منبيعها لحدا.</p>`
              : `<button class="intro-btn" type="button" data-next>التالي${I.next}</button>`}
          </div>
        </div>`;
      root.querySelector('[data-next]')?.addEventListener('click', () => go(idx + 1));
      root.querySelector('[data-back]')?.addEventListener('click', () => go(idx - 1));
      root.querySelector('[data-skip]')?.addEventListener('click', () => go(list.length - 1));
      root.querySelector('[data-start]')?.addEventListener('click', () => finish('start'));
      root.querySelector('[data-login]')?.addEventListener('click', () => finish('login'));
      root.querySelector('.intro-title').focus({ preventScroll: true });
    }

    // swipe: in Arabic the next screen comes from the left, so dragging to the right moves on
    let startX = null;
    let startY = 0;
    root.addEventListener('pointerdown', (ev) => { if (ev.isPrimary) { startX = ev.clientX; startY = ev.clientY; } });
    root.addEventListener('pointerup', (ev) => {
      if (startX === null) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      startX = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      go(idx + (dx > 0 ? 1 : -1));
    });
    root.addEventListener('pointercancel', () => { startX = null; });
    root.addEventListener('keydown', (ev) => {
      if (ev.target.closest('button') && (ev.key === 'Enter' || ev.key === ' ')) return;
      if (ev.key === 'ArrowLeft') go(idx + 1);
      else if (ev.key === 'ArrowRight') go(idx - 1);
      else if (ev.key === 'Tab') {
        const items = [...root.querySelectorAll('button')];
        const first = items[0];
        const last = items.at(-1);
        if (ev.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('intro-title'))) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });

    root.classList.toggle('still', RM);
    render();
  });
}
