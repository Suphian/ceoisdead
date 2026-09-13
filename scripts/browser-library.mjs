import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const required = process.env.REQUIRE_MULTIPLAYER === '1';
const report = { local: [], online: { status: 'not-run' }, errors: [], warnings: [] };
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const contexts = [];
async function context(name, character = 0) {
  const result = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  contexts.push(result); result.setDefaultTimeout(15000);
  await result.addInitScript(({ name, character }) => {
    localStorage.setItem('kingisdead.welcomed', '1');
    localStorage.setItem('ceoisdead.name', name);
    localStorage.setItem('togaisdead.character', String(character));
  }, { name, character });
  return result;
}
async function dismissTurn(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await page.locator('#turn-modal').isVisible()) await page.locator('#turn-modal [data-turn-feedback="dismiss"]').click();
}
async function open(context, url = base) {
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning') report.warnings.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
  await dismissTurn(page); return page;
}
async function setup(page, mode, { name = 'Archive Host', count = 2, theme = 'medieval', character = 1 } = {}) {
  await dismissTurn(page); await page.locator('[data-testid="new-game"]').click();
  await page.locator('input[name="mode"][value="' + mode + '"]').check();
  await page.locator('#player-count').selectOption(String(count));
  await page.locator('input[name="player-one"]').fill(name);
  await page.locator('select[name="theme"]').selectOption(theme);
  await page.locator('#new-character label').nth(character).click();
  await page.locator('[data-testid="start-game"]').click(); await dismissTurn(page);
}
async function saved(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem('togaisdead.active-game');
    return JSON.parse(localStorage.getItem('togaisdead.games.v1') || '{"games":[]}').games.find(game => game.id === id);
  });
}
async function revision(page, number) {
  await page.waitForFunction(number => Number(document.documentElement.dataset.revision) === number, number);
}
async function connected(page) {
  await page.waitForFunction(() => document.querySelector('#connection-label')?.textContent === 'Connected', null, { timeout: 30000 });
}
async function playCard(page) {
  await dismissTurn(page); await page.locator('[data-card="scottish-support"]').click();
  const option = await page.locator('#action-choice option').nth(1).getAttribute('value');
  await page.locator('#action-choice').selectOption(option);
  await page.locator('[data-command="confirm-move"]').click();
}
async function recruit(page) {
  await dismissTurn(page); await page.locator('#region-rail [data-region]').first().click();
  await page.locator('#move-panel [data-execute]').first().click();
}
const entryButton = (page, id, command = 'resume-game') => page.locator(`#games-list [data-command="${command}"][data-game-id="${id}"]`);
async function games(page) { await dismissTurn(page); await page.locator('#my-games-button').click(); }
async function closeGames(page) { await page.locator('#games-modal [data-close]').click(); await dismissTurn(page); }
async function screenshot(page, name) {
  await page.waitForFunction(() => document.querySelector('#board-canvas')?.dataset.assets === 'ready'
    || document.documentElement.dataset.scene === 'fallback', null, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: 'test-results/' + name });
}

