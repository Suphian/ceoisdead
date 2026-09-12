
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = { scene: null, checks: [], online: 'not attempted' };
async function ready(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
  await page.waitForFunction(() => ['ready', 'fallback'].includes(document.documentElement.dataset.scene), null, { timeout: 45000 });
  if (await page.locator('#board-canvas').isVisible()) {
    await page.waitForFunction(() => document.querySelector('#board-canvas').dataset.assets === 'ready', null, { timeout: 45000 });
  }
}
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await ready(page);
  report.scene = await page.evaluate(() => document.documentElement.dataset.scene);
  assert.equal(report.scene, 'ready', 'The WebGL test browser must render the 3D board');
  assert.equal(await page.locator('#hand .action-card').count(), 8);
  assert.equal(await page.locator('#region-rail .region-tab').count(), 8);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  report.checks.push('Initial board, eight regions and eight cards render');
  await page.locator('[data-command="view-top"]').click();
  assert.equal(await page.locator('[data-command="view-top"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-command="focus"]').click();
  await page.locator('[data-command="view-3d"]').click();
  const initialSave = await page.evaluate(() => localStorage.getItem('ceoisdead.session.v1'));
  await page.locator('[data-command="dice"]').click();
  await page.waitForFunction(() => document.querySelector('#dice-canvas').dataset.ready === 'true', null, { timeout: 30000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Reopening constructs the tray with normal motion for the actual physics check.
  await page.locator('#dice-modal [data-close]').click();
  await page.waitForFunction(() => !document.querySelector('#dice-canvas canvas'));
  await page.locator('[data-command="dice"]').click();
  await page.waitForFunction(() => document.querySelector('#dice-canvas').dataset.ready === 'true');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#roll-dice').click();
    assert.equal(await page.locator('#roll-dice').isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('#dice-canvas').dataset.rolling === 'false', null, { timeout: 16000 });
    const result = await page.locator('#dice-canvas').getAttribute('data-values');
    if (result) {
      const values = result.split(',').map(Number);
      assert.ok(values.length === 2 && values.every(v => Number.isInteger(v) && v >= 1 && v <= 6));
      assert.equal(await page.locator('#dice-result').textContent(), `${values[0]} + ${values[1]} = ${values[0] + values[1]}`);
    } else assert.match(await page.locator('#dice-result').textContent(), /edge/);
  }
  await page.screenshot({path:'test-results/dice-tray.png'});
  await page.locator('#dice-modal [data-close]').click();
  await page.waitForFunction(() => !document.querySelector('#dice-canvas canvas'));
  assert.equal(await page.locator('#dice-canvas canvas').count(), 0, 'Closing the tray releases its renderer');
  assert.equal(await page.evaluate(() => localStorage.getItem('ceoisdead.session.v1')), initialSave, 'Dice do not change the match');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  report.checks.push('Models load, camera views work, physics rolls settle and the dice tray leaves the match unchanged');
  await page.locator('[data-command="rules"]').click();
  assert.equal(await page.locator('#rules-modal').isVisible(), true);
  await page.locator('#rules-modal [data-close]').first().click();
  await page.locator('[data-testid="new-game"]').click();
  await page.locator('input[name="mode"][value="hotseat"]').check();
  await page.locator('input[name="player-one"]').fill('Ada');
  await page.locator('input[name="player-two"]').fill('Grace');
  await page.locator('[data-testid="start-game"]').click();
  await page.locator('[data-card="scottish-support"]').click();
  const firstMove = await page.locator('#action-choice option').nth(1).getAttribute('value');
  assert.ok(firstMove);
  await page.locator('#action-choice').selectOption(firstMove);
  await page.locator('[data-command="confirm-move"]').click();
  assert.match(await page.locator('#turn-heading').textContent(), /Recruit one ally/);
  assert.equal(await page.locator('#pass-button').isVisible(), false);
  await page.locator('#region-rail [data-region]').first().click();
  await page.locator('#move-panel [data-execute]').first().click();
  assert.equal(await page.locator('.player-card.is-active .player-name').textContent(), 'Grace');
  report.checks.push('Card effect, mandatory recruitment and player handoff');
  await page.locator('[data-testid="pass"]').click();
  await page.locator('[data-testid="pass"]').click();
  assert.match(await page.locator('.round-number').textContent(), /02/);
  report.checks.push('Two passes resolve a region');
  let passes=0;
  while (!(await page.locator('#result-overlay').isVisible()) && passes < 18) {
    await page.locator('[data-testid="pass"]').click();
    passes++;
  }
  assert.equal(await page.locator('#result-overlay').isVisible(), true);
  assert.match(await page.locator('#turn-heading').textContent(), /seat|succession/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
  assert.equal(await page.locator('#result-overlay').isVisible(), true);
  report.checks.push('Game completes and legal action history restores after reload');
  await page.locator('[data-testid="new-game"]').click();
  await page.locator('input[name="mode"][value="solo"]').check();
  await page.locator('input[name="player-one"]').fill('Ada');
  await page.locator('[data-testid="start-game"]').click();
  await page.locator('[data-testid="pass"]').click();
  await page.waitForFunction(() => document.querySelector('.player-card.is-active .player-name')?.textContent === 'Ada', null, {timeout:20000});
  report.checks.push('Practice opponent returns control to human');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  const mobile = await mobileContext.newPage();
  await ready(mobile);
  const widths = await mobile.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(widths.content <= widths.viewport + 1, 'Mobile page overflows: ' + JSON.stringify(widths));
  await mobile.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await mobile.locator('[data-command="dice"]').click();
  await mobile.waitForFunction(() => document.querySelector('#dice-canvas').dataset.ready === 'true', null, {timeout:30000});
  await mobile.locator('#roll-dice').click();
  await mobile.waitForFunction(() => document.querySelector('#dice-canvas').dataset.rolling === 'false');
  const modalBounds = await mobile.locator('#dice-modal').boundingBox();
  assert.ok(modalBounds.x >= 0 && modalBounds.x + modalBounds.width <= 391);
  await mobile.screenshot({path:'test-results/mobile-dice.png'});
  await mobile.locator('#dice-modal [data-close]').click();
  report.checks.push('Mobile layout has no page-level horizontal overflow');
  await mobileContext.close();
  try {
    const previewUrl='https://suph.app/';
    const response=await fetch(previewUrl,{signal:AbortSignal.timeout(15000)});
    const html=await response.text();
    report.preview={url:previewUrl,status:response.status,sourceReady:html.includes('src="./app.js"')};
  } catch(error) {report.preview={error:error.message};}

  // Exercise a real two-browser peer connection when the public signaling service is reachable.
  // Unit tests separately enforce protocol correctness without external services.
  try {
    await page.locator('[data-testid="new-game"]').click();
    await page.locator('input[name="mode"][value="online"]').check();
    await page.locator('[data-testid="start-game"]').click();
    await page.waitForFunction(() => document.querySelector('#invite-link')?.value, null, {timeout:22000});
    const link = await page.locator('#invite-link').inputValue();
    const guestContext = await browser.newContext({ viewport: {width:1280,height:900}, ignoreHTTPSErrors:true });
    const guest = await guestContext.newPage();
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(link, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#connection-label')?.textContent === 'Connected', null, {timeout:22000});
    await guest.waitForFunction(() => document.querySelector('#connection-label')?.textContent === 'Connected', null, {timeout:22000});
    await page.locator('#invite-modal [data-close]').click();
    await page.locator('[data-testid="pass"]').click();
    await guest.waitForFunction(() => document.querySelector('#pass-button')?.disabled === false, null, {timeout:8000});
    await guest.locator('[data-testid="pass"]').click();
    await page.waitForFunction(() => document.querySelector('.round-number')?.textContent.includes('02'), null, {timeout:8000});
    report.online='Real WebRTC host/guest handshake and bidirectional turns passed';
    await guestContext.close();
  } catch (error) {
    report.online='Live network check unavailable or failed: '+error.message;
    await page.screenshot({path:'test-results/online-status.png',fullPage:true});
  }
  assert.deepEqual(errors, [], 'Uncaught browser exceptions');
} catch(error) {
  report.failure=error.message;
  console.log('BROWSER_FAILURE_REPORT:'+JSON.stringify(report));
  throw error;
} finally {
  await writeFile('test-results/browser-report.json', JSON.stringify({...report,errors},null,2));
  await browser.close();
}
console.log(JSON.stringify(report,null,2));
