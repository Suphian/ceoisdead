import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const required = process.env.REQUIRE_MULTIPLAYER === '1';
const coachKey = 'togaisdead.coach.v1';
const report = { local: [], online: [], errors: [] };
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function client(name) {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  context.setDefaultTimeout(20000);
  await context.addInitScript(value => localStorage.setItem('ceoisdead.name', value), name);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(`${name}: ${error.message}`));
  return { page, context, name };
}

async function loaded(page) {
  await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
  if (await page.locator('#welcome-modal').isVisible()) await page.locator('#continue-table').click();
}

async function dismissTurn(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await page.locator('#turn-modal').isVisible()) await page.locator('#turn-modal [data-turn-feedback="dismiss"]').click();
}

async function expectTurn(page, name, hotseat = false) {
  await page.locator('#turn-modal').waitFor({ state: 'visible' });
  const title = await page.locator('#turn-modal-title').textContent();
  if (hotseat) {
    assert.match(title, new RegExp(name));
    assert.doesNotMatch(title, /your turn/i);
  } else assert.match(title, /it.s your turn/i);
  assert.match(await page.locator('#turn-modal-player').textContent(), new RegExp(name));
  const before = await revision(page);
  await page.locator('#turn-modal [data-turn-feedback="dismiss"]').click();
  assert.equal(await revision(page), before, 'Dismissing a turn announcement does not play a move');
}

async function noTurnModal(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#turn-modal').isVisible(), false, 'Selections, instruction changes and recruitment must not reopen the turn modal');
}

async function ready(page, url = base) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await loaded(page);
  await dismissTurn(page);
}

async function setup(page, mode) {
  await dismissTurn(page);
  await page.locator('[data-testid="new-game"]').click();
  await page.locator(`input[name="mode"][value="${mode}"]`).check();
  await page.locator('#player-count').selectOption('2');
  await page.locator('input[name="player-one"]').fill('Suphi');
  if (mode !== 'solo') await page.locator('input[name="player-two"]').fill('Ed Ted');
  await page.locator('[data-testid="start-game"]').click();
}

async function state(page, expected) {
  await page.waitForFunction(value => document.querySelector('#turn-status')?.dataset.state === value, expected);
  assert.equal(await page.locator('#turn-status').getAttribute('role'), 'status');
}

async function coach(page, enabled) {
  assert.equal(await page.locator('#coach-toggle').getAttribute('aria-pressed'), String(enabled));
  assert.equal(await page.locator('#coach-panel').isVisible(), enabled);
  if (enabled) {
    assert.ok((await page.locator('#coach-title').textContent()).trim().length > 0, 'The current instruction has a title');
    assert.ok((await page.locator('#coach-detail').textContent()).trim().length > 15, 'The current instruction explains the next action');
  } else assert.equal(await page.locator('.is-guided').count(), 0, 'Dismissed walkthrough leaves no highlighted controls');
}

async function guided(page, selector) {
  const controls = page.locator(selector);
  assert.ok(await controls.count() > 0, `Expected available controls: ${selector}`);
  assert.ok(await controls.locator('xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " is-guided ")]').count() > 0, `The needed control is highlighted: ${selector}`);
}

async function revision(page) {
  return Number(await page.locator('html').getAttribute('data-revision'));
}

async function synchronized(pages, expected) {
  await Promise.all(pages.map(page => page.waitForFunction(value => Number(document.documentElement.dataset.revision) === value, expected)));
  const regions = await Promise.all(pages.map(page => page.locator('#region-rail').textContent()));
  assert.ok(regions.every(value => value === regions[0]), 'Both players see the same board');
  const courts = await Promise.all(pages.map(page => page.locator('#players .court-grid').allTextContents()));
  assert.deepEqual(courts[0], courts[1], 'Both players see the same personal support');
}

// Read only rendered match data and the existing save, excluding instructional UI.
async function matchSnapshot(page, includeSave = true) {
  return page.evaluate(withSave => ({
    revision: document.documentElement.dataset.revision,
    save: withSave ? localStorage.getItem('ceoisdead.session.v1') : null,
    round: document.querySelector('.round-number').textContent,
    active: document.querySelector('.player-card.is-active .player-name')?.textContent,
    agenda: document.querySelector('#agenda').textContent,
    regions: document.querySelector('#region-rail').textContent,
    players: [...document.querySelectorAll('.player-card')].map(card => ({
      name: card.querySelector('.player-name').textContent,
      cards: card.querySelector('.card-count').textContent,
      court: card.querySelector('.court-grid').textContent,
    })),
    hand: [...document.querySelectorAll('#hand .action-card')].map(card => ({ id: card.dataset.card, used: card.classList.contains('is-used') })),
  }), includeSave);
}

