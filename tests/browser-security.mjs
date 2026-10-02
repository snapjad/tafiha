import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createFromAssessment } from '../js/store.js';
import { buildReport } from '../js/plan.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.connectOverCDP(process.env.TAFIHA_CDP);
const base = process.env.TAFIHA_PREVIEW || 'http://127.0.0.1:5186';
const a = {
  name: '<img src=x onerror=window.qaInjected=1>', age: '25-34', pregnancy: 'no', products: ['cig', 'vape'], years: '6-10',
  cig_perDay: 20, cig_packPrice: 2.85, cig_packSize: 20, ftnd_ttfc: '5', ftnd_forbidden: true,
  ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: false,
  vp_kind: 'disposable', vp_price: 8, vp_days: 4, vp_puffs: 6000, vp_nicotine: 50,
  vp_times: '20-29', vp_ttfu: '5', vp_night: true, vp_nights: '2-3', vp_hard: true, vp_crave: true,
  vp_urge: 'high', vp_forbidden: true, vp_irritable: true, vp_anxious: true,
  attempts: '0', triggers: ['bored', 'coffee'], homeSmokers: false, friends: 'some',
  importance: 7, confidence: 7, reasons: ['freedom', 'money'], conditions: [], meds: [], rx: 'none',
  nrt_now: 'gum', gum_mg: 4, gum_max: 15, gum_price: 6, gum_count: 30,
  quitMode: 'done', quitAt: Date.now() - 3 * 864e5, assessedAt: Date.now(),
};
const state = createFromAssessment(a, buildReport(a).tx);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
const errors = [];
try {
  await context.route('https://*.supabase.co/**', (route) => route.abort());
  await context.route('**/js/vendor/supabase.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    const state = ${JSON.stringify(state)};
    const user = {id:'qa-security',email:'qa@example.com',user_metadata:{full_name:'Security test'}};
    window.supabase={createClient:()=>({
      auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      rpc:(name,args)=>({abortSignal:async()=>name.endsWith('pull')?{data:{data:state,rev:1}}:{data:2}}),
      channel:()=>{const c={on:()=>c,subscribe:()=>c,send(){}};return c;},removeChannel(){}
    })};` }));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('body:not(.booting)').waitFor();
  assert.equal(await page.evaluate(() => window.qaInjected), undefined);
  assert.equal(await page.locator('#name img').count(), 0, 'Name is plain text');
  for (const tab of ['plan', 'body', 'wins', 'home']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.locator(`[data-page="${tab}"].is-active`).waitFor();
  }
  await page.locator('#openSettings').click();
  assert.equal(await page.locator('#sheet input[name="name"]').inputValue(), a.name);
  await page.keyboard.press('Escape');
  console.log('PASS text injection escaped in dashboard and settings; all four tabs work');

  await page.evaluate(() => { window.qaViolations=[]; document.addEventListener('securitypolicyviolation', (e) => window.qaViolations.push(e.violatedDirective)); });
  const pdf = await page.evaluate(async (answers) => {
    const { buildPDF } = await import('./js/report.js');
    const report = await buildPDF(answers);
    return { version: window.jspdf.jsPDF.version, pages: report.getNumberOfPages(), bytes: Array.from(new Uint8Array(report.output('arraybuffer'))) };
  }, { ...a, name: 'Security QA' });
  assert.equal(pdf.version, '4.2.1');
  assert.ok(pdf.pages >= 2 && pdf.bytes.length > 20000);
  assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), '%PDF-');
  await writeFile('.qa/security-report.pdf', Buffer.from(pdf.bytes));
  assert.deepEqual(await page.evaluate(() => window.qaViolations), [], 'Normal report generation satisfies CSP');
  console.log(`PASS real PDF generation under CSP: ${pdf.pages} pages, jsPDF ${pdf.version}`);

  await page.evaluate(() => {
    const inline = document.createElement('script'); inline.textContent='window.qaInlineRan=true'; document.head.append(inline);
    const external = document.createElement('script'); external.src='https://example.com/blocked.js'; document.head.append(external);
  });
  await page.waitForFunction(() => window.qaViolations.length >= 2);
  assert.equal(await page.evaluate(() => window.qaInlineRan), undefined);
  console.log('PASS browser blocks injected inline and third-party scripts');

  // Use a normal display name for the responsive visual checks.
  await page.locator('#name').evaluate((el) => { el.textContent = 'مستخدم التجربة'; });
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const headerFits = await page.locator('.top').evaluate((header) => {
      const items = [...header.children].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect());
      return items.every((r, i) => items.every((other, j) => i === j || r.right <= other.left + 1 || other.right <= r.left + 1));
    });
    assert.equal(headerFits, true, 'Header logo, name and buttons never overlap');
    assert.equal(await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => i.getClientRects().length && !i.closest('[hidden]')).every((i) => i.complete && i.naturalWidth > 0)), true);
    await page.screenshot({ path: `.qa/security-dashboard-${width}.png`, fullPage: true });
  }
  console.log('PASS dashboard layouts and images at 1440/390/320');
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
