import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const required = process.env.REQUIRE_MULTIPLAYER === '1';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { local: [], online: [], errors: [] };
async function dismissTurn(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await page.locator('#turn-modal').isVisible()) await page.locator('#turn-modal [data-turn-feedback="dismiss"]').click();
}
async function newPage(mobile = false, name) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1512, height: 982 }, isMobile: mobile, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  if (name) await context.addInitScript(value => { try { localStorage.setItem('ceoisdead.name', value); } catch {} }, name);
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', message => { if (message.type() === 'warning') console.log('BROWSER WARNING: ' + message.text()); });
  return { page, context, mobile };
}
async function ready(page, url = base) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
  if (await page.locator('#welcome-modal').isVisible()) await page.locator('#continue-table').click();
  await dismissTurn(page);
}
async function setup(page, count, mode) {
  await dismissTurn(page);
  await page.locator('[data-testid="new-game"]').click();
  await page.locator('input[name="mode"][value="' + mode + '"]').check();
  await page.locator('#player-count').selectOption(String(count));
  await page.locator('input[name="player-one"]').fill('Ada');
  await page.locator('[data-testid="start-game"]').click();
  await dismissTurn(page);
  assert.equal(await page.locator('.player-card').count(), count);
}
async function revision(page) { return Number(await page.locator('html').getAttribute('data-revision')); }
async function synchronized(pages, expected) {
  await Promise.all(pages.map(page => page.waitForFunction(value => Number(document.documentElement.dataset.revision) === value, expected, { timeout: 15000 })));
  const rails = await Promise.all(pages.map(page => page.locator('#region-rail').textContent()));
  assert.ok(rails.every(value => value === rails[0]), 'Every player sees the same influence and resolved regions');
}
async function playCardAndRecruit(page) {
  await dismissTurn(page);
  await page.locator('[data-card="scottish-support"]').click();
  const move = await page.locator('#action-choice option').nth(1).getAttribute('value');
  await page.locator('#action-choice').selectOption(move);
  await page.locator('[data-command="confirm-move"]').click();
  await page.waitForFunction(() => document.querySelector('#turn-status')?.dataset.state.startsWith('recruit'), null, {timeout:15000});
  assert.match(await page.locator('#turn-hint, #coach-title').allTextContents().then(parts => parts.join(' ')), /recruit/i);
  assert.equal(await page.locator('#pass-button').isVisible(), false);
  await page.locator('#region-rail [data-region]').first().click();
  await page.locator('#move-panel [data-execute]').first().click();
}
async function connected(page) {
  await page.waitForFunction(() => document.querySelector('#connection-label')?.textContent === 'Connected', null, { timeout: 30000 });
}