async function identity(page, name) {
  assert.match(await page.locator('#your-seat').textContent(), new RegExp(name));
  assert.equal(await page.locator('.player-card.is-you').count(), 1);
  assert.equal(await page.locator('.player-card.is-you .player-name').textContent(), name);
}

async function opposing(host, guest, activeName, activeState = 'action') {
  const pages = [host.page, guest.page];
  const active = activeName === host.name ? host : guest;
  const waiting = active === host ? guest : host;
  await Promise.all([state(active.page, activeState), state(waiting.page, 'waiting')]);
  await identity(host.page, host.name);
  await identity(guest.page, guest.name);
  const banners = await Promise.all(pages.map(page => page.locator('#turn-heading').textContent()));
  assert.equal(banners.filter(text => /YOUR TURN/i.test(text)).length, 1, 'Exactly one player is told YOUR TURN');
  assert.match(await active.page.locator('#turn-heading').textContent(), /YOUR TURN/i);
  assert.match(await waiting.page.locator('#turn-status').textContent(), new RegExp(activeName));
  assert.equal(await waiting.page.locator('#hand .action-card:not(:disabled)').count(), 0, 'Waiting player cannot play a card');
  assert.equal(await waiting.page.locator('#move-panel [data-execute]').count(), 0, 'Waiting player cannot recruit');
  if (await waiting.page.locator('#pass-button').isVisible()) assert.equal(await waiting.page.locator('#pass-button').isDisabled(), true);
}

async function connected(page) {
  await page.waitForFunction(() => document.querySelector('#connection-label')?.textContent === 'Connected', null, { timeout: 30000 });
}

async function closeInvite(page) {
  if (await page.locator('#invite-modal').isVisible()) await page.locator('#invite-modal [data-close]').first().click();
}

