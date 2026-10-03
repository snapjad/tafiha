// طفّيها — admin sections. Staff see totals and account details, never a person's health answers.
import { esc, fmtDate, fmtNum, count as plural, ago, ROLE, errorText, confirmDialog, toast } from './util.js';
import { content } from './content.js';

async function call(ctx, name, args = {}) {
  const { data, error } = await ctx.sb.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- numbers

async function stats(el, ctx) {
  const s = await call(ctx, 'tafiha_admin_stats');
  const card = (label, value, note = '') => `<div class="adm-stat"><span class="adm-stat-label">${label}</span><b class="adm-num">${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const pct = (n) => (s.journeys ? `${Math.round((n / s.journeys) * 100)}% من الرحلات` : '');
  const max = Math.max(1, ...s.signups.map((d) => d.n));
  el.innerHTML = `
    <h1>الأرقام</h1>
    <p class="adm-sub">أرقام مجمّعة بس، بدون بيانات أي شخص لحاله.</p>
    <section class="adm-grid">
      ${card('كل الحسابات', fmtNum(s.accounts), `${fmtNum(s.confirmed)} إيميلهم مأكّد`)}
      ${card('حسابات جديدة', fmtNum(s.new7), `آخر 7 أيام · ${fmtNum(s.new30)} آخر 30 يوم`)}
      ${card('نشطين', fmtNum(s.active7), `آخر 7 أيام · ${fmtNum(s.active30)} آخر 30 يوم`)}
      ${card('رحلات بلّشت', fmtNum(s.journeys))}
      ${card('متوسط الأيام بدون دخان', s.medianDays === null ? '—' : fmtNum(s.medianDays), 'للي طافيين هلأ (الوسيط)')}
      ${card('رغبات انسجلت', fmtNum(s.cravings7), 'آخر 7 أيام')}
    </section>
    <h2>وين وصلوا</h2>
    <section class="adm-grid">
      ${card('أسبوع وأكثر', fmtNum(s.over7), pct(s.over7))}
      ${card('شهر وأكثر', fmtNum(s.over30), pct(s.over30))}
      ${card('3 شهور وأكثر', fmtNum(s.over90), pct(s.over90))}
    </section>
    <h2>شو بيتركوا</h2>
    <section class="adm-grid">
      ${card('سجاير', fmtNum(s.cig), pct(s.cig))}
      ${card('فيب', fmtNum(s.vape), pct(s.vape))}
      ${card('أرجيلة', fmtNum(s.argileh), pct(s.argileh))}
      ${card('بدائل نيكوتين', fmtNum(s.nrt), 'علكة أو لزقة')}
      ${card('حاطّين هدف توفير', fmtNum(s.goals))}
    </section>
    <h2>الحسابات الجديدة، آخر 30 يوم</h2>
    <div class="adm-card adm-chart" role="img" aria-label="رسم للحسابات الجديدة بآخر 30 يوم">
      ${s.signups.map((d) => `<span class="adm-bar" style="--h:${Math.round((d.n / max) * 100)}%" title="${esc(fmtDate(d.day))}: ${d.n}"><i></i></span>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- accounts

async function users(el, ctx) {
  let q = '';
  let rows = [];
  let total = 0;
  el.innerHTML = `
    <h1>الحسابات</h1>
    <p class="adm-sub">معلومات الحساب بس. الإجابات الصحية ما بتنشاف هون.</p>
    <div class="adm-toolbar">
      <input class="adm-search" type="search" placeholder="دوّر بالاسم أو الإيميل أو التلفون" aria-label="بحث بالحسابات">
      <span class="adm-count" aria-live="polite"></span>
    </div>
    <div class="adm-list"></div>
    <button class="adm-btn adm-more" hidden>حمّل أكثر</button>`;
  const list = el.querySelector('.adm-list');
  const more = el.querySelector('.adm-more');
  const count = el.querySelector('.adm-count');

  const row = (u) => `
    <article class="adm-card adm-user" data-id="${esc(u.id)}">
      <div class="adm-user-main">
        <b>${esc(u.name || 'بدون اسم')}</b>
        ${u.staff_role ? `<span class="adm-tag">${esc(ROLE[u.staff_role] || u.staff_role)}</span>` : ''}
        ${u.banned ? '<span class="adm-tag adm-tag-bad">موقوف</span>' : ''}
        ${u.confirmed ? '' : '<span class="adm-tag adm-tag-warn">إيميل مش مأكّد</span>'}
        <div class="adm-user-meta" dir="ltr">${esc(u.email || '')}${u.phone ? ` · ${esc(u.phone)}` : ''}</div>
      </div>
      <dl class="adm-user-facts">
        <div><dt>سجّل</dt><dd>${fmtDate(u.created_at)}</dd></div>
        <div><dt>آخر نشاط</dt><dd>${ago(u.active_at || u.last_sign_in_at)}</dd></div>
        <div><dt>يوم الطفي</dt><dd>${fmtDate(u.quit_at)}</dd></div>
        <div><dt>الدخول</dt><dd>${esc((u.providers || []).map((p) => (p === 'email' ? 'إيميل' : p === 'google' ? 'Google' : p)).join('، ') || '—')}</dd></div>
      </dl>
      ${u.staff_role ? '' : `<div class="adm-actions">
        <button class="adm-btn" data-ban="${u.banned ? 'off' : 'on'}">${u.banned ? 'رجّع الحساب' : 'أوقف الحساب'}</button>
        <button class="adm-btn adm-danger-line" data-del>احذف</button>
      </div>`}
    </article>`;

  async function load(reset) {
    const data = await call(ctx, 'tafiha_admin_users', { q, lim: 50, skip: reset ? 0 : rows.length });
    rows = reset ? data.rows : rows.concat(data.rows);
    total = data.total;
    list.innerHTML = rows.length ? rows.map(row).join('') : '<p class="adm-empty">ما في حسابات.</p>';
    count.textContent = total ? plural(total, ['حساب', 'حسابين', 'حسابات', 'حساب']) : '';
    more.hidden = rows.length >= total;
  }

  let timer = 0;
  el.querySelector('.adm-search').addEventListener('input', (ev) => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = ev.target.value.trim(); load(true).catch((e) => ctx.onAuthError(e) || toast(errorText(e), true)); }, 300);
  });
  more.onclick = () => load(false).catch((e) => ctx.onAuthError(e) || toast(errorText(e), true));

  list.addEventListener('click', async (ev) => {
    const card = ev.target.closest('.adm-user');
    const btn = ev.target.closest('button');
    if (!card || !btn) return;
    const u = rows.find((r) => r.id === card.dataset.id);
    try {
      if (btn.dataset.ban) {
        const banning = btn.dataset.ban === 'on';
        const ok = await confirmDialog({
          title: banning ? 'توقيف الحساب' : 'رجوع الحساب',
          body: banning ? `<b>${esc(u.email)}</b> ما رح يقدر يسجّل دخول، وبيطلع من كل أجهزته. بياناته بتضل.` : `<b>${esc(u.email)}</b> رح يقدر يسجّل دخول من جديد.`,
          yes: banning ? 'أوقفه' : 'رجّعه',
          danger: banning,
        });
        if (!ok) return;
        await call(ctx, 'tafiha_admin_user_ban', { target: u.id, banned: banning });
        toast(banning ? 'انوقف الحساب' : 'رجع الحساب');
        await load(true);
      } else if ('del' in btn.dataset) {
        const ok = await confirmDialog({
          title: 'حذف الحساب',
          body: `رح ينحذف حساب <b>${esc(u.email)}</b> ورحلته كاملة، ومش رح نقدر نرجّعهم.`,
          yes: 'احذف نهائياً',
          danger: true,
          type: u.email,
        });
        if (!ok) return;
        await call(ctx, 'tafiha_admin_user_delete', { target: u.id });
        toast('انحذف الحساب');
        await load(true);
      }
    } catch (e) { if (!ctx.onAuthError(e)) toast(errorText(e), true); }
  });

  await load(true);
}

// ---------------------------------------------------------------- team

async function team(el, ctx) {
  const roleOptions = (current) => Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${v}</option>`).join('');
  async function draw() {
    const staff = await call(ctx, 'tafiha_admin_staff');
    el.innerHTML = `
      <h1>الفريق</h1>
      <p class="adm-sub">المدير بيشوف كل شي. الدكتور بيشوف «اسأل دكتور» بس، ومحرر المحتوى بيشوف المحتوى بس. كلهم لازم يفعّلوا التحقق الثنائي.</p>
      <div class="adm-list">
        ${staff.map((s) => `
          <article class="adm-card adm-user" data-id="${esc(s.user_id)}" data-email="${esc(s.email)}">
            <div class="adm-user-main">
              <b>${esc(s.name || s.email)}</b>
              ${s.active ? '' : '<span class="adm-tag adm-tag-bad">موقّف</span>'}
              ${s.totp ? '<span class="adm-tag adm-tag-ok">التحقق الثنائي ✓</span>' : '<span class="adm-tag adm-tag-warn">ما فعّل التحقق الثنائي</span>'}
              <div class="adm-user-meta" dir="ltr">${esc(s.email)}</div>
            </div>
            ${s.user_id === ctx.me.user_id ? '' : `<div class="adm-actions">
              <select class="adm-select" data-role aria-label="الدور">${roleOptions(s.role)}</select>
              <button class="adm-btn" data-toggle>${s.active ? 'وقّف' : 'فعّل'}</button>
              <button class="adm-btn adm-danger-line" data-remove>شيله من الفريق</button>
            </div>`}
          </article>`).join('')}
      </div>
      <h2>ضيف حدا للفريق</h2>
      <form class="adm-card adm-form adm-inline" novalidate>
        <label class="adm-field">إيميل حسابه على طفّيها<input name="email" type="email" dir="ltr" required></label>
        <label class="adm-field">الاسم اللي بيبيّن<input name="name" maxlength="60"></label>
        <label class="adm-field">الدور<select class="adm-select" name="role">${roleOptions('doctor')}</select></label>
        <button class="adm-btn adm-primary" type="submit">ضيف</button>
        <p class="adm-err" role="alert"></p>
        <p class="adm-note">لازم يكون عامل حساب على طفّيها بنفس الإيميل أول.</p>
      </form>`;
    const byId = Object.fromEntries(staff.map((s) => [s.user_id, s]));
    el.querySelectorAll('.adm-user').forEach((card) => {
      const s = byId[card.dataset.id];
      const save = async (role, active) => {
        try {
          await call(ctx, 'tafiha_admin_staff_set', { mail: s.email, new_role: role, name: s.name, is_active: active });
          toast('انحفظ');
          await draw();
        } catch (e) { if (!ctx.onAuthError(e)) toast(errorText(e), true); }
      };
      card.querySelector('[data-role]')?.addEventListener('change', (ev) => save(ev.target.value, s.active));
      card.querySelector('[data-toggle]')?.addEventListener('click', () => save(s.role, !s.active));
      card.querySelector('[data-remove]')?.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'شيله من الفريق', body: `<b>${esc(s.email)}</b> رح يرجع مستخدم عادي.`, yes: 'شيله', danger: true })) return;
        try { await call(ctx, 'tafiha_admin_staff_remove', { target: s.user_id }); toast('انشال من الفريق'); await draw(); }
        catch (e) { if (!ctx.onAuthError(e)) toast(errorText(e), true); }
      });
    });
    const form = el.querySelector('form');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('.adm-err');
      const mail = form.elements.email.value.trim();
      if (!mail) { err.textContent = 'اكتب الإيميل.'; return; }
      try {
        await call(ctx, 'tafiha_admin_staff_set', { mail, new_role: form.elements.role.value, name: form.elements.name.value.trim(), is_active: true });
        toast('انضاف للفريق');
        await draw();
      } catch (e) { if (!ctx.onAuthError(e)) err.textContent = errorText(e); }
    };
  }
  await draw();
}

