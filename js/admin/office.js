// طفّيها — «الشركة»: the AI team's office floor, live for the owner. Rooms, desks and the team at work;
// click someone to send them a request, the meeting room to answer decisions. The team's tools write
// the office and read the owner's requests and answers (supabase/office.sql).
import { esc, errorText, toast } from './util.js';

const DEP = { 'الإدارة': '#FFD84D', 'استوديو المحتوى': '#FF4FD8', 'النشر والمجتمع': '#3DE0FF', 'البيانات': '#7CFF6B', 'المنتج والبحث': '#9B7BFF', 'النمو': '#FF8A3D' };
const ST = { available: 'متاح', working: 'بيشتغل', waiting_info: 'بستنى معلومات', waiting_you: 'بستنى موافقتك', in_progress: 'قيد العمل', done: 'خلصت' };
const fd = (d) => { try { return new Date(`${d}T12:00:00`).toLocaleDateString('ar-JO-u-nu-latn', { day: 'numeric', month: 'short' }); } catch { return d; } };

// floor plan (viewBox 1600 × 990): rooms and who sits where
const ROOMS = [
  { id: 'boss', name: 'مكتب المدير', x: 20, y: 20, w: 360, h: 300, color: '#FFD84D' },
  { id: 'meet', name: 'قاعة الاجتماعات', x: 400, y: 20, w: 400, h: 300, color: '#FF3B2E', click: 'dec' },
  { id: 'studio', name: 'استوديو المحتوى', x: 820, y: 20, w: 760, h: 300, color: '#FF4FD8' },
  { id: 'ops', name: 'العمليات', x: 20, y: 420, w: 300, h: 250, color: '#FFD84D', click: 'tasks' },
  { id: 'pub', name: 'النشر والمجتمع', x: 340, y: 420, w: 420, h: 250, color: '#3DE0FF' },
  { id: 'data', name: 'البيانات والمعرفة', x: 780, y: 420, w: 420, h: 250, color: '#7CFF6B', click: 'kb' },
  { id: 'prod', name: 'المنتج والبحث', x: 1220, y: 420, w: 360, h: 250, color: '#9B7BFF', click: 'ideas' },
  { id: 'growth', name: 'النمو', x: 20, y: 690, w: 380, h: 280, color: '#FF8A3D', click: 'perf' },
  { id: 'lounge', name: 'الاستراحة', x: 420, y: 690, w: 560, h: 280, color: '#E5A548', click: 'rules' },
  { id: 'reels', name: 'غرفة الريلات', x: 1000, y: 690, w: 580, h: 280, color: '#3DE0FF', click: 'reels' },
];
const SEATS = { samer: [200, 215, 1.1], yazan: [930, 210], heba: [1110, 210], moamen: [1290, 210], dana: [1470, 210], khaled: [170, 585], omar: [460, 585], aya: [640, 585], salma: [900, 585], noor: [1080, 585], rana: [1310, 585], tarek: [1480, 585], leen: [210, 865] };

let D, E, CTX, ANS = [], keyBound = false;