try {
  const local = await client('Suphi');
  await ready(local.page);
  await setup(local.page, 'solo');
  await expectTurn(local.page, 'Suphi');
  await state(local.page, 'action');
  await identity(local.page, 'Suphi');
  await coach(local.page, true);
  await guided(local.page, '#hand .action-card:not(:disabled)');
  const untouched = await matchSnapshot(local.page);
  await local.page.locator('#coach-toggle').click();
  await coach(local.page, false);
  await noTurnModal(local.page);
  assert.equal(await local.page.evaluate(key => localStorage.getItem(key), coachKey), 'off');
  assert.deepEqual(await matchSnapshot(local.page), untouched);
  await local.page.reload({ waitUntil: 'domcontentloaded' });
  await loaded(local.page);
  await expectTurn(local.page, 'Suphi');
  await coach(local.page, false);
  assert.deepEqual(await matchSnapshot(local.page), untouched, 'Dismissal survives reload without changing the match');
  await local.page.locator('#coach-toggle').click();
  await coach(local.page, true);
  await noTurnModal(local.page);
  assert.equal(await local.page.evaluate(key => localStorage.getItem(key), coachKey), 'on');
  assert.deepEqual(await matchSnapshot(local.page), untouched, 'Restarting the walkthrough does not reset the match');
  await local.page.reload({ waitUntil: 'domcontentloaded' });
  await loaded(local.page);
  await expectTurn(local.page, 'Suphi');
  await coach(local.page, true);
  assert.deepEqual(await matchSnapshot(local.page), untouched);
  report.local.push('Automatic walkthrough; dismiss/restart preferences persist without changing the saved match, cards, board, support or turn');

  await setup(local.page, 'hotseat');
  await expectTurn(local.page, 'Suphi', true);
  await state(local.page, 'action');
  assert.equal(await local.page.locator('.player-card.is-you').count(), 0, 'Shared-screen play has no personal YOU seat');
  assert.match(await local.page.locator('#turn-status').textContent(), /Suphi/i);
  assert.doesNotMatch(await local.page.locator('#turn-heading').textContent(), /YOUR TURN/i);
  await local.page.locator('#pass-button').click();
  await expectTurn(local.page, 'Ed Ted', true);
  await state(local.page, 'action');
  assert.match(await local.page.locator('#turn-status').textContent(), /Ed Ted/i);
  assert.doesNotMatch(await local.page.locator('#turn-heading').textContent(), /YOUR TURN/i);
  await local.page.screenshot({ path: 'test-results/guidance-hotseat.png', fullPage: true });
  report.local.push('Hotseat names the active person through handoff and does not label a shared seat YOU');
  await local.context.close();

  const host = await client('Suphi');
  const guest = await client('Ed Ted');
  const pages = [host.page, guest.page];
  let live = false;
  try {
    await ready(host.page);
    await setup(host.page, 'online');
    await state(host.page, 'lobby');
    assert.equal(await host.page.locator('#hand .action-card:not(:disabled)').count(), 0);
    await host.page.waitForFunction(() => document.querySelector('#invite-link')?.value, null, { timeout: 30000 });
    const link = await host.page.locator('#invite-link').inputValue();
    assert.equal(new URL(link).origin, new URL(base).origin);
    await ready(guest.page, link);
    await host.page.waitForFunction(() => document.querySelectorAll('.lobby-seat.is-connected').length === 2, null, { timeout: 30000 });
    await Promise.all(pages.map(page => state(page, 'lobby')));
    await Promise.all(pages.map(closeInvite));
    for (const current of [host, guest]) {
      await identity(current.page, current.name);
      await coach(current.page, true);
      assert.equal(await current.page.locator('#hand .action-card:not(:disabled)').count(), 0, 'Lobby controls clearly prevent premature moves');
      assert.doesNotMatch(await current.page.locator('#turn-heading').textContent(), /YOUR TURN/i);
      assert.match(await current.page.locator('#coach-detail').textContent(), /table|start|friend|join|wait/i);
    }
    assert.equal(await host.page.locator('#lobby-action').getAttribute('data-command'), 'start-table');
    assert.equal(await host.page.locator('#lobby-action').isDisabled(), false);
    await host.page.locator('#lobby-action').click();
    await Promise.all(pages.map(connected));
    live = true;
    await expectTurn(host.page, 'Suphi');
    await noTurnModal(guest.page);
    await synchronized(pages, 0);
    await opposing(host, guest, 'Suphi');
    await guided(host.page, '#hand .action-card:not(:disabled)');
    await Promise.all(pages.map((page, i) => page.screenshot({ path: `test-results/guidance-${i === 0 ? 'host' : 'guest'}-turn.png`, fullPage: true })));
    report.online.push('Two real browser clients join as Suphi / Ed Ted; lobby start CTA works; exactly one YOUR TURN banner and one personal seat per player');

    await host.page.locator('[data-card="scottish-support"]').click();
    await noTurnModal(host.page);
    // Scottish Support often has one legal effect, which is selected automatically.
    // Exercise the picker only when there is an actual choice to make.
    if (!(await host.page.locator('#action-choice').inputValue())) {
      await opposing(host, guest, 'Suphi', 'effect');
      await guided(host.page, '#action-choice');
      const move = await host.page.locator('#action-choice option').nth(1).getAttribute('value');
      assert.ok(move, 'The selected card has a legal effect');
      await host.page.locator('#action-choice').selectOption(move);
    }
    await opposing(host, guest, 'Suphi', 'confirm');
    await guided(host.page, '[data-command="confirm-move"]');
    await synchronized(pages, 0);
    await host.page.locator('[data-command="confirm-move"]').click();
    await synchronized(pages, 1);
    await opposing(host, guest, 'Suphi', 'recruit-region');
    await noTurnModal(host.page);
    await noTurnModal(guest.page);
    for (const page of pages) {
      assert.equal(await page.locator('#last-played-card').getAttribute('data-card-id'), 'scottish-support');
      assert.match(await page.locator('#last-played-card').textContent(), /Suphi/);
    }
    assert.equal(await guest.page.locator('#played-card-toast').getAttribute('data-card-id'), 'scottish-support');
    assert.equal(await host.page.locator('#played-card-toast').isVisible(), false, 'Own card feedback cannot cover mandatory recruitment');
    await guided(host.page, '#region-rail .region-tab:not(.is-resolved)');
    assert.equal(await host.page.locator('#pass-button').isVisible(), false);
    assert.match(await host.page.locator('#coach-title').textContent(), /recruit|ally|region/i);
    await host.page.screenshot({ path: 'test-results/guidance-recruit.png', fullPage: true });
    await host.page.locator('#region-rail .region-tab:not(.is-resolved)').first().click();
    await opposing(host, guest, 'Suphi', 'recruit');
    await noTurnModal(host.page);
    await guided(host.page, '#move-panel .move-options [data-execute]');
    await host.page.locator('#move-panel [data-execute]').first().click();
    await synchronized(pages, 2);
    await expectTurn(guest.page, 'Ed Ted');
    await noTurnModal(host.page);
    await opposing(host, guest, 'Ed Ted');
    assert.equal(await host.page.locator('[data-card="scottish-support"]').getAttribute('class').then(value => value.includes('is-used')), true);
    assert.equal(await guest.page.locator('[data-card="scottish-support"]').getAttribute('class').then(value => value.includes('is-used')), false);
    report.online.push('Guidance follows card → effect or automatic sole choice → confirm → region → ally; persistent last-card feedback survives recruitment; only the next player gets a turn modal');

    const guestMatch = await matchSnapshot(guest.page, false);
    const hostMatch = await matchSnapshot(host.page, false);
    await guest.page.locator('#coach-toggle').click();
    await coach(guest.page, false);
    await coach(host.page, true);
    assert.deepEqual(await matchSnapshot(guest.page, false), guestMatch);
    assert.deepEqual(await matchSnapshot(host.page, false), hostMatch, 'A guest preference does not change the host match');

    // Hold only the reload's application script after the old document unloads.
    // This exposes a real transport pause deterministically, without fixed sleeps
    // or touching peer state, game state, resume tokens or server responses.
    let releaseApp;
    const appGate = new Promise(resolve => { releaseApp = resolve; });
    await guest.page.route('**/app.js*', async route => { await appGate; await route.continue(); }, { times: 1 });
    const reloaded = guest.page.reload({ waitUntil: 'domcontentloaded' }).then(() => null, error => error);
    try {
      await state(host.page, 'paused');
      assert.equal(await host.page.locator('#connection-label').textContent(), 'Paused');
      assert.doesNotMatch(await host.page.locator('#turn-heading').textContent(), /YOUR TURN/i);
      assert.equal(await host.page.locator('#pass-button').isDisabled(), true);
      assert.equal(await host.page.locator('#hand .action-card:not(:disabled)').count(), 0);
      assert.equal(await revision(host.page), 2);
      await host.page.screenshot({ path: 'test-results/guidance-paused.png', fullPage: true });
    } finally {
      releaseApp();
    }
    const reloadError = await reloaded;
    if (reloadError) throw reloadError;
    await loaded(guest.page);
    await Promise.all(pages.map(connected));
    await expectTurn(guest.page, 'Ed Ted');
    await synchronized(pages, 2);
    await opposing(host, guest, 'Ed Ted');
    await coach(guest.page, false);
    assert.equal(await guest.page.evaluate(key => localStorage.getItem(key), coachKey), 'off');
    assert.deepEqual(await matchSnapshot(guest.page, false), guestMatch, 'Refresh preserves the guest seat, hand, board, support and active turn');
    await guest.page.locator('#coach-toggle').click();
    await coach(guest.page, true);
    await guided(guest.page, '#hand .action-card:not(:disabled)');
    assert.deepEqual(await matchSnapshot(guest.page, false), guestMatch);
    await guest.page.locator('#pass-button').click();
    await synchronized(pages, 3);
    await expectTurn(host.page, 'Suphi');
    await opposing(host, guest, 'Suphi');
    report.online.push('Guest refresh pauses the host, resumes the original seat and turn with unchanged revision, preserves dismissed coaching, and accepts the returning guest’s move');
  } catch (error) {
    const statuses = await Promise.all(pages.map(async page => {
      try { return await page.locator('#invite-status').textContent({ timeout: 1000 }); } catch { return ''; }
    }));
    report.connectionStatus = statuses;
    await host.page.screenshot({ path: 'test-results/guidance-online-status.png', fullPage: true }).catch(() => {});
    if (!required && !live && statuses.some(text => /network|service|could not|not online|connection failed/i.test(text))) {
      report.online.push('Not validated: external signaling unavailable. ' + statuses.join(' | '));
    } else throw error;
  }
  assert.deepEqual(report.errors, [], 'No uncaught browser errors');
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile('test-results/guidance-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