try {
  const localContext = await context('Archive Local'); let local = await open(localContext);
  await setup(local, 'hotseat', { character: 2 });
  await playCard(local); await revision(local, 1);
  const first = await saved(local);
  assert.equal(first.game.phase, 'summon'); assert.equal(first.characters[0], 2);
  await games(local);
  assert.match(await entryButton(local, first.id).textContent(), /Back to table/);
  await closeGames(local); assert.equal(await local.locator('#move-panel [data-execute]').count(), 0);
  await local.locator('#leave-game-button').click();
  assert.equal(await local.locator('#games-modal').isVisible(), true);
  assert.equal(await local.locator('#pass-button').isDisabled(), true);
  await entryButton(local, first.id).click(); await dismissTurn(local);
  assert.equal((await saved(local)).game.phase, 'summon');
  await recruit(local); await revision(local, 2); await dismissTurn(local);
  await setup(local, 'hotseat', { theme: 'roman', count: 3, character: 1 });
  const second = await saved(local); assert.notEqual(first.id, second.id);
  await games(local); assert.equal(await entryButton(local, first.id).count(), 1);
  await entryButton(local, first.id).click(); await dismissTurn(local); await revision(local, 2);
  assert.equal((await saved(local)).characters[0], 2);
  await games(local); await entryButton(local, first.id, 'archive-game').click();
  assert.match(await local.locator('.games-group').filter({ hasText: 'Closed & completed' }).textContent(), /Archive Host/);
  const closed = await local.evaluate(id => JSON.parse(localStorage.getItem('togaisdead.games.v1')).games.find(game => game.id === id).status, first.id);
  assert.equal(closed, 'closed');
  await screenshot(local, 'library-open-closed.png');
  await entryButton(local, first.id).click(); await dismissTurn(local);
  assert.equal((await saved(local)).status, 'open');
  await local.close(); local = await open(localContext); await revision(local, 2); await dismissTurn(local);
  assert.equal((await saved(local)).id, first.id); assert.equal((await saved(local)).characters[0], 2);
  report.local.push('Multiple local tables, non-pausing My games, leave/resume mid-recruitment, archive/reopen and new-tab restore');
  for (let turns = 0; (await saved(local)).game.phase !== 'ended'; turns++) {
    assert.ok(turns < 32, 'The pass-only game must finish');
    await dismissTurn(local); await local.locator('#pass-button').click();
  }
  assert.equal((await saved(local)).status, 'closed');
  await games(local); assert.match(await entryButton(local, first.id).textContent(), /Review/);
  await entryButton(local, first.id).click(); assert.equal((await saved(local)).game.phase, 'ended');
  report.local.push('Completed games automatically close and open for review');
  console.log('Saved-game local browser checks passed. Verifying host shutdown and guest resume.');
  await localContext.close();

  let live = false, host, guest;
  try {
    const hostContext = await context('Archive Host', 1), guestContext = await context('Archive Guest', 3);
    host = await open(hostContext); await setup(host, 'online', { character: 1 });
    await host.waitForFunction(() => document.querySelector('#invite-link')?.value, null, { timeout: 30000 });
    const link = await host.locator('#invite-link').inputValue(), roomId = new URL(link).searchParams.get('room');
    guest = await open(guestContext, link);
    await host.waitForFunction(() => document.querySelector('#start-table')?.disabled === false, null, { timeout: 30000 });
    await guest.locator('#lobby-character label').nth(2).click();
    await host.waitForFunction(() => document.querySelectorAll('#players .portrait img')[1]?.src.endsWith('/maren.png'));
    await guest.locator('#lobby-character label').nth(3).click();
    await host.waitForFunction(() => document.querySelectorAll('#players .portrait img')[1]?.src.endsWith('/rowan.png'));
    await host.locator('#start-table').click(); await Promise.all([connected(host), connected(guest)]); live = true;
    await dismissTurn(host); await host.locator('#pass-button').click(); await Promise.all([revision(host, 1), revision(guest, 1)]);
    await playCard(guest); await Promise.all([revision(host, 2), revision(guest, 2)]);
    const beforeHost = await saved(host), beforeGuest = await saved(guest);
    assert.equal(beforeHost.room.role, 'host'); assert.equal(beforeGuest.room.role, 'guest');
    assert.equal(beforeGuest.game.phase, 'summon'); assert.deepEqual(beforeGuest.characters, [1, 3]);
    assert.ok(beforeHost.room.checkpoint.seats[1].token === beforeGuest.room.token, 'Host checkpoint and guest archive share the reserved seat credential');
    await games(host); assert.equal(await guest.locator('#connection-label').textContent(), 'Connected'); await closeGames(host);
    await host.close({ runBeforeUnload: true });
    await guest.waitForFunction(() => document.querySelector('#connection-label')?.textContent !== 'Connected', null, { timeout: 30000 });
    assert.equal(await guest.locator('#pass-button').isDisabled(), true);
    await guest.close();
    host = await open(hostContext);
    await host.waitForFunction(() => document.querySelector('#invite-link')?.value, null, { timeout: 30000 });
    await host.waitForFunction(() => document.querySelectorAll('.lobby-seat.is-connected').length === 1, null, { timeout: 30000 });
    assert.equal(new URL(await host.locator('#invite-link').inputValue()).searchParams.get('room'), roomId);
    assert.equal(await host.locator('#pass-button').isDisabled(), true);
    guest = await open(guestContext);
    await Promise.all([connected(host), connected(guest), revision(host, 2), revision(guest, 2)]);
    const afterGuest = await saved(guest), afterHost = await saved(host);
    assert.equal(afterGuest.id, beforeGuest.id); assert.equal(afterHost.id, beforeHost.id);
    assert.equal(afterGuest.room.seat, 1); assert.ok(afterGuest.room.token === beforeGuest.room.token, 'New guest tab uses its stored seat credential');
    assert.equal(afterGuest.game.phase, 'summon'); assert.deepEqual(afterGuest.characters, [1, 3]);
    assert.ok((await host.locator('#players .portrait img').nth(0).getAttribute('src')).endsWith('/cassian.png'));
    assert.ok((await host.locator('#players .portrait img').nth(1).getAttribute('src')).endsWith('/rowan.png'));
    await recruit(guest); await Promise.all([revision(host, 3), revision(guest, 3)]);
    await dismissTurn(host); await host.locator('#pass-button').click(); await Promise.all([revision(host, 4), revision(guest, 4)]);
    await screenshot(host, 'library-restored-online.png');
    report.online = { status: 'passed', checks: ['Real WebRTC host shutdown', 'Same invitation and saved revision restored', 'New guest tab resumes reserved seat without sessionStorage', 'Characters and pending recruitment preserved', 'Play continues after reconnect'] };
  } catch (error) {
    const statuses = await Promise.all([host, guest].filter(page => page && !page.isClosed()).map(page => page.locator('#invite-status').textContent().catch(() => '')));
    const unavailable = !live && statuses.some(status => /service|network|could not|host is not online/i.test(status));
    if (!unavailable || required) throw error;
    report.online = { status: 'unavailable', reason: 'Peer signaling was unavailable before a table connected.', details: statuses };
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.message;
  let index = 0;
  for (const context of contexts) for (const page of context.pages()) {
    await page.screenshot({ path: `test-results/library-failure-${index++}.png` }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile('test-results/library-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