function avatar(e, attrs = '') {
  const a = e.avatar || {}, s = a.skin || '#d9a27a', h = a.hairColor || '#222'; let back = '', front = '', extra = '';
  if (a.cover === 'hijab') { back = `<path d="M14 40c0-14 8-26 18-26s18 12 18 26v14H14z" fill="${a.coverColor}"/>`; front = `<path d="M19 30c1-8 6-13 13-13s12 5 13 13c-3-4-8-6-13-6s-10 2-13 6z" fill="${a.coverColor}"/>`; }
  else if (a.cover === 'shmagh') { back = '<path d="M13 46c0-16 8-29 19-29s19 13 19 29v8H13z" fill="#fff"/><path d="M13 46c0-16 8-29 19-29s19 13 19 29" fill="none" stroke="#E1261C" stroke-width="1.6" stroke-dasharray="2 2.4"/>'; front = '<path d="M18 28c2-8 7-12 14-12s12 4 14 12c-4-2-9-3-14-3s-10 1-14 3z" fill="#fff"/><rect x="17" y="21.5" width="30" height="3.4" rx="1.7" fill="#1B1716"/>'; }
  else if (a.hair === 'long') { back = `<path d="M17 30c0-10 7-16 15-16s15 6 15 16v20H17z" fill="${h}"/>`; front = `<path d="M19 29c1-8 6-12 13-12s12 4 13 12c-5-4-9-5-13-5s-8 1-13 5z" fill="${h}"/>`; }
  else if (a.hair === 'bun') { back = `<circle cx="32" cy="13" r="5" fill="${h}"/>`; front = `<path d="M20 28c1-7 6-11 12-11s11 4 12 11c-4-3-8-4-12-4s-8 1-12 4z" fill="${h}"/>`; }
  else if (a.hair === 'bob') { back = `<path d="M18 30c0-10 6-15 14-15s14 5 14 15v9H18z" fill="${h}"/>`; front = `<path d="M19 29c1-8 6-12 13-12s12 4 13 12c-6-1-10-4-13-7-3 3-7 6-13 7z" fill="${h}"/>`; }
  else if (a.hair === 'curly') front = `<g fill="${h}"><circle cx="22" cy="22" r="4.5"/><circle cx="28" cy="18.5" r="4.5"/><circle cx="35" cy="18.5" r="4.5"/><circle cx="41" cy="22" r="4.5"/></g>`;
  else if (a.hair === 'side') front = `<path d="M20 27c0-7 5-11 12-11s12 4 12 11c-6-4-13-4-18-1z" fill="${h}"/>`;
  else if (a.hair === 'short') front = `<path d="M20 27c0-7 5-11 12-11s12 4 12 11c-3-3-7-4-12-4s-9 1-12 4z" fill="${h}"/>`;
  if (a.cover === 'cap') extra += '<path d="M19 25c0-6 6-10 13-10s13 4 13 10z" fill="#E1261C"/><rect x="30" y="23.5" width="18" height="3" rx="1.5" fill="#A8150F"/>';
  if (a.beard) extra += `<path d="M22 34c1 7 5 11 10 11s9-4 10-11c-2 3-5 4-10 4s-8-1-10-4z" fill="${h}" opacity=".9"/>`;
  if (a.glasses) extra += '<g fill="none" stroke="#1B1716" stroke-width="1.6"><circle cx="27" cy="31" r="3.6"/><circle cx="37" cy="31" r="3.6"/><path d="M30.6 31h2.8"/></g>';
  return `<svg viewBox="0 0 64 64" ${attrs}>${back}<path d="M8 66c0-13 10-20 24-20s24 7 24 20z" fill="${a.shirt || '#333'}"/><rect x="28" y="40" width="8" height="8" rx="3" fill="${s}"/><ellipse cx="32" cy="31" rx="11" ry="12.5" fill="${s}"/>${front}<g fill="#1B1716"><circle cx="27.5" cy="31" r="1.3"/><circle cx="36.5" cy="31" r="1.3"/></g><path d="M28.5 37.5q3.5 2.4 7 0" fill="none" stroke="#7A3B2A" stroke-width="1.3" stroke-linecap="round"/>${extra}</svg>`;
}

// ---------------------------------------------------------------- drawing the floor

