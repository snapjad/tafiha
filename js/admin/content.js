// طفّيها — admin: content the app shows (announcements, the day's message, craving plans,
// milestone texts). Owners and content editors; the server checks the role again.
import { esc, fmtDate, errorText, confirmDialog, toast } from './util.js';
import { TRIGGERS } from '../plan.js';
import { MILESTONES } from '../store.js';
import { GENERIC } from '../craving.js';

const TABS = [['announcement', 'الإعلانات'], ['daily', 'رسالة اليوم'], ['craving', 'خطط الرغبة'], ['milestone', 'الإنجازات الصحية']];
const LINK = /^https:\/\/[^\s<>"]+$/;

const localInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (v) => (v ? new Date(v).toISOString() : '');

export async function content(el, ctx) {
  let tab = 'announcement';
  const call = async (name, args) => {
    const { data, error } = await ctx.sb.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const save = (item) => call('tafiha_admin_content_save', { item });
  const remove = (target) => call('tafiha_admin_content_delete', { target });
  const fail = (e) => { if (!ctx.onAuthError(e)) toast(errorText(e), true); };

  async function draw() {
    const items = await call('tafiha_admin_content', { k: tab });
    el.innerHTML = `
      <h1>المحتوى</h1>
      <p class="adm-sub">اللي بتحفظه هون بيبيّن عند الناس أول ما يفتحوا التطبيق، أو خلال نص ساعة.</p>
      <div class="adm-tabs" role="tablist">${TABS.map(([k, v]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${v}</button>`).join('')}</div>
      <div class="adm-tab-body"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw().catch(fail); }; });
    const body = el.querySelector('.adm-tab-body');
    if (tab === 'announcement') announcements(body, items);
    else if (tab === 'daily') daily(body, items);
    else overrides(body, items);
  }

  // ------------------------------------------------ announcements
  function announcements(body, items) {
    const now = Date.now();
    const status = (x) => {
      if (!x.active) return ['موقّف', 'adm-tag-bad'];
      if (x.ends_at && Date.parse(x.ends_at) <= now) return ['خلص', ''];
      if (x.starts_at && Date.parse(x.starts_at) > now) return ['بيبلّش بعدين', 'adm-tag-warn'];
      return ['شغّال هلأ', 'adm-tag-ok'];
    };
    body.innerHTML = `
      <p class="adm-note">بيطلع إعلان واحد بس (الأحدث) فوق الصفحة الرئيسية، والشخص بيقدر يسكّره.</p>
      <div class="adm-list">${items.map((x) => { const [label, cls] = status(x); return `
        <article class="adm-card adm-user" data-id="${esc(x.id)}">
          <div class="adm-user-main"><b>${esc(x.title || 'بدون عنوان')}</b><span class="adm-tag ${cls}">${label}</span></div>
          <p class="adm-preview">${esc(x.body)}</p>
          <dl class="adm-user-facts">
            <div><dt>من</dt><dd>${x.starts_at ? fmtDate(x.starts_at, true) : 'هلأ'}</dd></div>
            <div><dt>لـ</dt><dd>${x.ends_at ? fmtDate(x.ends_at, true) : 'بدون نهاية'}</dd></div>
            ${x.link ? `<div><dt>الرابط</dt><dd dir="ltr">${esc(x.link)}</dd></div>` : ''}
          </dl>
          <div class="adm-actions">
            <button class="adm-btn" type="button" data-edit>عدّل</button>
            <button class="adm-btn" type="button" data-active>${x.active ? 'وقّفه' : 'شغّله'}</button>
            <button class="adm-btn adm-danger-line" type="button" data-del>احذف</button>
          </div>
        </article>`; }).join('') || '<p class="adm-empty">ما في إعلانات.</p>'}</div>
      <h2 data-form-title>إعلان جديد</h2>
      <form class="adm-card adm-form" novalidate>
        <input type="hidden" name="id">
        <label class="adm-field">العنوان (اختياري)<input name="title" maxlength="80"></label>
        <label class="adm-field">النص<textarea name="body" maxlength="600" rows="3" required></textarea></label>
        <div class="adm-two">
          <label class="adm-field">رابط (اختياري، بيبلّش بـ https://)<input name="link" dir="ltr" maxlength="300" placeholder="https://instagram.com/..."></label>
          <label class="adm-field">كلمة الزر<input name="link_label" maxlength="30" placeholder="افتح"></label>
          <label class="adm-field">بيبلّش (اختياري)<input name="starts_at" type="datetime-local"></label>
          <label class="adm-field">بيخلص (اختياري)<input name="ends_at" type="datetime-local"></label>
        </div>
        <p class="adm-err" role="alert"></p>
        <div class="adm-actions"><button class="adm-btn adm-primary" type="submit">احفظ الإعلان</button><button class="adm-btn" type="reset">فضّي</button></div>
      </form>`;
    const form = body.querySelector('form');
    const title = body.querySelector('[data-form-title]');
    const byId = Object.fromEntries(items.map((x) => [x.id, x]));
    form.onreset = () => { form.elements.id.value = ''; title.textContent = 'إعلان جديد'; };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      const err = form.querySelector('.adm-err');
      const link = f.link.value.trim();
      if (!f.body.value.trim()) { err.textContent = 'اكتب نص الإعلان.'; return; }
      if (link && !LINK.test(link)) { err.textContent = 'الرابط لازم يبلّش بـ https://'; return; }
      if (f.starts_at.value && f.ends_at.value && f.ends_at.value <= f.starts_at.value) { err.textContent = 'وقت النهاية لازم يكون بعد البداية.'; return; }
      const old = byId[f.id.value];
      try {
        await save({
          kind: 'announcement', id: f.id.value || null, title: f.title.value.trim(), body: f.body.value.trim(),
          link, link_label: f.link_label.value.trim(), starts_at: toIso(f.starts_at.value), ends_at: toIso(f.ends_at.value),
          active: old ? old.active : true,
        });
        toast('انحفظ الإعلان');
        await draw();
      } catch (e) { if (!ctx.onAuthError(e)) err.textContent = errorText(e); }
    };
    body.querySelectorAll('.adm-user').forEach((card) => {
      const x = byId[card.dataset.id];
      card.querySelector('[data-edit]').onclick = () => {
        const f = form.elements;
        f.id.value = x.id; f.title.value = x.title; f.body.value = x.body; f.link.value = x.link; f.link_label.value = x.link_label;
        f.starts_at.value = localInput(x.starts_at);
        f.ends_at.value = localInput(x.ends_at);
        title.textContent = 'تعديل الإعلان';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        f.body.focus({ preventScroll: true });
      };
      card.querySelector('[data-active]').onclick = async () => {
        try { await save({ ...x, kind: 'announcement', active: !x.active }); toast(x.active ? 'توقّف الإعلان' : 'اشتغل الإعلان'); await draw(); } catch (e) { fail(e); }
      };
      card.querySelector('[data-del]').onclick = async () => {
        if (!await confirmDialog({ title: 'حذف الإعلان', body: 'رح ينحذف الإعلان من التطبيق عند الكل.', yes: 'احذف', danger: true })) return;
        try { await remove(x.id); toast('انحذف'); await draw(); } catch (e) { fail(e); }
      };
    });
  }

  // ------------------------------------------------ the day's message
  function daily(body, items) {
    const byDay = Object.fromEntries(items.map((x) => [Number(x.key), x]));
    const last = Math.max(30, ...items.map((x) => Number(x.key)));
    const days = Array.from({ length: last }, (_, i) => i + 1);
    body.innerHTML = `
      <p class="adm-note">سطر قصير بيبيّن تحت العدّاد حسب رقم اليوم بالرحلة (يوم 1 = يوم الطفي). اليوم الفاضي ما بيبيّن فيه إشي.</p>
      <div class="adm-card adm-rows">${days.map((d) => { const x = byDay[d]; return `
        <form class="adm-row" data-day="${d}" novalidate>
          <span class="adm-row-key">يوم ${d}</span>
          <input name="body" maxlength="140" value="${esc(x?.body || '')}" placeholder="فاضي" aria-label="رسالة يوم ${d}">
          <button class="adm-btn" type="submit">احفظ</button>
        </form>`; }).join('')}</div>
      <form class="adm-card adm-form adm-inline" data-add novalidate>
        <label class="adm-field">ضيف رسالة ليوم بعد ${last}<input name="day" type="number" min="1" max="999" inputmode="numeric"></label>
        <label class="adm-field">الرسالة<input name="body" maxlength="140"></label>
        <button class="adm-btn adm-primary" type="submit">ضيف</button>
      </form>`;
    body.querySelectorAll('[data-day]').forEach((form) => {
      const d = form.dataset.day;
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const text = form.elements.body.value.trim();
        try {
          if (text) await save({ kind: 'daily', key: d, body: text });
          else if (byDay[d]) await remove(byDay[d].id);
          else return;
          toast(text ? `انحفظت رسالة يوم ${d}` : `انشالت رسالة يوم ${d}`);
          await draw();
        } catch (e) { fail(e); }
      };
    });
    const add = body.querySelector('[data-add]');
    add.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = Number(add.elements.day.value);
      const text = add.elements.body.value.trim();
      if (!Number.isInteger(d) || d < 1 || d > 999 || !text) { toast('اكتب رقم اليوم والرسالة.', true); return; }
      try { await save({ kind: 'daily', key: String(d), body: text }); toast(`انحفظت رسالة يوم ${d}`); await draw(); } catch (e) { fail(e); }
    };
  }

  // ------------------------------------------------ craving plans and milestone texts
  function overrides(body, items) {
    const isCraving = tab === 'craving';
    const defaults = isCraving
      ? [...TRIGGERS.map((t) => ({ key: t.id, label: t.label, text: t.plan })), { key: 'other', label: 'سبب ثاني', text: GENERIC }]
      : MILESTONES.map((m) => ({ key: m.id, label: `${m.name} · ${m.smoke ? 'سجاير وأرجيلة' : m.vapeOnly ? 'فيب بس' : 'الكل'}`, text: m.text }));
    const byKey = Object.fromEntries(items.map((x) => [x.key, x]));
    body.innerHTML = `
      ${isCraving
        ? '<p class="adm-note">الخطة اللي بتطلع بـ «عندي رغبة» لكل سبب، وبتقرير الشخص كمان. إذا ما عدّلت، بيضل النص الأصلي.</p>'
        : '<div class="adm-card adm-warn"><b>معلومات صحية.</b> أي تعديل هون لازم يمرق على الأخصائي قبل ما تحفظه. خلّي الصياغة عامة ومن مصادر موثوقة، متل منظمة الصحة العالمية.</div>'}
      <div class="adm-list">${defaults.map((d) => { const x = byKey[d.key]; return `
        <form class="adm-card adm-form" data-key="${esc(d.key)}" novalidate>
          <div class="adm-user-main"><b>${esc(d.label)}</b>${x ? '<span class="adm-tag adm-tag-warn">معدّل</span>' : ''}</div>
          <textarea name="body" rows="2" maxlength="600" aria-label="${esc(d.label)}">${esc(x?.body || d.text)}</textarea>
          ${x ? `<p class="adm-note">الأصلي: ${esc(d.text)}</p>` : ''}
          <div class="adm-actions">
            <button class="adm-btn adm-primary" type="submit">احفظ</button>
            ${x ? '<button class="adm-btn" type="button" data-reset>رجّع الأصلي</button>' : ''}
          </div>
        </form>`; }).join('')}</div>`;
    body.querySelectorAll('[data-key]').forEach((form) => {
      const key = form.dataset.key;
      const d = defaults.find((x) => x.key === key);
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const text = form.elements.body.value.trim();
        if (!text) { toast('النص فاضي.', true); return; }
        try {
          if (text === d.text) { if (byKey[key]) await remove(byKey[key].id); } else await save({ kind: tab, key, body: text });
          toast('انحفظ');
          await draw();
        } catch (e) { fail(e); }
      };
      form.querySelector('[data-reset]')?.addEventListener('click', async () => {
        try { await remove(byKey[key].id); toast('رجع النص الأصلي'); await draw(); } catch (e) { fail(e); }
      });
    });
  }

  await draw();
}