// ---------------------------------------------------------------- settings

async function settings(el, ctx) {
  const cfg = await call(ctx, 'tafiha_app_config');
  el.innerHTML = `
    <h1>إعدادات التطبيق</h1>
    <div class="adm-card adm-setting">
      <div><b>التسجيل مفتوح</b><p>إذا سكّرته، ما حدا بيقدر يعمل حساب جديد (بالإيميل أو Google). الحسابات الموجودة بتضل شغّالة.</p></div>
      <label class="adm-switch"><input type="checkbox" data-key="signups_open" ${cfg.signups_open ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr">التسجيل مفتوح</span></label>
    </div>
    <div class="adm-card adm-setting">
      <div><b>«اسأل دكتور»</b><p>بتشتغل لما نخلّص خدمة الاستشارة.</p></div>
      <label class="adm-switch"><input type="checkbox" disabled ${cfg.consult_enabled ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr">اسأل دكتور</span></label>
    </div>
    <form class="adm-card adm-setting" data-version>
      <div><b>أقل نسخة مسموحة</b><p>لتطبيقات المتجر: أي نسخة أقدم بتطلب من الشخص يحدّث. فاضي = بدون إجبار.</p></div>
      <div class="adm-inline-field"><input name="v" dir="ltr" placeholder="1.0.0" value="${esc(cfg.min_version || '')}" aria-label="أقل نسخة مسموحة"><button class="adm-btn" type="submit">احفظ</button></div>
    </form>`;
  el.querySelector('[data-key=signups_open]').addEventListener('change', async (ev) => {
    const input = ev.target;
    const value = input.checked;
    if (!value && !await confirmDialog({ title: 'تسكير التسجيل', body: 'ما حدا جديد رح يقدر يعمل حساب لحد ما ترجع تفتحه.', yes: 'سكّر التسجيل', danger: true })) {
      input.checked = true;
      return;
    }
    input.disabled = true;
    try { await call(ctx, 'tafiha_admin_config_set', { k: 'signups_open', v: value }); toast(value ? 'التسجيل مفتوح' : 'التسجيل مسكّر'); }
    catch (e) { input.checked = !value; if (!ctx.onAuthError(e)) toast(errorText(e), true); }
    input.disabled = false;
  });
  el.querySelector('[data-version]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = ev.target.elements.v.value.trim();
    try { await call(ctx, 'tafiha_admin_config_set', { k: 'min_version', v }); toast('انحفظ'); }
    catch (e) { if (!ctx.onAuthError(e)) toast(errorText(e), true); }
  });
}

