import { createAudio } from './audio.js';
import { COURT, GAME_TITLE, emblem, regionTitle, factionTitle } from './presentation.js';

const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ATMOSPHERES = [
  { id: 'morning', name: 'Coastal morning', detail: 'Jade water · soft sunlight', symbol: '☀' },
  { id: 'sunset', name: 'Golden hour', detail: 'Amber skies · warm stone', symbol: '◐' },
  { id: 'night', name: 'Moonlit coast', detail: 'Sapphire water · lantern glow', symbol: '☾' },
];
export function createExperience({ getContext, onNewGame, onLighting, onFullRules }) {
  let atmosphere = 'morning', chapter = 0, demoPasses = 0, eventTimer, reader = null, speechToken = 0;
  try { const saved=localStorage.getItem('kingisdead.atmosphere');if(ATMOSPHERES.some(a=>a.id===saved))atmosphere=saved; } catch {}
  const audio = createAudio({ onChange: refreshAudio });
  $('#app').insertAdjacentHTML('beforeend', `
    <dialog class="modal welcome-modal" id="welcome-modal" aria-labelledby="welcome-title">
      <div class="welcome-art"><img src="./assets/kingdom-panorama.png" alt="An illustrated coastal kingdom of stone castles, terracotta villages and jade water"><button class="seal-close" data-experience="continue" aria-label="Close the kingdom menu">×</button></div>
      <div class="welcome-paper"><div class="welcome-heading"><div><span class="eyebrow">WELCOME TO THE COASTAL KINGDOM</span><h2 id="welcome-title">${GAME_TITLE}.<br>The court is yours.</h2></div><button class="button music-toggle" data-experience="music" aria-pressed="false">♫ <span>Music off</span></button></div>
      <p class="welcome-intro">Gather your friends. Make your alliances. Guide a kingdom through eight moments that will decide its future.</p>
      <div class="menu-modes">
        <button class="menu-mode" data-experience="solo">${emblem('crown')}<strong>Play with the court</strong><span>Solo · clever practice rivals</span></button>
        <button class="menu-mode" data-experience="online">${emblem('negotiate')}<strong>Invite your friends</strong><span>One link · 2–4 players</span></button>
        <button class="menu-mode" data-experience="hotseat">${emblem('assemble')}<strong>Pass &amp; play</strong><span>One screen · a shared table</span></button>
      </div>
      <div class="court-introduction"><div class="court-faces">${COURT.map(p=>`<img src="./assets/portraits/${p.image}.png" alt="${p.name}" width="60" height="60" style="--court:${p.color}">`).join('')}</div><p><strong>Four contenders. Endless allegiances.</strong><span>Your rivals have a face. Your loyalties are yours to choose.</span></p></div>
      <footer class="welcome-footer"><button class="button button-ghost" data-experience="guide">${emblem('book')} Open the field guide</button><button class="button button-primary" data-experience="continue" id="continue-table">Explore the board →</button></footer>
      <p class="menu-note">Free to play · No accounts · Medieval &amp; Roman worlds</p></div>
    </dialog>
    <dialog class="modal guide-modal" id="guide-modal" aria-labelledby="guide-title"><div class="guide-book"><button class="seal-close" data-experience="close-guide" aria-label="Close the field guide">×</button><div class="guide-illustration" id="guide-illustration"></div><div class="guide-page"><span class="eyebrow" id="guide-kicker"></span><h2 id="guide-title"></h2><div id="guide-copy"></div><div class="guide-reading"><button class="button button-small" data-experience="narrate" id="narration-button">▷ Read aloud</button><label class="sr-only" for="narration-speed">Reading speed</label><select id="narration-speed" aria-label="Reading speed"><option value="0.85">0.85×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option></select><span class="muted" id="narration-status" role="status">Your device’s voice</span></div><div class="guide-navigation"><button class="button button-ghost" data-experience="previous" id="guide-previous">← Back</button><span id="guide-progress"></span><button class="button button-primary" data-experience="next" id="guide-next">Next →</button></div><button class="text-button" data-experience="full-rules">Read the complete rules &amp; tiebreaks ↗</button></div></div></dialog>
    <dialog class="modal settings-modal" id="settings-modal" aria-labelledby="settings-title"><div class="modal-card"><header class="modal-header"><div><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="settings-title">Sound &amp; atmosphere</h2></div><button class="seal-close" data-experience="close-settings" aria-label="Close sound and atmosphere settings">×</button></header>
      <div class="settings-section"><div><h3>The quiet coast</h3><p>An original arrangement of plucked strings, woodwind and ocean air.</p></div><button class="button music-toggle" data-experience="music" aria-pressed="false">♫ <span>Music off</span></button></div>
      <div class="settings-section"><div><h3>Table sounds</h3><p>Cards, followers, and a new reign.</p></div><button class="button" id="effects-toggle" data-experience="effects" aria-pressed="true">Effects on</button></div>
      <label class="volume-control" for="audio-volume"><span>Volume</span><input type="range" id="audio-volume" min="0" max="100" step="1" value="35"><output id="audio-volume-value" for="audio-volume">35%</output></label>
      <p class="audio-status" id="audio-status" role="status"></p>
      <div class="settings-divider"><span class="eyebrow">THE LIGHT OVER YOUR KINGDOM</span></div><div class="atmosphere-options">${ATMOSPHERES.map(a=>`<button class="atmosphere-option ${a.id}" data-experience="lighting" data-lighting="${a.id}" aria-pressed="false"><span class="atmosphere-swatch">${a.symbol}</span><strong>${a.name}</strong><small>${a.detail}</small></button>`).join('')}</div>
      <p class="settings-note">These settings stay on this device. Music pauses when you leave the tab.</p></div></dialog>
  `);
  function refreshAudio() {
    if(!$('#effects-toggle'))return;
    const state=audio.getState();
    document.documentElement.dataset.audioState=state.status;
    document.documentElement.dataset.musicPlaying=String(state.playing);
    document.querySelectorAll('.music-toggle').forEach(button=>{button.setAttribute('aria-pressed',String(state.music));button.querySelector('span').textContent=state.music?'Music on':'Music off';});
    $('#effects-toggle').setAttribute('aria-pressed',String(state.sfx));$('#effects-toggle').textContent=state.sfx?'Effects on':'Effects off';
    $('#audio-volume').value=String(Math.round(state.volume*100));$('#audio-volume-value').textContent=Math.round(state.volume*100)+'%';
    $('#audio-status').textContent=state.supported===false?'Audio is unavailable in this browser.':state.status==='blocked'?'Your browser paused audio. Tap Music to try again.':'';
  }
  function closeExperience() { for(const id of ['welcome-modal','guide-modal','settings-modal'])$('#'+id).close();stopReading(); }
  function markWelcomed() { try{localStorage.setItem('kingisdead.welcomed','1');}catch{} }
  function openMenu() { closeExperience();refresh();$('#welcome-modal').showModal(); }
  function openSettings() { closeExperience();refreshAudio();applyAtmosphere();$('#settings-modal').showModal(); }
  function refresh() { const {game}=getContext();$('#continue-table').textContent=game.revision?'Continue your table →':'Explore the board →'; }
  function showWelcomeOnce() { let seen=false;try{seen=localStorage.getItem('kingisdead.welcomed')==='1';}catch{}if(!seen)openMenu(); }
  function applyAtmosphere() {
    document.documentElement.dataset.atmosphere=atmosphere;onLighting(atmosphere);
    document.querySelectorAll('[data-lighting]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lighting===atmosphere)));
    const choice=ATMOSPHERES.find(a=>a.id===atmosphere);$('#atmosphere-toggle').textContent=choice.symbol;$('#atmosphere-toggle').title=choice.name+' · change atmosphere';
  }
  function setAtmosphere(value) { atmosphere=value;try{localStorage.setItem('kingisdead.atmosphere',value);}catch{}applyAtmosphere(); }
  function cycleAtmosphere() { setAtmosphere(ATMOSPHERES[(ATMOSPHERES.findIndex(a=>a.id===atmosphere)+1)%3].id); }
  function chapters() {
    const {game,theme}=getContext(),factions=['scots','welsh','english'].map(f=>factionTitle(theme,f));
    return [
      { title:'An empty throne.<br>A delicate balance.', icon:'crown', eyebrow:'I · THE KINGDOM', text:`<p>The ruler is gone. <strong>${factions.join(', ')}</strong> vie for control of eight regions. You are a contender watching the balance shift.</p><p>You don’t own a faction. Collect followers from the faction you believe will prevail. Change your mind when the kingdom changes.</p>`, caption:'Support a faction. Claim the crown.', art:`<div class="guide-influence"><div class="guide-diagram-region">${emblem('manoeuvre')}<div><strong>The kingdom</strong><small>Factions compete for eight regions.</small><div class="guide-diagram-followers">◆ ◆ ◆</div></div></div><div class="guide-diagram-arrow">↓ Gather followers from the board</div><div class="guide-diagram-court"><img src="./assets/portraits/elara.png" alt="Lady Elara"><div><strong>Your court</strong><small>Build support for the faction you believe will win.</small><div class="guide-diagram-followers">◆ ◆</div></div></div><div class="guide-diagram-finale">${emblem('crown')}The strongest court inherits.</div></div>` },
      { title:'One card.<br>Then one follower.', icon:'negotiate', eyebrow:'II · YOUR TURN', text:'<p>Each contender has <strong>eight cards for the entire game</strong>. Choose a card, select a region to narrow its effects, then confirm your move.</p><p>After playing, recruit one follower from <strong>any unresolved region</strong> into your own court. Your new follower may change who controls that region.</p><p>Played cards stay spent. Make every decision count.</p>', caption:'1 · Play a card     2 · Recruit a follower', art:`<div class="guide-card-example">${emblem('scots')}<strong>${factions[0]} Support</strong><small>A one-use decision</small></div><span class="guide-arrow">→</span><div class="guide-follower">◆<small>+1 to your court</small></div>` },
      { title:'Sometimes, the<br>best move is a pass.', icon:'manoeuvre', eyebrow:'III · THE SUCCESSION', text:`<p>You may pass instead of playing a card. <strong>${game.players.length} consecutive passes</strong> settle the next region on the succession list.</p><p>The faction with the most followers there takes control. A tie leaves the region unstable. All followers there return to the reserve.</p><p>Any card breaks the passing sequence. Try the miniature example on the left.</p>`, caption:'A demonstration — your match stays unchanged', art:`<div class="guide-region">${emblem('manoeuvre')}<strong>A region in contention</strong><div class="demo-counts"><span>◆ ◆ ◆</span><span>●</span><span>▲</span></div><p id="demo-result">${demoPasses} / ${game.players.length} passes</p><button class="button button-primary" data-experience="demo-pass">Try a pass →</button></div>` },
      { title:'The crown goes<br>where influence lies.', icon:'crown', eyebrow:'IV · A NEW REIGN', text:`<p>When all eight regions are settled, the faction with the most regions prevails. <strong>The contender holding the most followers of that faction wins.</strong></p><p>But if three regions become unstable, invasion ends the game early. Complete sets of all three factions then decide the winner.</p><p>${game.teams?'Four-player teams combine their courts for an invasion, but compare individual contenders for a coronation.':'Ties have their own rules. The full reference explains faction order and action timing.'}</p>`, caption:'The kingdom remembers your alliances.', art:`<div class="guide-winner">${emblem('crown')}<div class="guide-factions">${['scots','welsh','english'].map(f=>emblem(f)).join('')}</div><span>Influence, not ownership.</span></div>` },
      { title:'A place at<br>the table for everyone.', icon:'assemble', eyebrow:'V · THE COURT', text:'<p>Play solo with practice rivals, share one screen, or invite friends with a private table link. Guests need no account.</p><p><strong>Two or three players compete individually.</strong> Four players form teams: seats 1 + 3 against 2 + 4.</p><p>Each seat has its own contender portrait. These characters have no special powers; your choices decide the game. In an online match, keep the host tab open.</p>', caption:'Your seat. Your court. Your story.', art:`<div class="guide-court">${COURT.map(p=>`<div><img src="./assets/portraits/${p.image}.png" alt="${p.name}"><strong>${p.name}</strong><small>${p.role}</small></div>`).join('')}</div>` },
    ];
  }
  function renderGuide() {
    stopReading();const pages=chapters(),page=pages[chapter];
    $('#guide-kicker').textContent=page.eyebrow;$('#guide-title').innerHTML=page.title;$('#guide-copy').innerHTML=page.text;
    $('#guide-illustration').innerHTML=`<span class="guide-bookmark">THE SUCCESSION FIELD GUIDE</span><div class="guide-art">${page.art}</div><p class="guide-caption">${page.caption}</p>`;
    $('#guide-progress').textContent=(chapter+1)+' / '+pages.length;$('#guide-previous').disabled=chapter===0;$('#guide-next').textContent=chapter===pages.length-1?'I’m ready to play →':'Next chapter →';
    $('#narration-button').disabled=!('speechSynthesis' in window);$('#narration-status').textContent='speechSynthesis' in window?'Your device’s voice':'Reading aloud is unavailable';
  }
  function openGuide() { closeExperience();chapter=0;demoPasses=0;renderGuide();$('#guide-modal').showModal(); }
  function stopReading() { speechToken++;if('speechSynthesis' in window)window.speechSynthesis.cancel();reader=null;if($('#narration-button'))$('#narration-button').textContent='▷ Read aloud'; }
  function readChapter() {
    if(reader){stopReading();return;}if(!('speechSynthesis' in window))return;
    const token=++speechToken;reader=new SpeechSynthesisUtterance($('#guide-title').textContent+'. '+$('#guide-copy').textContent);reader.lang='en-US';reader.rate=Number($('#narration-speed').value);
    const voice=window.speechSynthesis.getVoices().find(v=>/^en/.test(v.lang)&&v.localService);if(voice)reader.voice=voice;
    reader.onend=reader.onerror=()=>{if(token===speechToken){reader=null;$('#narration-button').textContent='▷ Read aloud';}};
    $('#narration-button').textContent='■ Stop reading';window.speechSynthesis.speak(reader);
  }
  function transition(before,after) {
    if(before.seed!==after.seed||after.revision<=before.revision)return;
    if(after.phase==='ended'){audio.play('win');announce('A new reign begins',after.result.type==='invasion'?'The kingdom faces invasion.':'The succession is settled.');}
    else if(after.round!==before.round){audio.play('resolve');const id=before.order[before.round],control=after.regions[id].control,theme=getContext().theme;announce(regionTitle(theme,id)+' is settled',control==='unstable'?'Instability spreads through the kingdom.':factionTitle(theme,control)+' take control.');}
    else audio.play(before.phase==='summon'?'recruit':after.phase==='summon'?'card':'pass');
  }
  function announce(title,message) { const el=$('#board-event');el.innerHTML=`${emblem('crown')}<div><strong>${safe(title)}</strong><span>${safe(message)}</span></div>`;el.hidden=false;clearTimeout(eventTimer);eventTimer=setTimeout(()=>el.hidden=true,4000); }
  function onClick(event) {
    const button=event.target.closest('[data-experience]');if(!button||button.disabled)return;
    void audio.unlock();const command=button.dataset.experience;
    if(['solo','online','hotseat'].includes(command)){markWelcomed();closeExperience();onNewGame(command);return;}
    switch(command){
      case'continue':markWelcomed();closeExperience();break;
      case'guide':openGuide();break;
      case'close-guide':case'close-settings':closeExperience();break;
      case'full-rules':closeExperience();onFullRules();break;
      case'music':audio.setMusic(!audio.getState().music);break;
      case'effects':audio.setSfx(!audio.getState().sfx);audio.play('select');break;
      case'lighting':setAtmosphere(button.dataset.lighting);break;
      case'previous':chapter=Math.max(0,chapter-1);renderGuide();break;
      case'next':if(chapter===chapters().length-1){markWelcomed();closeExperience();}else{chapter++;renderGuide();}break;
      case'narrate':readChapter();break;
      case'demo-pass':{const count=getContext().game.players.length;demoPasses=(demoPasses+1)%(count+1);$('#demo-result').textContent=demoPasses===count?factionTitle(getContext().theme,'scots')+' take control!':demoPasses+' / '+count+' passes';audio.play(demoPasses===count?'resolve':'pass');break;}
    }
  }
  function onInput(event) { if(event.target.id==='audio-volume')audio.setVolume(Number(event.target.value)/100); }
  function onVisibility() { if(document.hidden)stopReading(); }
  $('#app').addEventListener('click',onClick);$('#app').addEventListener('input',onInput);document.addEventListener('visibilitychange',onVisibility);
  for(const id of ['welcome-modal','guide-modal','settings-modal']){const dialog=$('#'+id);dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('close',stopReading);}
  refreshAudio();applyAtmosphere();
  return { audio, refresh, openMenu, openGuide, openSettings, showWelcomeOnce, applyAtmosphere, cycleAtmosphere, transition, dispose(){clearTimeout(eventTimer);stopReading();audio.dispose();$('#app').removeEventListener('click',onClick);$('#app').removeEventListener('input',onInput);document.removeEventListener('visibilitychange',onVisibility);} };
}