try {
  for (const count of [3, 4]) {
    const { page, context } = await newPage(count === 4);
    await ready(page); await setup(page, count, 'hotseat');
    for (let seat = 0; seat < count - 1; seat++) {
      assert.equal(await page.locator('.player-card.is-active .avatar').textContent(), String(seat + 1));
      await dismissTurn(page);
      await page.locator('#pass-button').click();
    }
    await playCardAndRecruit(page);
    assert.equal(await page.locator('.player-card.is-active .avatar').textContent(), '1');
    assert.equal(await page.locator('.player-card').nth(count - 1).locator('.card-count').textContent(), '7/8');
    assert.match(await page.locator('#pass-count').textContent(), new RegExp('0 / ' + count));
    for (let i = 0; i < count; i++) { await dismissTurn(page); await page.locator('#pass-button').click(); }
    assert.match(await page.locator('.round-number').textContent(), /02/);
    const savedRevision = await revision(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.game === 'ready');
    await dismissTurn(page);
    assert.equal(await page.locator('.player-card').count(), count);
    assert.equal(await revision(page), savedRevision);
    const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(widths.content <= widths.viewport + 1);
    await page.waitForFunction(() => document.querySelector('#board-canvas')?.dataset.assets === 'ready', null, {timeout:45000});
    await page.screenshot({ path: 'test-results/' + count + '-player-local.png', fullPage: true });
    await setup(page, count, 'solo'); await page.locator('#pass-button').click();
    await page.waitForFunction(() => document.querySelector('.player-card.is-active .avatar')?.textContent === '1', null, { timeout: 45000 });
    report.local.push(count + ' players: seat rotation, final-seat card/recruitment, pass threshold, reload, responsive layout and practice rivals passed');
    await context.close();
  }

  for (const count of [3, 4]) {
    const clients = [], extras = []; let live = false;
    try {
      const host = await newPage(); clients.push(host); await ready(host.page); await setup(host.page, count, 'online');
      await host.page.waitForFunction(() => document.querySelector('#invite-link').value, null, { timeout: 30000 });
      const link = await host.page.locator('#invite-link').inputValue();
      assert.equal(new URL(link).origin, new URL(base).origin);
      assert.equal(await host.page.locator('#start-table').isDisabled(), true);
      assert.equal(await host.page.locator('#pass-button').isDisabled(), true);
      const guests = await Promise.all(Array.from({ length: count - 1 }, (_, i) => newPage(count === 4 && i === 0, 'Rival ' + (i + 1))));
      clients.push(...guests);
      await Promise.all(guests.map(g => ready(g.page, link)));
      await host.page.waitForFunction(() => document.querySelector('#start-table').disabled === false, null, { timeout: 30000 });
      assert.equal(await host.page.locator('.lobby-seat.is-connected').count(), count);
      for (const guest of guests) {
        await guest.page.waitForFunction(() => [...document.querySelectorAll('.lobby-seat')].some(s => s.textContent.includes('Your seat')));
        guest.seat = Number(await guest.page.locator('.lobby-seat').filter({ hasText: 'Your seat' }).locator('.avatar').textContent());
        assert.equal(await guest.page.locator('#pass-button').isDisabled(), true);
      }
      assert.deepEqual(guests.map(g => g.seat).sort(), Array.from({ length: count - 1 }, (_, i) => i + 2));
      const guestBySeat = [host, ...guests.sort((a, b) => a.seat - b.seat)];
      const pages = guestBySeat.map(g => g.page);
      await guests[0].page.locator('#lobby-name').fill('Grace Hopper');
      await guests[0].page.locator('#rename-player').click();
      await host.page.waitForFunction(() => document.querySelector('#lobby-seats').textContent.includes('Grace Hopper'));
      await host.page.screenshot({ path: 'test-results/' + count + '-player-lobby.png', fullPage: true });
      if (count === 4) {
        const mobileGuest = guests.find(g => g.mobile);
        const widths = await mobileGuest.page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(widths.content <= widths.viewport + 1);
        await mobileGuest.page.screenshot({ path: 'test-results/four-player-mobile-lobby.png', fullPage: true });
      }
      await host.page.locator('#start-table').click();
      await Promise.all(pages.map(connected)); live = true;
      let expected = 0;
      for (let seat = 0; seat < count - 1; seat++) {
        for (let other = 0; other < count; other++) assert.equal(await pages[other].locator('#pass-button').isDisabled(), other !== seat);
        await dismissTurn(pages[seat]);
        await pages[seat].locator('#pass-button').click(); expected++; await synchronized(pages, expected);
      }
      await playCardAndRecruit(pages.at(-1)); expected += 2; await synchronized(pages, expected);
      assert.equal(await pages.at(-1).locator('[data-card="scottish-support"]').getAttribute('class').then(c => c.includes('is-used')), true);
      assert.equal(await pages[0].locator('[data-card="scottish-support"]').getAttribute('class').then(c => c.includes('is-used')), false);
      for (let seat = 0; seat < count; seat++) {
        await dismissTurn(pages[seat]);
        await pages[seat].locator('#pass-button').click(); expected++; await synchronized(pages, expected);
      }
      assert.match(await host.page.locator('.round-number').textContent(), /02/);
      if (count === 4) {
        const returning = guestBySeat[1];
        await returning.page.goto('about:blank');
        const remaining = pages.filter(p => p !== returning.page);
        await Promise.all(remaining.map(p => p.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Paused', null, {timeout:15000})));
        for (const p of remaining) assert.equal(await p.locator('#pass-button').isDisabled(), true);
        const stranger = await newPage(); extras.push(stranger); await ready(stranger.page, link);
        await stranger.page.waitForFunction(() => /original players/.test(document.querySelector('#invite-status').textContent), null, {timeout:30000});
        await ready(returning.page, link); await Promise.all(pages.map(connected));
        await synchronized(pages, expected);
        assert.match(await returning.page.locator('.player-card').nth(1).locator('.player-status').textContent(), /Your|You/);
      }
      // Complete the same shared match, checking every broadcast through its ending.
      for (let step = 0; step < count * 8 && !(await host.page.locator('#result-overlay').isVisible()); step++) {
        const active = Number(await host.page.locator('.player-card.is-active .avatar').textContent()) - 1;
        await dismissTurn(pages[active]);
        await pages[active].locator('#pass-button').click(); expected++; await synchronized(pages, expected);
      }
      assert.equal(await host.page.locator('#result-overlay').isVisible(), true);
      const endings = await Promise.all(pages.map(p => p.locator('#result-overlay h2').textContent()));
      assert.ok(endings.every(text => text === endings[0]));
      assert.deepEqual(report.errors, []);
      report.online.push(count + ' real browsers: shared lobby, unique seats, naming, full turn cycle, personal hand ownership and shared match ending passed' + (count === 4 ? '; disconnect pause, stranger rejection and same-tab refresh reconnection passed' : ''));
    } catch (error) {
      const statuses = await Promise.all(clients.map(async c => { try { return await c.page.locator('#invite-status').textContent({timeout:1000}); } catch { return ''; } }));
      if (!required && !live && statuses.some(s => /network|service|could not|not online|connection failed/i.test(s))) report.online.push(count + '-player external network unavailable: ' + statuses.join(' | '));
      else { report.failure = error.message; throw error; }
    } finally { await Promise.all([...clients, ...extras].map(c => c.context.close())); }
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile('test-results/multiplayer-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