// ---------------------------------------------------------------- audit log

const ACTION = {
  'user.ban': 'وقّف حساب', 'user.unban': 'رجّع حساب', 'user.delete': 'حذف حساب',
  'staff.set': 'عدّل الفريق', 'staff.remove': 'شال حدا من الفريق', 'config.set': 'غيّر إعداد',
  'content.save': 'حفظ محتوى', 'content.delete': 'حذف محتوى',
};

async function audit(el, ctx) {
  const items = await call(ctx, 'tafiha_admin_audit', { lim: 100 });
  el.innerHTML = `
    <h1>السجل</h1>
    <p class="adm-sub">كل تعديل بلوحة الإدارة: مين عمله ومتى.</p>
    <div class="adm-card adm-log">
      ${items.length ? items.map((x) => `
        <div class="adm-log-row">
          <span class="adm-log-at">${fmtDate(x.at, true)}</span>
          <b>${esc(x.actor || '—')}</b>
          <span>${esc(ACTION[x.action] || x.action)}</span>
          <code dir="ltr">${esc(x.target || '')}${x.details && Object.keys(x.details).length ? ` ${esc(JSON.stringify(x.details))}` : ''}</code>
        </div>`).join('') : '<p class="adm-empty">لسا ما في شي.</p>'}
    </div>`;
}

// ---------------------------------------------------------------- coming next

const soon = (title, text) => async (el) => {
  el.innerHTML = `<h1>${title}</h1><div class="adm-card adm-empty-card"><p>${text}</p></div>`;
};

export const SECTIONS = [
  { id: 'stats', label: 'الأرقام', roles: ['owner'], render: stats },
  { id: 'users', label: 'الحسابات', roles: ['owner'], render: users },
  { id: 'consult', label: 'اسأل دكتور', roles: ['owner', 'doctor'], render: soon('اسأل دكتور', 'طلبات الاستشارة بتبيّن هون لما نخلّص الخدمة.') },
  { id: 'content', label: 'المحتوى', roles: ['owner', 'editor'], render: content },
  { id: 'team', label: 'الفريق', roles: ['owner'], render: team },
  { id: 'settings', label: 'الإعدادات', roles: ['owner'], render: settings },
  { id: 'audit', label: 'السجل', roles: ['owner'], render: audit },
];
