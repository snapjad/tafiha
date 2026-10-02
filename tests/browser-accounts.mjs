// UI integration checks against a local preview with a mocked auth transport.
// Live Supabase behavior is checked separately by live-accounts.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createState } from '../js/store.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.connectOverCDP(process.env.TAFIHA_CDP);
const output = '.qa';
await mkdir(output, { recursive: true });
const base = process.env.TAFIHA_PREVIEW || 'http://127.0.0.1:5186';
const user = { id: 'qa-account', email: 'qa@example.com', user_metadata: { full_name: 'مستخدم التجربة', phone: '+962791234567', phone_country: 'JO' } };
const journey = createState({ name: 'مستخدم التجربة', habits: ['vape'], quitAt: Date.now() - 3 * 86400000, nrt: { mg: 4 } });
const errors = [];
const contexts = [];

const sdk = `(() => {
  let user = JSON.parse(localStorage.getItem('qaSession') || 'null');
  const listeners = [];
  const emit = (event) => listeners.forEach((fn) => fn(event, user ? {user} : null));
  const login = () => { user = ${JSON.stringify(user)}; localStorage.setItem('qaSession', JSON.stringify(user)); emit('SIGNED_IN'); return {data: {user, session: {user}}}; };
  window.supabase = {createClient: () => ({
    auth: {
      getSession: async () => ({data: {session: user ? {user} : null}}),
      onAuthStateChange: (fn) => { listeners.push(fn); return {data: {subscription: {unsubscribe(){}}}}; },
      signUp: async (args) => { window.qaSignups = (window.qaSignups || 0) + 1; window.qaSignup = args; return login(); },
      signInWithPassword: async (args) => { window.qaLogins = (window.qaLogins || 0) + 1; return args.password === 'wrong' ? {error:{code:'invalid_credentials'}} : login(); },
      signInWithOAuth: async () => ({error:{message:'network'}}),
      resetPasswordForEmail: async (email) => { window.qaReset = email; return {}; },
      resend: async () => ({}),
      verifyOtp: async (args) => { window.qaCode = args.token; return login(); },
      updateUser: async (args) => { if(args.password && window.qaPasswordErrorOnce) {window.qaPasswordErrorOnce=false; return {error:{code:'weak_password'}};} if(args.data) user.user_metadata = {...user.user_metadata,...args.data}; if(args.password) window.qaPasswordChanged = true; localStorage.setItem('qaSession',JSON.stringify(user)); return {data:{user}}; },
      signOut: async () => { user = null; localStorage.removeItem('qaSession'); emit('SIGNED_OUT'); return {}; },
    },
    rpc: (name,args={}) => { const run = async () => {
      if(window.qaOffline) return {error:{message:'offline'}};
      const state = JSON.parse(localStorage.getItem('qaRemote') || 'null');
      if(name === 'tafiha_me_pull' || name === 'tafiha_pull') return {data:state};
      if(name === 'tafiha_me_delete') {localStorage.removeItem('qaRemote'); return {data:null};}
      if(name.endsWith('push')) {
        if(state && state.rev !== args.base) return {data:-1};
        const rev = (state?.rev || 0)+1;
        localStorage.setItem('qaRemote',JSON.stringify({data:args.d,rev})); return {data:rev};
      }
      return {data:null};
    }; return {abortSignal:run, then:(resolve,reject)=>run().then(resolve,reject)}; },
    channel: () => { const ch = {on:()=>ch,subscribe:()=>ch,send:()=>{}}; return ch; },
    removeChannel:()=>{},
  })};
})();`;

async function pageFor({ signedIn = false, guest = null, width = 390, height = 844, reducedMotion = 'no-preference', google = false, offline = false, cached = false, suffix = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  contexts.push(context);
  await context.route('**/js/vendor/supabase.js', (route) => route.fulfill({ contentType: 'text/javascript', body: sdk }));
  await context.route('https://*.supabase.co/**', (route) => {
    if (route.request().url().includes('/auth/v1/settings')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { google } }) });
    return route.abort();
  });
  await context.addInitScript(({ signedIn, guest, user, journey, offline, cached }) => {
    window.qaOffline = offline;
    if (localStorage.getItem('qaInitialized')) return;
    localStorage.setItem('qaInitialized', '1');
    if (signedIn) {
      localStorage.setItem('qaSession', JSON.stringify(user));
      localStorage.setItem('qaRemote', JSON.stringify({ data: journey, rev: 1 }));
      if (cached) localStorage.setItem('tafiha.v1:qa-account', JSON.stringify(journey));
    }
    if (guest) {
      localStorage.setItem('tafiha.v1', JSON.stringify(guest));
      localStorage.setItem('tafiha.sync', JSON.stringify({key:'qa-legacy-key',rev:1}));
    }
  }, { signedIn, guest, user, journey, offline, cached });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + suffix);
  return page;
}
async function layout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.querySelector('.auth')?.getAnimations({subtree:true}).map((a) => a.finished) || []);
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page overflow');
  assert.equal(await page.locator('img').evaluateAll((images) => images.filter((img) => img.getClientRects().length && !img.closest('[hidden]')).every((img) => img.complete && img.naturalWidth > 0)), true, 'Visible images load');
  const tooWide = await page.locator('.auth input, .auth button, .auth h1, .auth .sub').evaluateAll((els) => els.filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map((el) => el.className));
  assert.deepEqual(tooWide, []);
}

