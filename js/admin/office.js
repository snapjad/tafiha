// طفّيها — «الشركة»: the AI team's office, live for the owner. The team's tools write the document
// (supabase/office.sql); the owner reads it here and answers decisions with one tap.
import { esc, fmtDate, ago, errorText, toast } from './util.js';

const ST = { available: 'متاح', working: 'بيشتغل', waiting_info: 'بستنى معلومات', waiting_you: 'بستنى موافقتك', in_progress: 'قيد العمل', done: 'خلصت' };
const STAGE = [['review', 'للمراجعة'], ['scheduled', 'مجدولة'], ['published', 'منشورة']];
const DEPT_ORDER = ['الإدارة', 'استوديو المحتوى', 'النشر والمجتمع', 'البيانات', 'المنتج والبحث', 'النمو'];

async function call(ctx, name, args = {}) {
  const { data, error } = await ctx.sb.rpc(name, args);
  if (error) throw error;
  return data;
}

const pill = (s) => `<span class="adm-off-pill adm-off-${esc(s)}">${esc(ST[s] || s)}</span>`;

export async function office(el, ctx) {
  const r = await call(ctx, 'tafiha_admin_office');
  const d = r.doc || {};
  if (!d.employees) {
    el.innerHTML = `<h1>الشركة</h1><div class="adm-card adm-empty-card"><p>لسا ما وصلت بيانات المكتب. الفريق بيرفعها من جهازك.</p></div>`;
    return;
  }
  const E = Object.fromEntries(d.employees.map((e) => [e.id, e]));
  const who = (id) => esc(E[id]?.name?.split(' ')[0] || id || '—');
  const open = (d.tasks || []).filter((t) => t.status !== 'done');
  const answered = new Set((r.answers || []).map((a) => a.decision));
  const decisions = (d.decisions || []);
  const live = d.employees.filter((e) => e.mode === 'LIVE').length;
  const depts = DEPT_ORDER.filter((x) => d.employees.some((e) => e.dept === x));
  const order = { waiting_you: 0, waiting_info: 1, in_progress: 2, working: 2 };

  el.innerHTML = `
    <h1>الشركة</h1>
    <p class="adm-sub">فريق طفّيها الذكي. آخر تحديث ${esc(ago(r.updated_at))} · ${esc(fmtDate(r.updated_at, true))}</p>
    <div class="adm-grid">
      <div class="adm-stat"><span class="adm-stat-label">موظفين</span><b class="adm-num">${d.employees.length}</b><small>${live} شغّالين</small></div>
      <div class="adm-stat"><span class="adm-stat-label">مهام مفتوحة</span><b class="adm-num">${open.length}</b><small>${open.filter((t) => t.status === 'waiting_you').length} بستنّوك</small></div>
      <div class="adm-stat"><span class="adm-stat-label">قرارات بتستناك</span><b class="adm-num${decisions.length ? ' adm-off-hot' : ''}">${decisions.length}</b><small>جاوب من تحت</small></div>
      <div class="adm-stat"><span class="adm-stat-label">ريلات مجدولة</span><b class="adm-num">${(d.reels || []).filter((x) => x.stage === 'scheduled').length}</b><small>${(d.reels || []).filter((x) => x.stage === 'published').length} منشورة</small></div>
    </div>

    <h2>قراراتك</h2>
    <div class="adm-off-decs">
      ${decisions.length ? decisions.map((x) => `
        <article class="adm-card adm-off-dec" data-id="${esc(x.id)}">
          <span class="adm-off-tag">${esc(x.id)} · ${who(x.by)}</span>
          <h3>${esc(x.title)}</h3>
          <p class="adm-sub">${esc(x.detail || '')}</p>
          ${x.disagreement ? `<div class="adm-off-split"><div><b>${who(x.disagreement.a.who)}</b>${esc(x.disagreement.a.text)}</div><div><b>${who(x.disagreement.b.who)}</b>${esc(x.disagreement.b.text)}</div></div>` : ''}
          <p class="adm-note">التكلفة: ${esc(x.cost || '—')} · المخاطرة: ${esc(x.risk || '—')}</p>
          ${answered.has(x.id) ? '<p class="adm-off-done">✓ جاوبت، الفريق بيشوف جوابك بالجلسة الجاية.</p>' : `
          <div class="adm-off-opts">${(x.options || []).map((o) => `<button type="button" class="adm-btn" data-ans="${esc(o)}">${esc(o)}</button>`).join('')}</div>
          <input class="adm-input" type="text" maxlength="1000" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة للقرار ${esc(x.id)}">`}
        </article>`).join('') : '<div class="adm-card adm-empty-card"><p>ولا قرار مفتوح.</p></div>'}
    </div>
    ${(r.answers || []).length ? `<details class="adm-card adm-off-hist"><summary>أجوبتك الأخيرة (${r.answers.length})</summary>
      ${r.answers.slice(0, 15).map((a) => `<div class="adm-off-row"><b>${esc(a.decision)}</b><span>${esc(a.answer)}${a.note ? ` · ${esc(a.note)}` : ''}</span><small>${esc(ago(a.at))}${a.picked_up_at ? ' · الفريق شافه' : ''}</small></div>`).join('')}
    </details>` : ''}

    <h2>الفريق</h2>
    <div class="adm-off-depts">
      ${depts.map((dp) => `<section class="adm-card"><h3>${esc(dp)}</h3>
        ${d.employees.filter((e) => e.dept === dp).map((e) => `<div class="adm-off-emp">
          <div><b>${esc(e.name)}</b> <span class="adm-off-mode${e.mode === 'LIVE' ? ' on' : ''}">${e.mode === 'LIVE' ? 'شغّال' : 'تحت التدريب'}</span><br><small>${esc(e.role)}</small></div>
          <div class="adm-off-st">${pill(e.status)}<small>${esc(e.statusNote || '')}</small></div></div>`).join('')}
      </section>`).join('')}
    </div>

    <h2>المهام المفتوحة</h2>
    <div class="adm-card adm-off-tasks">
      ${open.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.due).localeCompare(String(b.due))).map((t) => `
        <div class="adm-off-row"><span>${esc(t.title)}${t.blocker ? `<br><small class="adm-off-warn">ناقص: ${esc(t.blocker)}</small>` : ''}</span><b>${who(t.owner)}</b><small>${esc(fmtDate(t.due))}</small>${pill(t.status)}</div>`).join('') || '<p class="adm-empty">ولا مهمة مفتوحة.</p>'}
    </div>

    <h2>الريلات</h2>
    <div class="adm-off-cols">
      ${STAGE.map(([k, l]) => { const it = (d.reels || []).filter((x) => (x.stage === 'draft' ? 'review' : x.stage) === k);
        return `<section class="adm-card"><h3>${l} <small>${it.length}</small></h3>${it.map((x) => `<div class="adm-off-reel"><b>${esc(x.title)}</b><small>${esc(x.style || '')}</small><p>${esc(x.note || '')}</p></div>`).join('') || '<p class="adm-empty">ولا إشي</p>'}</section>`; }).join('')}
    </div>

    <h2>آخر شغل الفريق</h2>
    <div class="adm-card adm-off-feed">
      ${[...(d.feed || [])].reverse().slice(0, 12).map((f) => `<div class="adm-off-row"><b>${who(f.who)}</b><span>${esc(f.text)}</span><small>${esc(fmtDate(f.date))}</small></div>`).join('') || '<p class="adm-empty">لسا ما في شي.</p>'}
    </div>
    <p class="adm-note">هاد المكتب بيتحدّث من جهازك كل ما الفريق يخلّص شغل. أجوبتك بتنحفظ بالسجل.</p>`;

  el.querySelectorAll('.adm-off-dec [data-ans]').forEach((b) => {
    b.onclick = async () => {
      const card = b.closest('.adm-off-dec');
      const note = card.querySelector('input')?.value || '';
      card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        await call(ctx, 'tafiha_admin_office_answer', { decision: card.dataset.id, answer: b.dataset.ans, note });
        toast('انبعت جوابك للفريق');
        office(el, ctx).catch(() => {});
      } catch (e) {
        if (ctx.onAuthError(e)) return;
        toast(errorText(e), true);
        card.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      }
    };
  });
}
