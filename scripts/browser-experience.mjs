import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, getLegalActions } from '../site/game/engine.js';

const base=process.env.BASE_URL||'http://127.0.0.1:3000';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={checks:[],errors:[]};
async function dismissTurn(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));if(await page.locator('#turn-modal').isVisible())await page.locator('#turn-modal [data-turn-feedback="dismiss"]').click();}
async function client(mobile=false){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:982},isMobile:mobile,reducedMotion:'reduce',ignoreHTTPSErrors:true});
  context.setDefaultTimeout(20000);const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));return{page,context};
}
async function ready(page){await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.game==='ready');await page.waitForFunction(()=>document.querySelector('#board-canvas')?.dataset.assets==='ready',null,{timeout:45000});await page.evaluate(()=>document.fonts.ready);await dismissTurn(page);}
async function loadedImages(page){await page.waitForFunction(()=>[...document.querySelectorAll('img[src]')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:30000});}
async function noOverflow(page){const sizes=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(sizes.content<=sizes.viewport+1,JSON.stringify(sizes));}
try{
  const {page,context}=await client();await ready(page);await loadedImages(page);
  assert.equal(await page.locator('#welcome-modal').isVisible(),true);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'medieval');
  assert.equal(await page.locator('html').getAttribute('data-audio-state'),'locked');
  await page.screenshot({path:'test-results/kingdom-welcome.png'});
  await page.locator('#welcome-modal [data-experience="music"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.musicPlaying==='true');
  await page.locator('#welcome-modal [data-experience="music"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.musicPlaying==='false');
  report.checks.push('First-visit menu, original portraits, gesture-only audio and first-click music toggle');
  await page.locator('#continue-table').click();assert.equal(await page.locator('#welcome-modal').isVisible(),false);
  await dismissTurn(page);
  await page.screenshot({path:'test-results/kingdom-desktop.png',fullPage:true});
  for(const viewport of [{width:1280,height:800},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await noOverflow(page);
    const layout=await page.evaluate(()=>({height:innerHeight,content:document.documentElement.scrollHeight,hand:document.querySelector('.hand').getBoundingClientRect().bottom,board:document.querySelector('.board-stage').getBoundingClientRect().height}));
    assert.ok(layout.content<=layout.height+1&&layout.hand<=layout.height&&layout.board>=285,JSON.stringify({viewport,...layout}));
    await page.screenshot({path:`test-results/kingdom-desktop-${viewport.width}.png`});
    await page.locator('.action-card:not(:disabled)').first().click();
    const move=await page.locator('[data-command="confirm-move"]').boundingBox();assert.ok(move.y+move.height<viewport.height-290,'Move confirmation remains visible beside the board');
    if(viewport.width===1280)await page.screenshot({path:'test-results/kingdom-desktop-move.png'});
    await page.locator('#clear-button').click();
  }
  await page.setViewportSize({width:1512,height:982});
  report.checks.push('Desktop board, eight-card hand and main controls fit at 1280×800 and 1920×1080');
  const saved=await page.evaluate(()=>localStorage.getItem('ceoisdead.session.v1'));
  await page.locator('[data-command="guide"]').click();
  await page.screenshot({path:'test-results/kingdom-guide.png'});
  await page.locator('#guide-next').click();await page.locator('#guide-next').click();
  await page.locator('[data-experience="demo-pass"]').click();await page.locator('[data-experience="demo-pass"]').click();
  assert.match(await page.locator('#demo-result').textContent(),/take control/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ceoisdead.session.v1')),saved);
  await page.locator('#guide-next').click();await page.locator('#guide-next').click();
  assert.equal(await page.locator('.guide-court img').count(),4);
  await page.locator('#guide-next').click();
  report.checks.push('Five-chapter field guide and interactive pass example leave the actual match unchanged');
  await page.locator('[data-command="settings"]').click();
  await page.locator('[data-lighting="night"]').click();
  assert.equal(await page.locator('#board-canvas').getAttribute('data-lighting'),'night');
  await page.locator('#audio-volume').evaluate(el=>{el.value='27';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#audio-volume-value').textContent(),'27%');
  await page.locator('#effects-toggle').click();assert.equal(await page.locator('#effects-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('[data-experience="close-settings"]').click();
  await page.screenshot({path:'test-results/kingdom-moonlight.png',fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.game==='ready');
  await dismissTurn(page);
  assert.equal(await page.locator('#welcome-modal').isVisible(),false);
  assert.equal(await page.locator('html').getAttribute('data-atmosphere'),'night');
  await page.locator('[data-command="settings"]').click();
  assert.equal(await page.locator('#audio-volume-value').textContent(),'27%');assert.equal(await page.locator('#effects-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('[data-lighting="morning"]').click();await page.locator('[data-experience="close-settings"]').click();
  report.checks.push('Three atmosphere controls and independent sound/volume preferences persist across reload');
  await page.locator('[data-testid="new-game"]').click();
  await page.locator('input[name="mode"][value="hotseat"]').check();await page.locator('#player-count').selectOption('4');await page.locator('select[name="theme"]').selectOption('roman');await page.locator('[data-testid="start-game"]').click();
  assert.match(await page.title(),/The Toga Is Dead/);assert.equal(await page.locator('#board-canvas').getAttribute('data-architecture'),'roman');assert.match(await page.locator('#factions').textContent(),/Senate/);assert.match(await page.locator('#region-rail').textContent(),/Latium/);
  for(let i=0;i<4;i++){await dismissTurn(page);await page.locator('#pass-button').click();}
  assert.match(await page.locator('.round-number').textContent(),/02/);assert.equal(await page.locator('#board-event').isVisible(),true);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.game==='ready');
  await dismissTurn(page);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'roman');assert.equal(await page.locator('html').getAttribute('data-revision'),'4');
  await page.waitForFunction(()=>document.querySelector('#board-canvas')?.dataset.assets==='ready',null,{timeout:45000});await loadedImages(page);
  await page.screenshot({path:'test-results/roman-four-player.png',fullPage:true});
  await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const court=await page.locator('.player-card').last().boundingBox(),sidebar=await page.locator('.players-panel').boundingBox();
  assert.ok(court.y+court.height<=sidebar.y+sidebar.height,'All four contenders remain visible on a desktop window');
  await page.screenshot({path:'test-results/roman-four-player-1280.png'});
  report.checks.push('Roman names, architecture, four-player pass threshold and restored history');
  await context.close();

  const phone=await client(true);await ready(phone.page);await loadedImages(phone.page);await noOverflow(phone.page);
  await phone.page.screenshot({path:'test-results/kingdom-mobile-welcome.png'});
  await phone.page.locator('#continue-table').click();await noOverflow(phone.page);
  await dismissTurn(phone.page);
  await phone.page.screenshot({path:'test-results/kingdom-mobile.png',fullPage:true});
  await phone.page.locator('[data-command="guide"]').click();await noOverflow(phone.page);await phone.page.screenshot({path:'test-results/kingdom-mobile-guide.png'});
  await phone.page.locator('[data-experience="close-guide"]').click();await phone.page.locator('[data-command="settings"]').click();await noOverflow(phone.page);await phone.page.screenshot({path:'test-results/kingdom-mobile-settings.png'});
  await phone.context.close();report.checks.push('Phone menu, board, field guide and settings fit without page overflow');

  const legacy=await client(),seed='legacy-corporate-migration';const original=createGame({seed,players:['Ada','Grace']});
  await legacy.context.addInitScript(data=>{localStorage.removeItem('togaisdead.active-game');localStorage.removeItem('togaisdead.games.v1');localStorage.setItem('ceoisdead.session.v1',JSON.stringify(data));localStorage.setItem('kingisdead.welcomed','1');},{seed,players:['Ada','Grace'],mode:'hotseat',theme:'corporate',history:[getLegalActions(original).find(a=>a.type==='pass').id]});
  await ready(legacy.page);assert.equal(await legacy.page.locator('html').getAttribute('data-theme'),'medieval');assert.equal(await legacy.page.locator('html').getAttribute('data-revision'),'1');assert.equal(await legacy.page.locator('.player-card.is-active .player-name').textContent(),'Grace');
  await legacy.context.close();report.checks.push('Existing corporate save migrates to medieval while preserving players, moves and turn');
  assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.message;throw error;}
finally{await writeFile('test-results/experience-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