const plant = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="18" rx="16" ry="6" fill="rgba(0,0,0,.25)"/><path d="M-12 4h24l-4 16h-16z" fill="#c9734a"/><g fill="#3f9a5a"><ellipse cx="-8" cy="-8" rx="7" ry="14" transform="rotate(-25 -8 -8)"/><ellipse cx="8" cy="-8" rx="7" ry="14" transform="rotate(25 8 -8)"/><ellipse cx="0" cy="-14" rx="7" ry="15"/></g></g>`;

function room(r) {
  const doorX = r.x + r.w / 2 - 30;
  const doorY = r.y < 400 ? r.y + r.h : r.y; // top row opens down to the corridor, others open up
  return `<g class="orm-room${r.click ? ' orm-click' : ''}" ${r.click ? `data-open="${r.click}" tabindex="0" role="button" aria-label="${esc(r.name)}"` : ''}>
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="url(#wood)"/>
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="none" stroke="#1d2233" stroke-width="10"/>
    <rect x="${r.x + 40}" y="${r.y + (r.y < 400 ? r.h - 5 : -5)}" width="${r.w - 80}" height="10" fill="rgba(160,210,255,.38)"/>
    <rect x="${doorX}" y="${doorY - 6}" width="60" height="12" fill="#2b3142"/>
  </g>`;
}
const plate = (r) => `<g class="orm-plate${r.click ? ' orm-click' : ''}" ${r.click ? `data-open="${r.click}"` : ''} transform="translate(${r.x + r.w - 16} ${r.y + 16})"><rect x="-${r.name.length * 13 + 34}" y="0" width="${r.name.length * 13 + 34}" height="34" rx="17" fill="rgba(11,15,30,.88)"/><circle cx="-18" cy="17" r="6" fill="${r.color}"/><text x="-32" y="23" text-anchor="end" class="orm-rname">${esc(r.name)}</text></g>`;

function bubble(e, x, y) {
  if (e.mode !== 'LIVE' && e.status !== 'waiting_you') return `<g transform="translate(${x} ${y})"><rect x="-26" y="-16" width="52" height="26" rx="13" fill="#2b3142"/><text x="0" y="3" text-anchor="middle" class="orm-zz">z z</text></g>`;
  if (e.status === 'waiting_you') return `<g transform="translate(${x} ${y})" class="orm-bob"><path d="M-18 -18h36a6 6 0 0 1 6 6v18a6 6 0 0 1 -6 6h-12l-6 8-6-8h-12a6 6 0 0 1 -6-6v-18a6 6 0 0 1 6-6z" fill="#FF3B2E"/><text x="0" y="5" text-anchor="middle" class="orm-bang">!</text></g>`;
  if (e.status === 'waiting_info') return `<g transform="translate(${x} ${y})" class="orm-bob"><path d="M-18 -18h36a6 6 0 0 1 6 6v18a6 6 0 0 1 -6 6h-12l-6 8-6-8h-12a6 6 0 0 1 -6-6v-18a6 6 0 0 1 6-6z" fill="#FFD84D"/><text x="0" y="5" text-anchor="middle" class="orm-bang" fill="#1B1716">?</text></g>`;
  if (e.status === 'available') return `<g transform="translate(${x} ${y})"><circle r="9" fill="#7CFF6B"/></g>`;
  return `<g transform="translate(${x} ${y})"><path d="M-24 -16h48a6 6 0 0 1 6 6v14a6 6 0 0 1 -6 6h-30l-6 7-2-7h-10a6 6 0 0 1 -6-6v-14a6 6 0 0 1 6-6z" fill="#fff"/><circle cx="-12" cy="-3" r="4" fill="#5A6390" class="orm-dot d1"/><circle cx="0" cy="-3" r="4" fill="#5A6390" class="orm-dot d2"/><circle cx="12" cy="-3" r="4" fill="#5A6390" class="orm-dot d3"/></g>`;
}

function desk(e) {
  const [x, y, s = 1] = SEATS[e.id] || [0, 0];
  const live = e.mode === 'LIVE', on = live && e.status !== 'available';
  const col = DEP[e.dept] || '#fff', first = e.name.split(' ')[0];
  return `<g class="orm-person" data-agent="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.name)}، ${esc(e.role)}، ${esc(ST[e.status] || e.status)}" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="34" rx="96" ry="14" fill="rgba(0,0,0,.25)"/>
    <circle cx="0" cy="-52" r="34" fill="#1f2433"/>
    <g opacity="${live ? 1 : 0.6}">${avatar(e, 'x="-38" y="-96" width="76" height="76"')}</g>
    <rect x="-88" y="-30" width="176" height="60" rx="9" fill="#efe8dc" stroke="#cdbfae" stroke-width="2"/>
    <rect x="-88" y="22" width="176" height="8" rx="4" fill="#d8ccbb"/>
    <rect x="22" y="-24" width="54" height="34" rx="4" fill="#1b1f2c"/>
    <rect x="25" y="-21" width="48" height="28" rx="2" fill="${on ? '#163a4d' : '#0e1018'}" class="${on ? 'orm-screen' : ''}"/>
    ${on ? `<g fill="${col}" opacity=".9"><rect x="29" y="-17" width="26" height="3" rx="1.5"/><rect x="29" y="-11" width="36" height="3" rx="1.5" class="orm-type"/><rect x="29" y="-5" width="18" height="3" rx="1.5"/></g>` : ''}
    <rect x="44" y="10" width="10" height="8" fill="#1b1f2c"/>
    <rect x="-34" y="0" width="52" height="12" rx="3" fill="#cfc4b3"/>
    <g transform="translate(-66 4)"><rect x="-8" y="-8" width="16" height="18" rx="3" fill="#E1261C"/><path d="M8 -3c6 0 6 8 0 8" fill="none" stroke="#E1261C" stroke-width="3"/>${on ? '<path d="M-3 -12c-3-6 3-8 0-14M3 -12c-3-6 3-8 0-14" stroke="rgba(255,255,255,.5)" stroke-width="2" fill="none" class="orm-steam"/>' : ''}</g>
    <g transform="translate(0 50)"><rect x="-64" y="-15" width="128" height="30" rx="15" fill="rgba(11,15,30,.9)" stroke="${col}" stroke-width="2"/><text x="0" y="6" text-anchor="middle" class="orm-name">${esc(first)}</text></g>
    ${bubble(e, 44, -104)}
    <rect x="-96" y="-140" width="192" height="210" fill="transparent" class="orm-hit"/>
  </g>`;
}

function props(D) {
  const pub = (D.reels || []).filter((r) => r.stage === 'published').length, sch = (D.reels || []).filter((r) => r.stage === 'scheduled').length, rev = (D.reels || []).filter((r) => r.stage !== 'published' && r.stage !== 'scheduled').length;
  const dec = (D.decisions || []).length;
  return `
  <!-- manager office: bookshelf, window, sofa -->
  <rect x="40" y="80" width="16" height="180" fill="#5b4636"/><g fill="#c9734a"><rect x="42" y="70" width="12" height="20"/><rect x="42" y="110" width="12" height="26" fill="#3DE0FF"/><rect x="42" y="150" width="12" height="18" fill="#FFD84D"/><rect x="42" y="190" width="12" height="30" fill="#7CFF6B"/></g>
  ${plant(330, 270)} ${plant(70, 290, .8)}
  <!-- meeting room -->
  <ellipse cx="600" cy="190" rx="140" ry="62" fill="#efe8dc" stroke="#cdbfae" stroke-width="3"/>
  ${[-110, -55, 0, 55, 110].map((dx) => `<circle cx="${600 + dx}" cy="112" r="14" fill="#2b3142"/><circle cx="${600 + dx}" cy="268" r="14" fill="#2b3142"/>`).join('')}
  <g class="${dec ? 'orm-glow' : ''}"><rect x="530" y="160" width="140" height="60" rx="12" fill="${dec ? '#FF3B2E' : '#2b3142'}"/><text x="600" y="186" text-anchor="middle" class="orm-sign">${dec ? `${dec} قرارات` : 'ولا قرار'}</text><text x="600" y="208" text-anchor="middle" class="orm-sign2">${dec ? 'اكبس لتجاوب' : 'كله محسوم'}</text></g>
  <!-- studio props: camera tripod, mic, ring light -->
  <g transform="translate(860 90)"><circle r="22" fill="none" stroke="#fff" stroke-width="6" opacity=".8"/><rect x="-3" y="22" width="6" height="40" fill="#555"/></g>
  <g transform="translate(1545 95)"><rect x="-14" y="-10" width="28" height="18" rx="4" fill="#222"/><circle cx="0" cy="-1" r="6" fill="#3DE0FF"/><path d="M0 8l-14 40M0 8l14 40M0 8v40" stroke="#777" stroke-width="3"/></g>
  ${plant(1210, 290, .8)}
  <!-- corridor -->
  <rect x="20" y="330" width="1560" height="80" rx="10" fill="#262c3d"/>
  ${[120, 420, 780, 1120, 1460].map((x) => plant(x, 375, .7)).join('')}
  <text x="800" y="380" text-anchor="middle" class="orm-corr">ممر طفّيها</text>
  <!-- data room: server rack + bookshelf -->
  <g transform="translate(1160 450)"><rect x="-20" y="0" width="34" height="90" rx="4" fill="#1b1f2c"/>${[10, 26, 42, 58, 74].map((y) => `<rect x="-14" y="${y}" width="22" height="8" fill="#2b3142"/><circle cx="4" cy="${y + 4}" r="2" fill="#7CFF6B" class="orm-blink"/>`).join('')}</g>
  <!-- product room whiteboard -->
  <g transform="translate(1250 440)"><rect width="120" height="56" rx="4" fill="#fff"/><path d="M12 40l20-16 18 10 24-20 20 12" stroke="#9B7BFF" stroke-width="4" fill="none"/></g>
  <!-- growth room chart board -->
  <g transform="translate(60 720)"><rect width="140" height="80" rx="6" fill="#fff"/>${[20, 36, 28, 52, 64].map((h, i) => `<rect x="${16 + i * 24}" y="${70 - h}" width="14" height="${h}" fill="#FF8A3D"/>`).join('')}</g>
  ${plant(360, 940)}
  <!-- lounge: sofa, coffee machine, rug, tv -->
  <ellipse cx="700" cy="860" rx="170" ry="60" fill="rgba(229,165,72,.25)"/>
  <rect x="580" y="900" width="240" height="44" rx="18" fill="#7A2A26"/><rect x="580" y="890" width="240" height="20" rx="10" fill="#8f3631"/>
  <g transform="translate(470 760)"><rect width="56" height="70" rx="8" fill="#2b2523"/><rect x="10" y="12" width="36" height="16" rx="3" fill="#E5A548"/><rect x="18" y="44" width="20" height="16" fill="#efe8dc"/><path d="M24 40c-3-5 3-7 0-12" stroke="rgba(255,255,255,.6)" stroke-width="2" fill="none" class="orm-steam"/></g>
  <g transform="translate(700 730)"><rect x="-90" y="0" width="180" height="96" rx="8" fill="#0e1018" stroke="#2b3142" stroke-width="6"/><text x="0" y="58" text-anchor="middle" class="orm-tv">طفّيها</text></g>
  ${plant(940, 730)} ${plant(450, 940, .8)}
  <!-- reels room: wall of screens -->
  ${[['منشورة', pub, '#7CFF6B'], ['مجدولة', sch, '#3DE0FF'], ['للمراجعة', rev, '#FFD84D']].map(([l, n, c], i) => `<g transform="translate(${1060 + i * 175} 750)"><rect width="150" height="190" rx="12" fill="#0e1018" stroke="${c}" stroke-width="3"/><text x="75" y="95" text-anchor="middle" class="orm-big" fill="${c}">${n}</text><text x="75" y="135" text-anchor="middle" class="orm-sign2">ريلات ${l}</text><rect x="20" y="160" width="110" height="8" rx="4" fill="${c}" opacity=".35"/></g>`).join('')}
  `;
}

function floor() {
  const svg = document.getElementById('ormFloor');
  svg.innerHTML = `<defs>
      <pattern id="wood" width="80" height="22" patternUnits="userSpaceOnUse"><rect width="80" height="22" fill="#6e5440"/><rect width="80" height="1.5" fill="rgba(0,0,0,.18)"/><rect x="40" y="0" width="1.5" height="22" fill="rgba(0,0,0,.12)"/></pattern>
    </defs>
    <rect x="0" y="0" width="1600" height="990" rx="18" fill="#141a2b"/>
    ${ROOMS.map(room).join('')}
    ${props(D)}
    ${D.employees.filter((e) => SEATS[e.id]).map(desk).join('')}
    ${ROOMS.map(plate).join('')}`;
}

// ---------------------------------------------------------------- panels

async function send(decision, answer, note) {
  const { error } = await CTX.sb.rpc('tafiha_admin_office_answer', { decision, answer, note });
  if (error) throw error;
  ANS.unshift({ decision, answer, note, picked_up_at: null });
}

function openAgent(id) {
  const e = E[id]; if (!e) return;
  const c = e.card || {}, mine = (D.tasks || []).filter((t) => t.owner === id && t.status !== 'done'), col = DEP[e.dept] || '#fff', first = e.name.split(' ')[0];
  const sent = ANS.filter((a) => a.decision === `to-${id}`);
  const el = document.getElementById('ormAgent');
  el.innerHTML = `<button class="orm-close" data-close>✕ إغلاق</button>
    <div class="orm-top">${avatar(e, 'class="orm-av"')}<div><div style="color:${col}" class="orm-k">${esc(e.dept)}</div><h2 id="ormAName">${esc(e.name)}</h2><div class="orm-muted">${esc(e.role)}</div>
      <div class="orm-chips"><span class="orm-chip" style="color:${e.mode === 'LIVE' ? col : '#8C96BF'}">${e.mode === 'LIVE' ? 'شغّال' : 'تحت التدريب'}</span><span class="orm-chip orm-s-${esc(e.status)}">${esc(ST[e.status] || e.status)}</span></div></div></div>
    <div class="orm-quote">«${esc(e.quote || '')}»</div>
    <div class="orm-sec"><div class="orm-k">شو بيعمل هسّا</div><p>${esc(e.statusNote || '')}</p></div>
    <form class="orm-ask" data-ask>
      <label class="orm-k" for="ormAskTxt">اطلب من ${esc(first)}</label>
      <textarea id="ormAskTxt" maxlength="1000" rows="3" placeholder="مثلًا: جهّزلي 3 أفكار ريلات عن…" required></textarea>
      <button type="submit" class="orm-send">ابعت لـ ${esc(first)}</button>
      <small class="orm-muted">طلبك بيوصل للفريق، و${esc(first)} بيشتغل عليه بالجلسة الجاية على جهازك.</small>
      ${sent.length ? `<div class="orm-sent">${sent.slice(0, 4).map((a) => `<div>✓ ${esc(a.note || a.answer)} <span class="orm-muted">${a.picked_up_at ? '· وصل' : '· بالطريق'}</span></div>`).join('')}</div>` : ''}
    </form>
    <div class="orm-sec"><div class="orm-k">مهامه المفتوحة</div><ul>${mine.length ? mine.map((t) => `<li>${esc(t.title)} <span class="orm-muted">${esc(fd(t.due))}</span></li>`).join('') : '<li>ولا مهمة مفتوحة</li>'}</ul></div>
    <div class="orm-sec"><div class="orm-k">الشخصية وأسلوب الشغل</div><p>${esc(e.personality || '')}</p><p class="orm-muted">${esc(e.style || '')}</p></div>
    ${e.card ? `<div class="orm-sec"><div class="orm-k">بطاقة الموظف</div><dl class="orm-kv"><dt>بيشغّله</dt><dd>${esc(c.trigger)}</dd><dt>بيطلّع</dt><dd>${esc(c.output)}</dd><dt>لحاله</dt><dd>${esc(c.alone)}</dd><dt>بموافقتك</dt><dd>${esc(c.approval)}</dd><dt class="orm-red">ممنوع</dt><dd>${esc(c.never)}</dd></dl></div>` : ''}`;
  el.hidden = false;
  el.querySelector('[data-close]').onclick = () => { el.hidden = true; };
  el.querySelector('[data-ask]').onsubmit = async (ev) => {
    ev.preventDefault();
    const txt = el.querySelector('#ormAskTxt').value.trim(); if (!txt) return;
    const btn = el.querySelector('.orm-send'); btn.disabled = true;
    try { await send(`to-${id}`, 'طلب', txt); toast(`انبعت الطلب لـ ${first}`); openAgent(id); }
    catch (err) { if (CTX.onAuthError(err)) return; toast(errorText(err), true); btn.disabled = false; }
  };
  el.querySelector('#ormAskTxt').focus();
}

function sheet(kind) {
  const s = document.getElementById('ormSheet'), In = document.getElementById('ormSheetIn');
  const who = (id) => esc(E[id]?.name.split(' ')[0] || id);
  let h = '';
  if (kind === 'dec') {
    const done = new Set(ANS.map((a) => a.decision));
    h = `<h2>قاعة الاجتماعات · قراراتك</h2><div class="orm-grid">${(D.decisions || []).map((d) => `<article class="orm-card orm-dec" data-id="${esc(d.id)}"><span class="orm-tag">${esc(d.id)} · ${who(d.by)}</span><h3>${esc(d.title)}</h3><p>${esc(d.detail || '')}</p>${d.disagreement ? `<div class="orm-split"><div><b>${who(d.disagreement.a.who)}</b>${esc(d.disagreement.a.text)}</div><div><b>${who(d.disagreement.b.who)}</b>${esc(d.disagreement.b.text)}</div></div>` : ''}<p>التكلفة: ${esc(d.cost || '—')} · المخاطرة: ${esc(d.risk || '—')}</p>${done.has(d.id) ? '<span class="orm-ok">✓ جاوبت، الفريق بيشوف جوابك بالجلسة الجاية</span>' : `<div class="orm-opts">${(d.options || []).map((o) => `<button type="button" class="orm-opt" data-ans="${esc(o)}">${esc(o)}</button>`).join('')}</div><input class="orm-note" type="text" maxlength="1000" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة">`}</article>`).join('') || '<p>ولا قرار مفتوح.</p>'}</div>`;
  }
  if (kind === 'tasks') {
    const o = { waiting_you: 0, waiting_info: 1, in_progress: 2, working: 2, done: 3 };
    h = `<h2>العمليات · المهام</h2><div class="orm-tbl"><table><thead><tr><th>المهمة</th><th>المسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead><tbody>${[...(D.tasks || [])].filter((t) => t.status !== 'done').sort((a, b) => (o[a.status] ?? 3) - (o[b.status] ?? 3)).map((t) => `<tr><td>${esc(t.title)}${t.blocker ? `<div class="orm-warn">ناقص: ${esc(t.blocker)}</div>` : ''}</td><td>${who(t.owner)}</td><td>${esc(fd(t.due))}</td><td class="orm-s-${esc(t.status)}">${esc(ST[t.status] || t.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const board = (items, cols, fn) => `<div class="orm-cols">${cols.map(([k, l]) => { const it = items.filter((i) => i.stage === k); return `<div class="orm-col"><div class="orm-k">${l} · ${it.length}</div>${it.map(fn).join('') || '<p class="orm-muted">ولا إشي</p>'}</div>`; }).join('')}</div>`;
  if (kind === 'reels') h = '<h2>غرفة الريلات</h2>' + board((D.reels || []).map((r) => ({ ...r, stage: r.stage === 'draft' ? 'review' : r.stage })), [['review', 'للمراجعة'], ['scheduled', 'مجدولة'], ['published', 'منشورة']], (r) => `<div class="orm-card"><span class="orm-tag">${esc(r.style || '')}</span><h3>${esc(r.title)}</h3><p>${esc(r.note || '')}</p></div>`);
  if (kind === 'ideas') h = '<h2>المنتج والبحث · الأفكار</h2>' + board(D.ideas || [], [['proposed', 'مقترحة'], ['review', 'قيد المراجعة'], ['approved', 'معتمدة']], (i) => `<div class="orm-card"><span class="orm-tag">${esc(i.kind || '')} · ${who(i.by)}</span><h3>${esc(i.title)}</h3><p>${esc(i.why || '')}</p></div>`);
  if (kind === 'perf') { const P = D.performance || {}; h = `<h2>النمو · الأداء</h2><div class="orm-card"><h3 class="orm-warn">${esc(P.note || '')}</h3></div><div class="orm-grid">${(P.kpis || []).map((k) => `<div class="orm-card"><b class="orm-dash">—</b><p>${esc(k)}</p></div>`).join('')}</div>`; }
  if (kind === 'kb') { const K = D.knowledge || { latest: [], counts: {} }; h = `<h2>البيانات والمعرفة</h2><div class="orm-grid">${[['مؤكدة', K.counts.confirmed], ['مقترحة', K.counts.proposed], ['معلّقة', K.counts.pending]].map(([l, n]) => `<div class="orm-card"><b class="orm-dash">${esc(n ?? '—')}</b><p>${l}</p></div>`).join('')}</div><div class="orm-tbl"><table><tbody>${(K.latest || []).map((l) => `<tr><td>${esc(fd(l.date))}</td><td>${esc(l.text)}</td><td class="orm-tag">${esc(l.tag)}</td></tr>`).join('')}</tbody></table></div>`; }
  if (kind === 'rules') h = `<h2>الاستراحة · قواعد الشركة</h2><div class="orm-grid">${['أي إشي ما بيرجع، أو فيه مصاري أو وعد للناس: موافقتك أول.', 'ولا حذف، بأي أداة، لأي سبب.', 'كل عملية بتنكتب بسجل العمليات.', '«ما بعرف» واسأل. ولا رقم مخترع.', 'إنت بتوقّف أو بتغيّر أي إشي بأي لحظة.', 'أردني بس، والقاف قاف.', 'ولا تخويف، ولا ادعاء صحي بلا مصدر.'].map((r, i) => `<div class="orm-card"><span class="orm-tag">قاعدة ${i + 1}</span><p>${esc(r)}</p></div>`).join('')}</div>`;
  if (kind === 'feed') h = `<h2>آخر شغل الفريق</h2><div class="orm-feed">${[...(D.feed || [])].reverse().map((f) => { const e = E[f.who]; return e ? `<div class="orm-msg">${avatar(e, 'class="orm-mav"')}<div><b style="color:${DEP[e.dept]}">${esc(e.name.split(' ')[0])}</b> <span class="orm-muted">${esc(fd(f.date))}</span><p>${esc(f.text)}</p></div></div>` : ''; }).join('')}</div>`;
  In.innerHTML = `<button class="orm-close" data-close>✕ إغلاق</button>${h}`;
  s.hidden = false;
  In.querySelector('[data-close]').onclick = () => { s.hidden = true; };
  In.querySelectorAll('[data-ans]').forEach((b) => {
    b.onclick = async () => {
      const card = b.closest('.orm-dec'); const note = card.querySelector('.orm-note')?.value || '';
      card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try { await send(card.dataset.id, b.dataset.ans, note); toast('انبعت جوابك للفريق'); sheet('dec'); }
      catch (err) { if (CTX.onAuthError(err)) return; toast(errorText(err), true); card.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
    };
  });
}

function boot(el, doc) {
  D = doc; E = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  const open = (D.tasks || []).filter((t) => t.status !== 'done').length, dec = (D.decisions || []).length;
  el.innerHTML = `<div class="orm" dir="rtl" lang="ar">
    <div class="orm-bar">
      <div><div class="orm-k">مكتب طفّيها الافتراضي</div><h1>الشركة</h1></div>
      <div class="orm-stats"><span><b>${D.employees.length}</b> موظف</span><span><b>${D.employees.filter((e) => e.mode === 'LIVE').length}</b> شغّالين</span><span><b>${open}</b> مهمة مفتوحة</span><span class="${dec ? 'orm-hot' : ''}"><b>${dec}</b> قرارات</span></div>
      <form class="orm-cmd" data-cmd><input id="ormCmd" type="text" maxlength="1000" placeholder="اطلب من الفريق… وسامر بيوزّع الشغل" aria-label="طلب للفريق"><button type="submit">ابعت</button></form>
    </div>
    <div class="orm-floorwrap"><svg id="ormFloor" viewBox="0 0 1600 990" role="group" aria-label="مكتب الشركة"></svg></div>
    <p class="orm-hint">اكبس على أي موظف لتحكي معه وتبعتله طلب · اكبس على قاعة الاجتماعات لتجاوب القرارات · الغرف بتفتح لوحاتها</p>
    <nav class="orm-dock" aria-label="اللوحات">
      ${[['dec', 'قراراتك', dec, true], ['tasks', 'المهام', open], ['reels', 'الريلات', (D.reels || []).length], ['feed', 'آخر الشغل'], ['ideas', 'الأفكار'], ['perf', 'الأداء'], ['kb', 'المعرفة'], ['rules', 'القواعد']].map(([k, l, n, hot]) => `<button type="button" data-open="${k}">${l}${n != null ? `<span class="${hot && n ? 'hot' : ''}">${n}</span>` : ''}</button>`).join('')}
    </nav>
    <section class="orm-sheet" id="ormSheet" hidden><div class="orm-sheet-in" id="ormSheetIn"></div></section>
    <aside class="orm-agent" id="ormAgent" hidden role="dialog" aria-modal="true" aria-labelledby="ormAName"></aside>
  </div>`;
  floor();
  const root = el.querySelector('.orm');
  const act = (t) => {
    const p = t.closest('[data-agent]'); if (p) return openAgent(p.dataset.agent);
    const r = t.closest('[data-open]'); if (r) return sheet(r.dataset.open);
    return null;
  };
  root.addEventListener('click', (ev) => { if (ev.target.closest('.orm-sheet, .orm-agent, form')) return; act(ev.target); });
  root.querySelector('#ormFloor').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(ev.target); } });
  root.querySelector('[data-cmd]').onsubmit = async (ev) => {
    ev.preventDefault();
    const inp = root.querySelector('#ormCmd'); const txt = inp.value.trim(); if (!txt) return;
    try { await send('to-samer', 'طلب', txt); inp.value = ''; toast('انبعت لسامر، وبيوزّعه عالفريق بالجلسة الجاية'); }
    catch (err) { if (CTX.onAuthError(err)) return; toast(errorText(err), true); }
  };
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !document.getElementById('ormFloor')) return;
      const a = document.getElementById('ormAgent'), s = document.getElementById('ormSheet');
      if (a && !a.hidden) a.hidden = true; else if (s && !s.hidden) s.hidden = true;
    });
  }
}

export async function office(el, ctx) {
  CTX = ctx;
  const { data, error } = await ctx.sb.rpc('tafiha_admin_office');
  if (error) throw error;
  const doc = data?.doc || {};
  if (!doc.employees) { el.innerHTML = '<h1>الشركة</h1><div class="adm-card adm-empty-card"><p>لسا ما وصلت بيانات المكتب. الفريق بيرفعها من جهازك.</p></div>'; return; }
  ANS = data.answers || [];
  boot(el, doc);
}
