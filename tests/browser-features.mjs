import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createState, savings, DAY } from '../js/store.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.connectOverCDP(process.env.TAFIHA_CDP);
const base = process.env.TAFIHA_PREVIEW || 'http://127.0.0.1:5186';
const now = Date.now();
const initial = createState({ name: 'جاد', quitAt: now - 5 * DAY - 19 * 3600000 - 28 * 60000 - 34000, nrt: {} });
initial.patch = { active: true, steps: [{ mg: 21, weeks: 6 }, { mg: 14, weeks: 2 }, { mg: 7, weeks: 2 }], hours: 24, packPrice: 12, packCount: 7, packs: [now], logs: [] };
const contexts = [], errors = [];
async function open(state = initial) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  contexts.push(context);
  await context.route('https://*.supabase.co/**', (route) => route.abort());
  await context.route('**/js/vendor/supabase.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    const user={id:'qa-ledger',email:'ledger@example.com',user_metadata:{full_name:'جاد'}};
    if(!localStorage.getItem('qaRemote')) localStorage.setItem('qaRemote', JSON.stringify({data:${JSON.stringify(state)},rev:1}));
    window.supabase={createClient:()=>({
      auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      rpc:(name,args)=>({abortSignal:async()=>{
        if(window.qaOffline) return {error:{message:'offline'}};
        const row=JSON.parse(localStorage.getItem('qaRemote'));
        if(name.endsWith('pull')) return {data:row};
        if(args.base!==row.rev) return {data:-1};
        localStorage.setItem('qaRemote',JSON.stringify({data:args.d,rev:row.rev+1})); return {data:row.rev+1};
      }}),
      channel:()=>{const c={on:()=>c,subscribe:()=>c,send(){}};return c;},removeChannel(){}
    })};` }));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.goto(base);
  await page.locator('body:not(.booting)').waitFor();
  return page;
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('tafiha.v1:qa-ledger')));
const displayed = (page, id) => page.locator('#' + id).evaluate((el) => Number(el.textContent.replace(/,/g, '')));
async function dismissSheet(page) { await page.keyboard.press('Escape'); await page.locator('#sheet[hidden]').waitFor({ state: 'attached' }); }

try {
  const page = await open();
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const timer = await page.locator('.hms .num').evaluateAll((nodes) => nodes.map((el) => ({ text: el.textContent, x: el.getBoundingClientRect().x })));
    assert.deepEqual(timer.map((v) => v.text), ['19', '28', '34']);
    assert.ok(timer[0].x < timer[1].x && timer[1].x < timer[2].x);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const overflow = await page.locator('.hms, .savings, .savings-balances, .clock').evaluateAll((nodes) => nodes.filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => el.className));
    assert.deepEqual(overflow, []);
    await page.screenshot({ path: `.qa/ledger-${width}.png`, fullPage: true });
  }
  console.log('PASS clock HH:MM:SS ordering, stable labels and responsive savings layouts');
  await page.setViewportSize({ width: 390, height: 844 });
  const earned = savings(initial, now).earnedCents;
  await page.locator('#depositAdd').click();
  await page.locator('#depositForm input[name=amount]').fill('0');
  await page.getByRole('button', { name: 'احفظ الإيداع', exact: true }).click();
  assert.ok(await page.locator('#depositError').textContent());
  await page.locator('#depositForm input[name=amount]').fill('٢٫٨٥');
  await page.locator('#depositForm input[name=note]').fill('<img src=x onerror=alert(1)>');
  await page.locator('#depositForm').evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await page.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal((await stored(page)).deposits.length, 1, 'A double submit creates one record');
  assert.equal(await displayed(page, 'depositPaid'), 2.85);
  assert.equal(await displayed(page, 'depositDue'), (earned - 285) / 100);
  assert.equal(await displayed(page, 'stMoney'), earned / 100);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('qaRemote')).data.deposits.length === 1);
  await page.reload();
  await page.locator('body:not(.booting)').waitFor();
  assert.equal(await displayed(page, 'depositPaid'), 2.85);
  await page.locator('#depositHistory').click();
  assert.equal(await page.locator('.deposit-entry img').count(), 0);
  await page.locator('[data-deposit-remove]').click();
  await page.getByRole('button', { name: 'احتفظ فيه', exact: true }).click();
  assert.equal((await stored(page)).deposits.length, 1);
  await page.locator('[data-deposit-remove]').click();
  await page.getByRole('button', { name: 'احذف السجل', exact: true }).click();
  await page.getByText('لسّه ما سجّلت إيداعات.', { exact: true }).waitFor();
  await dismissSheet(page);
  assert.equal(await displayed(page, 'depositDue'), earned / 100);
  console.log('PASS deposit validation, Arabic amounts, double-submit guard, reload, escaped notes and confirmed deletion');

  await page.locator('#depositAdd').click();
  await page.locator('#depositForm input[name=amount]').fill('100');
  await page.getByRole('button', { name: 'احفظ الإيداع', exact: true }).click();
  await page.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal(await displayed(page, 'depositDue'), 0);
  assert.equal(await page.locator('#depositAhead').isVisible(), true);
  await page.locator('[data-tab=wins]').click();
  await page.locator('#goalSet').click();
  await page.locator('#goalForm input[name=title]').fill('سفرة');
  await page.locator('#goalForm input[name=amount]').fill('150');
  await page.getByRole('button', { name: 'احفظ الهدف', exact: true }).click();
  await page.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal(await displayed(page, 'goalN'), 100);
  await page.getByText('باقي إيداع 50.00 د.أ لهدفك', { exact: true }).waitFor();
  console.log('PASS over-deposit credit and goal progress based on actual deposits');

  await page.locator('[data-tab=plan]').click();
  await page.locator('#gumBtn').click();
  assert.equal((await stored(page)).nrt.logs.length, 1);
  await page.locator('#toastAct').click();
  assert.equal((await stored(page)).nrt.logs.length, 0);
  await page.locator('#gumPackBtn').click();
  assert.equal((await stored(page)).nrt.packs.length, 2);
  await page.locator('#patchBtn').click();
  assert.equal((await stored(page)).patch.logs.length, 1);
  await page.locator('#patchBtn').click();
  assert.equal((await stored(page)).patch.logs.length, 1, 'Repeated patch clicks do not duplicate today');
  await page.locator('#toastAct').click();
  assert.equal((await stored(page)).patch.logs.length, 0, 'Patch toast undoes today');
  await page.locator('#patchPackBtn').click();
  assert.equal((await stored(page)).patch.packs.length, 2);
  console.log('PASS gum and patch logging, duplicate prevention, undo and pack purchases');

  await page.locator('#cravingBtn').click();
  await page.locator('#cvBody [data-v="8"]').click();
  await page.locator('#cvBody [data-t=coffee]').click();
  await page.locator('#cvGo').click();
  await page.locator('#cvDone').click();
  await page.locator('#cvBody [data-v="2"]').click();
  await page.locator('#cvFin').click();
  await page.locator('#craving[hidden]').waitFor({ state: 'attached' });
  assert.equal((await stored(page)).cravings.length, 1);
  await page.locator('[data-tab=body]').click();
  await page.locator('[data-tab=wins]').click();
  await page.locator('#shareBtn').click();
  await page.locator('.story-preview').waitFor();
  await page.waitForFunction(() => document.querySelector('.story-preview')?.naturalWidth > 0);
  assert.ok((await page.locator('#doSave').getAttribute('href')).startsWith('blob:'));
  await dismissSheet(page);
  await page.locator('#slipBtn').click();
  await page.locator('#slipKeep').click();
  await page.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal((await stored(page)).slips.length, 1);
  const beforeReset = savings(await stored(page), now);
  await page.locator('#slipBtn').click();
  await page.locator('#slipReset').click();
  await page.locator('#slipReset').click();
  await page.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.equal(savings(await stored(page), now).earnedCents, beforeReset.earnedCents);
  assert.equal((await stored(page)).deposits.length, 1);
  console.log('PASS complete craving flow, story image, slip and restart without losing savings');

  const future = structuredClone(initial);
  future.quitAt = now + 2 * DAY + 3 * 3600000 + 4 * 60000 + 5000;
  future.habits.vape = { active: false };
  const prep = await open(future);
  await prep.getByText('يوم الإقلاع', { exact: true }).waitFor();
  const before = await prep.locator('.hms .num').allTextContents();
  assert.deepEqual(before, ['03', '04', '05']);
  await prep.clock.setFixedTime(now + 1000);
  await prep.waitForFunction(() => document.querySelector('[data-k=s]').textContent === '04');
  await prep.locator('#openSettings').click();
  await prep.getByLabel('يوم الإقلاع', { exact: true }).waitFor();
  await prep.locator('input[name=h_vape]').check();
  await prep.locator('#setForm button[type=submit]').click();
  await prep.locator('#sheet[hidden]').waitFor({ state: 'attached' });
  assert.ok((await stored(prep)).quitAt > now + DAY, 'Saving settings preserves a future quit day');
  assert.equal((await stored(prep)).habits.vape.unitPrice, 8, 'Previously absent habit settings get defaults');
  assert.equal(await prep.locator('#nextName').textContent(), 'يوم الإقلاع');
  console.log('PASS actual countdown, quit-day naming and preserving future dates in settings');
  await prep.locator('#homeGum').waitFor();
  await prep.locator('#homePatch').waitFor();
  const gumBefore = (await stored(prep)).nrt.logs.length;
  await prep.locator('#homeGumLog').click();
  assert.equal((await stored(prep)).nrt.logs.length, gumBefore + 1);
  assert.ok((await prep.locator('#homeGumStock').textContent()).includes('29'));
  await prep.locator('#toastAct').click();
  assert.equal((await stored(prep)).nrt.logs.length, gumBefore);
  await prep.locator('#homeGumPack').click();
  assert.ok((await prep.locator('#homeGumStock').textContent()).includes('60'));
  await prep.locator('#homePatchLog').click();
  assert.equal((await stored(prep)).patch.logs.length, 1);
  assert.equal(await prep.locator('#homePatchLog').isDisabled(), true);
  assert.ok((await prep.locator('#homePatchStock').textContent()).includes('6'));
  await prep.locator('#toastAct').click();
  await prep.locator('#homePatchPack').click();
  assert.ok((await prep.locator('#homePatchStock').textContent()).includes('14'));
  for (const type of ['Gum', 'Patch']) {
    await prep.locator(`#home${type}How`).click();
    await prep.locator('.replacement-help a').waitFor();
    assert.ok((await prep.locator('.replacement-help a').getAttribute('href')).startsWith('https://www.cdc.gov/'));
    await dismissSheet(prep);
  }
  for (const width of [1440, 390, 320]) {
    await prep.setViewportSize({ width, height: 900 });
    await prep.locator('#todayCard').scrollIntoViewIfNeeded();
    assert.equal(await prep.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await prep.screenshot({ path: `.qa/replacements-${width}.png` });
  }
  await prep.reload();
  await prep.locator('body:not(.booting)').waitFor();
  assert.ok((await prep.locator('#homeGumStock').textContent()).includes('60'));
  const noNrt = structuredClone(initial);
  noNrt.nrt.active = false; noNrt.patch.active = false;
  const empty = await open(noNrt);
  await empty.getByText('ما في بدائل مسجّلة حالياً.', { exact: false }).waitFor();
  await empty.locator('#todaySettings').click();
  await empty.locator('#setForm').waitFor();
  console.log('PASS both home replacements before quit day, logging, undo, stock, purchases, instructions, reload and empty-state settings');
  const timed = structuredClone(initial);
  timed.quitAt = now + 2000;
  timed.nrt.active = false; timed.patch.active = false;
  timed.deposits = [{ id: '11111111-1111-4111-8111-111111111111', at: now, cents: 300, note: '' }];
  const live = await open(timed);
  assert.equal(await displayed(live, 'stMoney'), 0);
  assert.equal(await displayed(live, 'depositDue'), 0);
  await live.locator('#savingsDate:not([hidden])').waitFor();
  assert.ok((await live.locator('#savingsStatus').textContent()).includes('التوفير بيبدأ'));
  await live.clock.setFixedTime(now + 3000);
  await live.locator('#savingsDate[hidden]').waitFor({ state: 'attached' });
  assert.equal(await live.locator('#prepCard').isVisible(), false);
  assert.equal(await live.locator('#heroEyebrow').textContent(), 'صارلك طافيها');
  await live.clock.setFixedTime(now + DAY);
  await live.waitForFunction(() => Number(document.querySelector('#stMoney').textContent) === 2.85);
  assert.ok(await displayed(live, 'stUnits') >= 19);
  assert.equal(await displayed(live, 'depositPaid'), 3);
  assert.equal(await displayed(live, 'depositDue'), 0);
  await live.clock.setFixedTime(now + 2 * DAY);
  await live.waitForFunction(() => Number(document.querySelector('#depositDue').textContent) === 2.7);
  assert.equal(await displayed(live, 'stMoney'), 5.7);
  assert.equal(await live.locator('#depositAhead').isVisible(), false);
  await live.reload();
  await live.clock.setFixedTime(now + 2 * DAY);
  await live.locator('body:not(.booting)').waitFor();
  await live.waitForFunction(() => Number(document.querySelector('#stMoney').textContent) === 5.7);
  assert.equal(await displayed(live, 'depositPaid'), 3);
  console.log('PASS zero before quit, automatic quit transition, live savings and avoided units, advance deposits, day jumps and reload');
  const legacy = structuredClone(initial);
  legacy.quitAt = now + 83 * DAY;
  legacy.assessment = {
    products: ['cig'], cig_perDay: 20, cig_packSize: 20, cig_packPrice: 2.85,
    quitMode: 'future', approach: 'advise', confidence: 3, nrt_now: 'none', nrt_pref: 'none',
    quitAt: legacy.quitAt, assessedAt: now - DAY,
  };
  const review = await open(legacy);
  await review.locator('#planReview:not([hidden])').waitFor();
  assert.equal(await review.locator('#heroEyebrow').textContent(), 'موعد محفوظ بحاجة مراجعة');
  assert.equal(await review.locator('#cutCard').isVisible(), false);
  assert.equal((await stored(review)).quitAt, legacy.quitAt);
  await review.setViewportSize({ width: 320, height: 740 });
  await review.locator('#planReview').scrollIntoViewIfNeeded();
  assert.equal(await review.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await review.screenshot({ path: '.qa/plan-review-320.png', fullPage: true });
  await review.locator('#reviewPlanBtn').click();
  await review.getByRole('dialog', { name: 'مقابلة الإقلاع' }).waitFor();
  console.log('PASS legacy 83-day warning, preserved saved date and review action');
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
