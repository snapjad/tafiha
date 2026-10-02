// Validate stored and remote documents before they reach templates or merge logic.
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const fail = () => { throw new Error('Invalid journey data'); };
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const number = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER;
const text = (v) => typeof v === 'string';
function requireValue(ok) { if (!ok) fail(); }
function fields(o, names, test) {
  for (const key of names.split(' ')) if (o[key] !== undefined && o[key] !== null) requireValue(test(o[key]));
}
function list(v, test) { requireValue(Array.isArray(v) && v.every(test)); }

export function assertJSON(value) {
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 30000 || depth > 12) fail();
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'number') { requireValue(number(v)); return; }
    if (typeof v === 'string') { requireValue(v.length <= 4096); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    requireValue(object(v));
    for (const [k, x] of Object.entries(v)) {
      requireValue(!forbidden.has(k) && k.length <= 128);
      if (x !== undefined) visit(x, depth + 1);
    }
  };
  visit(value, 0);
  requireValue(new TextEncoder().encode(JSON.stringify(value)).length <= 262144);
  return value;
}

const numericAnswers = 'cig_perDay cig_packSize cig_packPrice vp_nicotine vp_price vp_days vp_puffs ar_perWeek ar_price gum_mg gum_max gum_price gum_count patch_mg patch_price patch_count importance confidence pastDate futureDate quitAt assessedAt';
const numericKeys = new Set(numericAnswers.split(' '));
const identifier = (v) => text(v) && /^[a-zA-Z0-9_+<>-]{1,64}$/.test(v) && !forbidden.has(v);
export function assertAssessment(a) {
  assertJSON(a);
  requireValue(object(a));
  fields(a, numericAnswers, number);
  for (const [key, value] of Object.entries(a)) {
    if (value == null) continue;
    if (key === 'name') { requireValue(text(value)); continue; }
    if (numericKeys.has(key) || typeof value === 'boolean') continue;
    if (Array.isArray(value)) list(value, identifier);
    else requireValue(identifier(value));
  }
  const enums = {
    nrt_now: ['none', 'gum', 'patch', 'both'], nrt_pref: ['advise', 'none', 'gum', 'patch', 'both'],
    rx: ['none', 'varenicline', 'cytisine', 'bupropion'],
    approach: ['advise', 'abrupt', 'gradual-short', 'gradual-long'],
  };
  for (const [k, values] of Object.entries(enums)) if (a[k] != null) requireValue(values.includes(a[k]));
  if (a.products) list(a.products, (v) => ['cig', 'vape', 'argileh'].includes(v));
  return a;
}

export function assertState(s) {
  if (s === null) return s;
  assertJSON(s);
  requireValue(object(s) && s.v === 1 && text(s.name) && number(s.quitAt));
  requireValue(object(s.habits));
  for (const [kind, keys] of Object.entries({ cig: 'perDay packSize packPrice', vape: 'unitPrice daysPerUnit puffs', argileh: 'perWeek price' })) {
    const h = s.habits[kind];
    requireValue(object(h) && typeof h.active === 'boolean');
    fields(h, keys, number);
    if (h.active) for (const k of keys.split(' ')) requireValue(number(h[k]));
  }
  if (s.habits.vape.kind != null) requireValue(['disposable', 'pod', 'liquid'].includes(s.habits.vape.kind));
  requireValue(object(s.nrt));
  for (const treatment of [s.nrt, s.patch].filter(Boolean)) {
    requireValue(object(treatment) && typeof treatment.active === 'boolean');
    fields(treatment, 'mg packPrice packCount dailyMax hours', number);
    list(treatment.logs, number);
    list(treatment.packs, number);
  }
  if (s.patch?.steps != null) list(s.patch.steps, (v) => object(v) && number(v.mg) && number(v.weeks) && v.weeks >= 0 && v.weeks <= 104);
  if (s.smokes != null) list(s.smokes, number);
  for (const key of ['cravings', 'slips']) {
    list(s[key], (v) => object(v) && number(v.at));
    for (const item of s[key]) {
      fields(item, 'dur before after rounds n', number);
      fields(item, 'trigger outcome', text);
      fields(item, 'gum reset', (v) => typeof v === 'boolean');
    }
  }
  if (s.goal != null) requireValue(object(s.goal) && text(s.goal.title) && number(s.goal.amount));
  if (s.savingsCarryCents != null) requireValue(Number.isSafeInteger(s.savingsCarryCents) && s.savingsCarryCents >= 0);
  if (s.deposits != null) {
    list(s.deposits, (v) => object(v) && typeof v.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.id) && Number.isSafeInteger(v.at) && v.at > 0 && Number.isSafeInteger(v.cents) && v.cents > 0 && v.cents <= 99999999 && (v.note === undefined || (text(v.note) && v.note.length <= 80)));
    requireValue(new Set(s.deposits.map((v) => v.id)).size === s.deposits.length);
  }
  for (const key of ['_t', '_del', 'prep']) if (s[key] != null) {
    requireValue(object(s[key]));
    requireValue(Object.values(s[key]).every(key === 'prep' ? (v) => typeof v === 'boolean' : number));
  }
  if (s.assessment != null) assertAssessment(s.assessment);
  return s;
}

export function assertRemote(row) {
  if (row === null) return row;
  requireValue(object(row) && Number.isSafeInteger(row.rev) && row.rev > 0);
  requireValue(row.data !== null);
  assertState(row.data);
  return row;
}