try {
  const page = await pageFor({ google: true });
  await page.getByRole('button', { name: 'عندي حساب، سجّل دخول', exact: true }).click();
  await page.getByRole('button', { name: 'حساب جديد', exact: true }).click();
  await page.getByRole('button', { name: 'أنشئ حسابي', exact: true }).waitFor();
  await page.getByRole('button', { name: 'المتابعة مع Google' }).waitFor();
  await layout(page);
  await page.screenshot({ path: `${output}/signup-mobile.png`, fullPage: true });
  await page.getByRole('button', { name: 'أنشئ حسابي', exact: true }).click();
  assert.equal(await page.locator('#au-name').getAttribute('aria-invalid'), 'true');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'عندي حساب', exact: true }).click();
    await page.getByRole('button', { name: 'حساب جديد', exact: true }).click();
  }
  await page.getByLabel('اسمك', { exact: true }).fill('مستخدم التجربة');
  await page.getByLabel('رقم تلفونك').fill('٠٧٩١٢٣٤٥٦٧');
  await page.getByLabel('إيميلك').fill('qa@example.com');
  await page.getByLabel('كلمة السر', { exact: true }).fill('Test-only-password!');
  await page.getByRole('button', { name: 'أظهر كلمة السر' }).click();
  assert.equal(await page.locator('#au-pass').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'أنشئ حسابي', exact: true }).click();
  await page.getByRole('heading', { name: 'خلّينا نتعرّف عليك' }).waitFor();
  assert.equal(await page.evaluate(() => window.qaSignups), 1, 'Tab switches must not duplicate submissions');
  assert.equal(await page.evaluate(() => window.qaSignup.options.data.phone), '+962791234567');
  console.log('PASS signup validation, Arabic phone, password reveal and single submission');

  const login = await pageFor({ width: 1440, height: 900 });
  await login.getByRole('button', { name: 'عندي حساب، سجّل دخول', exact: true }).click();
  await layout(login);
  await login.screenshot({ path: `${output}/login-desktop.png`, fullPage: true });
  await login.getByLabel('إيميلك').fill('qa@example.com');
  await login.getByLabel('كلمة السر', { exact: true }).fill('wrong');
  await login.getByRole('button', { name: 'سجّل دخول', exact: true }).click();
  await login.getByText('الإيميل أو كلمة السر غلط.', { exact: true }).waitFor();
  await login.getByRole('button', { name: 'نسيت كلمة السر؟' }).click();
  await login.getByRole('button', { name: 'ابعتلي رسالة الاستعادة' }).click();
  await login.getByLabel('الرمز', { exact: true }).fill('۱۲٣٤٥٦');
  await login.getByLabel('كلمة السر الجديدة', { exact: true }).fill('Test-new-password!');
  await login.evaluate(() => { window.qaPasswordErrorOnce = true; });
  await login.getByRole('button', { name: 'غيّر كلمة السر', exact: true }).click();
  await login.getByRole('heading', { name: 'كلمة سر جديدة', exact: true }).waitFor();
  await login.getByLabel('كلمة السر الجديدة', { exact: true }).fill('Test-stronger-password!');
  await login.getByRole('button', { name: 'احفظ كلمة السر', exact: true }).click();
  await login.getByRole('heading', { name: 'خلّينا نتعرّف عليك' }).waitFor();
  assert.equal(await login.evaluate(() => window.qaCode), '123456');
  assert.equal(await login.evaluate(() => window.qaPasswordChanged), true);
  console.log('PASS invalid login, recovery flow and Arabic OTP');

  const legacy = createState({ name: 'الرحلة القديمة', habits: ['vape'], quitAt: journey.quitAt, nrt: {} });
  legacy.nrt.logs.push(Date.now());
  const migrated = await pageFor({ signedIn: true, guest: legacy });
  await migrated.getByRole('button', { name: 'أضف رحلتي للحساب' }).click();
  await migrated.locator('body:not(.booting)').waitFor();
  assert.equal(await migrated.evaluate(() => localStorage.getItem('tafiha.v1')), null);
  assert.equal(await migrated.evaluate(() => localStorage.getItem('tafiha.sync')), null, 'Imported guest cannot reappear after logout');
  assert.equal(await migrated.evaluate(() => JSON.parse(localStorage.getItem('tafiha.v1:qa-account')).nrt.logs.length), 1);
  await migrated.getByRole('button', { name: 'حسابي', exact: true }).click();
  await migrated.getByLabel('اسمك', { exact: true }).fill('الاسم الجديد');
  await migrated.getByRole('button', { name: 'احفظ التعديلات' }).click();
  await migrated.getByText('انحفظت معلومات حسابك', { exact: true }).waitFor();
  await migrated.screenshot({ path: `${output}/account-mobile.png`, fullPage: true });
  await migrated.getByRole('button', { name: 'سجّل خروج', exact: true }).click();
  await migrated.getByRole('button', { name: 'عندي حساب، سجّل دخول', exact: true }).waitFor();
  assert.equal(await migrated.evaluate(() => localStorage.getItem('qaSession')), null);
  assert.equal(await migrated.evaluate(() => localStorage.getItem('tafiha.v1:qa-account')), null, 'Synced health data removed on logout');
  console.log('PASS legacy import, profile edit and logout');

  const remove = await pageFor({ signedIn: true });
  await remove.locator('body:not(.booting)').waitFor();
  await remove.getByRole('button', { name: 'حسابي', exact: true }).click();
  await remove.getByRole('button', { name: 'احذف حسابي وبياناتي' }).click();
  await remove.getByRole('button', { name: 'احتفظ بحسابي' }).click();
  assert.ok(await remove.evaluate(() => localStorage.getItem('qaSession')));
  await remove.getByRole('button', { name: 'احذف حسابي وبياناتي' }).click();
  await remove.getByRole('button', { name: 'احذف حسابي نهائياً' }).click();
  await remove.getByRole('button', { name: 'عندي حساب، سجّل دخول', exact: true }).waitFor();
  assert.equal(await remove.evaluate(() => localStorage.getItem('tafiha.v1:qa-account')), null);
  assert.equal(await remove.evaluate(() => localStorage.getItem('qaRemote')), null);
  console.log('PASS deletion cancel, confirm, local and remote cleanup');

  const offline = await pageFor({ signedIn: true, cached: true, offline: true });
  await offline.locator('body:not(.booting)').waitFor();
  await offline.getByRole('button', { name: 'حسابي', exact: true }).click();
  await offline.getByRole('button', { name: 'احفظ التعديلات' }).waitFor();
  await offline.keyboard.press('Shift+Tab');
  assert.equal(await offline.evaluate(() => document.querySelector('#sheet').contains(document.activeElement)), true);
  await offline.keyboard.press('Escape');
  await offline.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal(await offline.evaluate(() => document.activeElement.id), 'openAccount');
  const unavailable = await pageFor({ signedIn: true, offline: true });
  await unavailable.getByRole('heading', { name: 'ما قدرنا نجيب رحلتك' }).waitFor();
  assert.equal(await unavailable.locator('.onb:not(.auth)').count(), 0, 'Failed sync must not start a replacement assessment');
  const recovery = await pageFor({ signedIn: true, suffix: '/?r=reset' });
  await recovery.getByRole('heading', { name: 'كلمة سر جديدة' }).waitFor();
  await recovery.getByLabel('كلمة السر الجديدة', { exact: true }).fill('Test-reset-password!');
  await recovery.getByRole('button', { name: 'احفظ كلمة السر' }).click();
  await recovery.locator('body:not(.booting)').waitFor();
  assert.equal(await recovery.evaluate(() => window.qaPasswordChanged), true);
  console.log('PASS cached offline account, unavailable account protection, reset callback and keyboard focus');

  for (const [width, height] of [[320, 640], [375, 667], [844, 390], [1440, 900]]) {
    const responsive = await pageFor({ width, height, reducedMotion: 'reduce', google: true });
    await responsive.getByRole('button', { name: 'عندي حساب، سجّل دخول', exact: true }).click();
    await responsive.getByRole('button', { name: 'حساب جديد', exact: true }).click();
    await responsive.getByRole('button', { name: 'أنشئ حسابي', exact: true }).waitFor();
    await layout(responsive);
    await responsive.screenshot({ path: `${output}/signup-${width}.png`, fullPage: true });
    const duration = await responsive.locator('.auth-step').evaluate((el) => getComputedStyle(el).animationDuration);
    assert.ok(parseFloat(duration) < 0.01, 'Respects reduced motion');
  }
  console.log('PASS 320/375/844/1440 layouts, assets and reduced motion');
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
