import { FACTIONS, REGIONS, CARDS, createGame, getLegalActions, applyAction, getStandings, chooseAIAction, deserializeGame } from './game/engine.js';
import { GameRoom } from './room.js';
import { COURT, THEMES, normalizeTheme, factionMeta, regionTitle, factionTitle, cardTitle, cardDescription, translate, emblem } from './presentation.js';
import { createExperience } from './experience.js';

  const $ = (s) => document.querySelector(s);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const factionIds = FACTIONS.map(f => f.id);
  let theme = 'medieval';
  let game = createGame({seed:newSeed(),players:['You',COURT[1].name]});
  let mode = 'solo', selectedCard = null, selectedRegion = null, selectedAction = null, room = null;
  let roomReady = false, roomLink = '', roomStatus = '', aiTimer = null, scene = null, view = '3d', history = [];
  let actionCache = {revision:-1,actions:[]};
  let sessionEpoch = 0;
  let localSeat = 0, roomLobby = null, joiningRoomId = null;
  let diceTray = null, diceLoading = false;
  let experience = null;
  const storageKey = 'ceoisdead.session.v1';

  function newSeed() { return crypto.randomUUID().slice(0,8); }
  function regionName(id) { return regionTitle(theme,id); }
  function factionName(id) { return factionTitle(theme,id); }
  function cardName(id) { return cardTitle(theme,id); }
  function words(value) { return translate(theme,value); }
  function portrait(i) { const p=COURT[i%4];return `<span class="portrait" style="--court:${p.color}"><img src="./assets/portraits/${p.image}.png" alt="" width="80" height="80"><span class="avatar" title="Seat ${i+1}">${i+1}</span></span>`; }
  function legal() {
    if(actionCache.revision !== game.revision || actionCache.state !== game) actionCache={revision:game.revision,state:game,actions:getLegalActions(game)};
    return actionCache.actions;
  }
  function isMyTurn() {
    if(game.phase==='ended') return false;
    if(mode==='solo') return game.activePlayer===0;
    if(mode==='online') return roomReady && game.activePlayer===localSeat;
    return true;
  }
  function token(f, count, cls='court-token') { return `<span class="${cls}" style="--faction:${factionMeta[f].color}" title="${escape(factionName(f))}"><span aria-hidden="true">${factionMeta[f].symbol}</span><b>${count}</b><span class="sr-only">${escape(factionName(f))}</span></span>`; }
  function toast(message) {
    const el=$('#toast'); el.textContent=message; el.classList.add('is-visible');
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('is-visible'),4200);
  }
  function save() {
    if(mode==='online') return;
    try { localStorage.setItem(storageKey,JSON.stringify({seed:game.seed,players:game.players.map(p=>p.name),teams:game.teams,mode,theme,history})); } catch {}
  }
  function restore() {
    try {
      const raw=localStorage.getItem(storageKey); if(!raw)return;
      const data=JSON.parse(raw);
      if(!['solo','hotseat'].includes(data.mode)||!Array.isArray(data.history)||data.history.length>256)return;
      let state=createGame({seed:String(data.seed).slice(0,80),players:data.players,teams:data.teams});
      for(const id of data.history) state=applyAction(state,id);
      game=state;history=data.history;mode=data.mode;theme=normalizeTheme(data.theme);
    } catch { /* Start a fresh table if an older save cannot be replayed. */ }
  }

  function mount() {
    $('#app').innerHTML=`
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-command="menu" aria-label="Open the kingdom menu">${emblem('crown')}<span class="brand-name"><strong id="brand-title">THE TOGA IS DEAD</strong><small>A KINGDOM WITHOUT A CROWN</small></span></button>
        <span class="header-note">An empty throne. An open invitation.</span>
        <nav class="header-actions" aria-label="Game controls">
          <button class="button button-ghost" data-command="guide">${emblem('book')} How to play</button>
          <button class="button button-ghost sound-button" data-command="settings" aria-label="Music, sound and atmosphere settings"><span aria-hidden="true">♫</span> <span>Sound &amp; scene</span></button>
          <button class="button button-ghost" data-command="invite" id="invite-button">Invite friends <span aria-hidden="true">＋</span></button>
          <button class="button button-primary" data-command="new-game" data-testid="new-game">New game</button>
        </nav>
      </header>
      <main>
        <div class="game-layout">
          <aside class="briefing-panel" aria-label="Succession agenda">
            <div class="panel-heading"><span class="eyebrow">THE SUCCESSION</span><span class="chip" id="mode-badge"></span></div>
            <div id="round-summary"></div>
            <ol class="agenda" id="agenda"></ol>
            <section class="move-panel" id="move-panel" aria-label="Plan your move"></section>
          </aside>
          <section class="board-stage" aria-label="Interactive game board">
            <div id="board-canvas"></div>
            <div class="board-topline"><div class="stage-title"><span class="eyebrow">THE COASTAL KINGDOM</span><h1 id="stage-heading">The crown awaits.</h1><p class="stage-description" id="stage-description">Three factions. Eight regions. One empty throne.</p></div></div>
            <div class="camera-controls" aria-label="Board view"><button class="button button-small is-selected" data-command="view-3d" aria-pressed="true" title="Reset perspective view">3D</button><button class="button button-small" data-command="view-top" aria-pressed="false" title="Overhead view">Top</button><button class="button button-small" data-command="focus" title="Focus selected region or current contest">Focus</button><button class="button button-small" data-command="atmosphere" id="atmosphere-toggle" title="Change the time of day">☀</button></div>
            <button class="dice-launcher" data-command="dice" aria-haspopup="dialog">${emblem('dice')}<span>Dice tray<small>A little luck on the side</small></span></button>
            <div class="board-event" id="board-event" role="status" aria-live="polite" hidden></div>
            <div id="board-fallback" hidden></div>
            <div class="board-overlay" id="result-overlay" hidden></div>
            <p class="board-help" id="board-help"><span aria-hidden="true">↔</span> Drag to orbit · Scroll to zoom · Select a region</p>
          </section>
          <aside class="players-panel" aria-label="Players and influence">
            <div class="panel-heading"><span class="eyebrow">AT THE TABLE</span><span class="status-line"><span class="status-dot" id="connection-dot"></span><span id="connection-label">Local</span></span></div>
            <div id="players"></div>
            <section class="faction-summary" aria-label="Faction control"><div class="panel-heading"><span class="eyebrow">BALANCE OF POWER</span><span class="muted mono">HELD / RESERVE</span></div><div id="factions"></div></section>
            <section class="activity-panel" aria-label="Recent moves"><div class="panel-heading"><span class="eyebrow">THE CHRONICLE</span></div><ol class="activity-list" id="activity"></ol></section>
          </aside>
        </div>
        <nav class="region-rail" id="region-rail" aria-label="Select a region"></nav>
        <section class="action-dock" aria-label="Your action cards">
          <div class="turn-bar"><span id="turn-portrait" aria-hidden="true"></span><div class="turn-copy" aria-live="polite"><span class="eyebrow" id="turn-label"></span><strong id="turn-heading"></strong><p id="turn-hint"></p></div><div class="turn-actions"><span class="muted mono" id="pass-count"></span><button class="button button-ghost" data-command="clear" id="clear-button" hidden>Cancel selection</button><button class="button button-primary" data-command="pass" id="pass-button" data-testid="pass">Pass turn <span aria-hidden="true">→</span></button></div></div>
          <div class="hand" id="hand"></div>
        </section>
      </main>
      <footer class="site-footer"><span id="footer-mode">A strategy game for two to four.</span><span class="mono" id="seed-label"></span><a href="https://github.com/Suphian/ceoisdead" target="_blank" rel="noopener">Build with us <span aria-hidden="true">↗</span></a></footer>
    </div>
    <dialog class="modal" id="new-game-modal" aria-labelledby="new-game-title">
      <form id="new-game-form" class="modal-card"><header class="modal-header"><div><span class="eyebrow">A FRESH BALANCE OF POWER</span><h2 id="new-game-title">Take your seat.</h2></div><button type="button" class="modal-close" data-close aria-label="Close new game dialog">×</button></header>
      <div class="modal-body"><p class="muted">Everyone wants the title. Choose how you will earn it.</p>
        <div class="mode-options">
          <label class="mode-option"><input type="radio" name="mode" value="solo" checked><strong>Solo practice</strong><small>Fill the other seats with practice rivals.</small></label>
          <label class="mode-option"><input type="radio" name="mode" value="hotseat"><strong>Same screen</strong><small>Two to four friends. One board.</small></label>
          <label class="mode-option"><input type="radio" name="mode" value="online"><strong>Invite friends</strong><small>One invitation link for your whole table.</small></label>
        </div>
        <label class="field-label">Players at the table<select class="field-input" name="player-count" id="player-count"><option value="2">2 players · individual rivals</option><option value="3">3 players · individual rivals</option><option value="4">4 players · two teams of two</option></select></label>
        <p class="format-note" id="player-format-note"></p>
        <div class="form-grid"><label class="field-label">Your name · Seat 1<input class="field-input" name="player-one" maxlength="24" value="You" required autocomplete="off"></label><label class="field-label opponent-field" id="player-two-field">Seat 2<input class="field-input" name="player-two" maxlength="24" value="Friend" autocomplete="off"></label><label class="field-label opponent-field" id="player-three-field" hidden>Seat 3<input class="field-input" name="player-three" maxlength="24" value="Player 3" autocomplete="off"></label><label class="field-label opponent-field" id="player-four-field" hidden>Seat 4<input class="field-input" name="player-four" maxlength="24" value="Player 4" autocomplete="off"></label></div>
        <label class="field-label theme-switch">Your world<select name="theme" class="field-input"><option value="medieval">Medieval · coastal kingdom</option><option value="roman">Roman · imperial succession</option></select></label>
        <p class="muted">Starting a new table replaces your current local game.</p>
      </div><footer class="modal-footer"><button class="button button-primary" type="submit" data-testid="start-game">Begin the succession <span aria-hidden="true">→</span></button></footer></form>
    </dialog>
    <dialog class="modal" id="rules-modal" aria-labelledby="rules-title"><div class="modal-card"><header class="modal-header"><div><span class="eyebrow">A LITTLE INFLUENCE GOES A LONG WAY</span><h2 id="rules-title">How to take the seat.</h2></div><button class="modal-close" data-close aria-label="Close rules">×</button></header><div class="modal-body" id="rules-body"></div><footer class="modal-footer"><button class="button button-primary" data-close>I'm ready to play</button></footer></div></dialog>
    <dialog class="modal" id="invite-modal" aria-labelledby="invite-title"><div class="modal-card"><header class="modal-header"><div><span class="eyebrow">BETTER WITH A RIVAL</span><h2 id="invite-title">Bring friends to the table.</h2></div><button class="modal-close" data-close aria-label="Close invitation">×</button></header><div class="modal-body"><p class="muted" id="invite-description"></p><p class="status-line" id="invite-status" aria-live="polite"></p><label class="field-label">Your table link<input readonly class="field-input invite-link" id="invite-link" aria-label="Invitation link"></label><button class="button button-primary" data-command="copy-link" id="copy-link" disabled>Copy invite link</button><p class="muted">Keep the host tab open. A disconnect pauses everyone; the same guest tab can refresh or rejoin its reserved seat. Some networks may block the direct connection.</p><button class="button button-ghost" data-command="create-room" id="create-room">Start a new online table</button></div></div></dialog>`;
    $('#app').addEventListener('click',onClick);
    $('#app').addEventListener('change',onChange);
    $('#new-game-form').addEventListener('submit',onNewGame);
    $('#invite-status').insertAdjacentHTML('afterend', '<ol class="lobby-seats" id="lobby-seats" aria-label="Lobby seats"></ol><p class="format-note" id="lobby-format"></p><div class="lobby-name"><label class="field-label">Your name<input id="lobby-name" class="field-input" maxlength="24" autocomplete="name"></label><button class="button button-ghost" data-command="rename" id="rename-player">Update name</button></div><button class="button button-primary" id="start-table" data-command="start-table" hidden>Start game with everyone →</button><button class="button button-ghost" id="rejoin-table" data-command="rejoin" hidden>Rejoin your seat</button>');
    const sharing=document.createElement('div');sharing.className='invite-sharing';
    $('#invite-status').after(sharing);sharing.append($('#invite-link').closest('label'),$('#copy-link'));
    updateNewGameForm();
    $('#app').insertAdjacentHTML('beforeend', `<dialog class="modal dice-modal" id="dice-modal" aria-labelledby="dice-title"><div class="modal-card"><header class="modal-header"><div><span class="eyebrow">A LITTLE LUCK ON THE SIDE</span><h2 id="dice-title">Let them roll.</h2></div><button class="modal-close" data-close aria-label="Close dice tray">×</button></header><div id="dice-canvas"></div><div class="dice-caption"><p id="dice-result" role="status" aria-live="polite">Preparing your tray…</p><p class="muted">Just for fun. These rolls don't affect the match.</p></div><footer class="modal-footer"><button class="button button-primary" data-command="roll-dice" id="roll-dice" disabled>Roll dice <span aria-hidden="true">↻</span></button></footer></div></dialog>`);
    $('#dice-modal').addEventListener('close',()=>{if(!$('#dice-modal').open){diceTray?.dispose();diceTray=null;}});
    for(const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  }

  function render() {
    const current=game.order[game.round], standings=getStandings(game), active=game.players[game.activePlayer], mine=isMyTurn();
    $('.app-shell').dataset.playerCount=String(game.players.length);
    document.documentElement.dataset.revision=String(game.revision);
    document.documentElement.dataset.theme=theme;
    $('#brand-title').textContent=THEMES[theme].title.toUpperCase();
    $('.brand-name small').textContent=THEMES[theme].subtitle.toUpperCase();
    document.title=THEMES[theme].title+' — A game of succession';
    $('#mode-badge').textContent=mode==='solo'?'PRACTICE':mode==='online'?'ONLINE':'LOCAL';
    $('#round-summary').innerHTML=`<div class="round-number">${String(Math.min(game.round+1,8)).padStart(2,'0')}<span>/ 08</span></div><p class="round-summary">${game.phase==='ended'?'The succession is settled.':`Next to decide<br><strong>${escape(regionName(current))}</strong>`}</p>`;
    $('#agenda').innerHTML=game.order.map((id,i)=>{const control=game.regions[id].control;return `<li class="agenda-item ${i===game.round?'is-current':''} ${i<game.round?'is-resolved':''}"><span class="agenda-number">${String(i+1).padStart(2,'0')}</span><span class="agenda-name">${escape(regionName(id))}${game.locked.includes(id)?'<span title="Order locked" aria-label="Order locked"> ·</span>':''}</span><span class="agenda-marker" style="--faction:${factionMeta[control]?.color??'#87949b'}">${control==='unstable'?'×':control?factionMeta[control].symbol:i===game.round?'←':'·'}</span></li>`;}).join('');
    $('#players').innerHTML=game.players.map((p,i)=>`<section class="player-card ${i===game.activePlayer&&game.phase!=='ended'?'is-active':''}" style="--court:${COURT[i].color}"><div class="player-heading">${portrait(i)}<div><strong class="player-name">${escape(p.name)}</strong><span class="player-status">${escape(playerStatus(i))}</span></div><span class="card-count" title="Action cards remaining">${p.hand.length}<small>/8</small></span></div><div class="court-grid">${factionIds.map(f=>token(f,p.court[f])).join('')}</div></section>`).join('');
    $('#factions').innerHTML=factionIds.map(f=>`<div class="faction-row"><span class="faction-dot" style="--faction:${factionMeta[f].color}">${factionMeta[f].symbol}</span><span class="stat-label">${escape(factionName(f))}</span><span class="stat-value">${standings.factions.find(r=>r.id===f).regions}<span> / ${game.supply[f]}</span></span></div>`).join('')+`<div class="faction-row"><span class="faction-dot" style="--faction:#87949b">×</span><span class="stat-label">Instability</span><span class="stat-value">${standings.instability}<span> / 3</span></span></div>`;
    $('#activity').innerHTML=game.log.slice(-4).reverse().map(item=>`<li class="activity-item">${escape(words(item.text))}</li>`).join('')||'<li class="activity-item muted">The old order is over. The next move is yours.</li>';
    $('#region-rail').innerHTML=game.order.map(id=>{const r=game.regions[id];return `<button class="region-tab ${selectedRegion===id?'is-selected':''} ${current===id?'is-current':''} ${r.control?'is-resolved':''}" data-region="${id}" aria-pressed="${selectedRegion===id}" aria-label="${escape(regionName(id))}, ${r.control?r.control==='unstable'?'deadlocked':escape(factionName(r.control))+' control':factionIds.map(f=>r.followers[f]+' '+factionName(f)).join(', ')}"><span>${escape(regionName(id))}</span><small>${r.control?(r.control==='unstable'?'× Deadlock':escape(factionName(r.control))):factionIds.map(f=>`<i style="color:${factionMeta[f].color}">${factionMeta[f].symbol} ${r.followers[f]}</i>`).join(' ')}</small></button>`;}).join('');
    $('#connection-label').textContent=mode==='online'?(roomReady?'Connected':roomLobby?.started?'Paused':roomLobby?`${roomLobby.seats.filter(s=>s.connected).length}/${game.players.length} joined`:'Connecting'):'Local';
    $('#connection-dot').style.background=mode==='online'&&!roomReady?'#dfbd81':'#86b6a0';
    $('#stage-heading').textContent=game.phase==='ended'?'A new reign begins.':game.round===0?THEMES[theme].heading:regionName(current)+' is in play.';
    $('.stage-title .eyebrow').textContent='THE COASTAL '+THEMES[theme].place.toUpperCase();
    $('#stage-description').textContent=game.phase==='ended'?words(game.result.reason):THEMES[theme].description;
    $('#turn-portrait').innerHTML=portrait(game.activePlayer);
    $('#turn-label').textContent=game.phase==='ended'?'THE SUCCESSION IS SETTLED':mode==='online'&&!roomReady?'WAITING FOR THE TABLE':mine?`YOUR MOVE · SEAT ${game.activePlayer+1}`:`SEAT ${game.activePlayer+1} AT THE TABLE`;
    $('#turn-heading').textContent=game.phase==='ended'?winnerText():mode==='online'&&!roomReady?(roomLobby?.started?'The match is paused.':'Your table is waiting.'):game.phase==='summon'?(mine?'Recruit one ally.':active.name+' is recruiting.'):mine?'Play a card. Or let it pass.':active.name+' is considering a move.';
    $('#turn-hint').textContent=game.phase==='ended'?words(game.result.reason):mode==='online'&&!roomReady?'Open Invite friends to see the lobby and connection status.':game.phase==='summon'?'Select any open region, then recruit one of its allies.':`Every card is a one-time decision. ${game.players.length} consecutive passes settle the next region.`;
    $('#pass-count').textContent=game.phase==='action'?`${game.passes} / ${game.players.length} PASSES`:'';
    $('#pass-button').hidden=game.phase!=='action';$('#pass-button').disabled=!mine;
    $('#pass-button').innerHTML=game.passes===game.players.length-1?'Pass & settle <span aria-hidden="true">→</span>':'Pass turn <span aria-hidden="true">→</span>';
    $('#clear-button').hidden=!selectedCard&&!selectedRegion;
    const cardPlayer=mode==='online'?(game.players[localSeat]??game.players[0]):mode==='solo'?game.players[0]:active;
    $('#hand').innerHTML=Object.keys(CARDS).map((id,i)=>`<button class="action-card ${selectedCard===id?'is-selected':''} ${!cardPlayer.hand.includes(id)?'is-used':''}" data-card="${id}" aria-pressed="${selectedCard===id}" ${!mine||game.phase!=='action'||!cardPlayer.hand.includes(id)?'disabled':''}><span class="card-top"><span class="card-type">${CARDS[id].faction?'ALLEGIANCE':CARDS[id].kind==='exchange'?'STRATEGY':'INFLUENCE'}</span><span class="card-number">${String(i+1).padStart(2,'0')}</span></span><span class="card-art">${emblem(CARDS[id].faction??(id.startsWith('assemble')?'assemble':id))}</span><strong class="card-title">${escape(cardName(id))}</strong><span class="card-description">${escape(cardDescription(theme,id))}</span><span class="card-bottom">${!cardPlayer.hand.includes(id)?'PLAYED':'ONE USE'}<span aria-hidden="true">${!cardPlayer.hand.includes(id)?'✓':'↗'}</span></span></button>`).join('');
    $('#seed-label').textContent='TABLE '+game.seed.toUpperCase();
    $('#footer-mode').textContent=`${game.players.length} players · ${game.teams?'Two teams':'Individual rivals'} · ${mode==='online'?'Live table':mode==='solo'?'Practice':'Same screen'}`;
    renderMovePanel();renderFallback();renderResult();updateScene();updateInvite();save();scheduleAI();experience?.refresh();
  }

  function renderMovePanel() {
    const planning=isMyTurn()&&(game.phase==='summon'||Boolean(selectedCard));
    const panel=$('.briefing-panel');
    if(panel.classList.contains('is-planning')!==planning)panel.scrollTop=0;
    panel.classList.toggle('is-planning',planning);
    const selected=selectedRegion?game.regions[selectedRegion]:null;
    const regionInfo=selected?`<div class="selected-title"><span class="eyebrow">SELECTED REGION</span><h3>${escape(regionName(selectedRegion))}</h3></div><div class="court-grid">${factionIds.map(f=>token(f,selected.followers[f])).join('')}</div>${selected.control?`<p class="instruction">Settled: ${selected.control==='unstable'?'deadlock':escape(factionName(selected.control))+' control'}.</p>`:''}`:'';
    if(game.phase==='summon'&&isMyTurn()) {
      const options=selectedRegion?legal().filter(a=>a.region===selectedRegion):[];
      $('#move-panel').innerHTML=regionInfo+`<span class="eyebrow">RECRUIT AN ALLY</span><p class="instruction">${selectedRegion?'Choose one ally to add to your personal support.':'Select a region on the board or from the row below it.'}</p><div class="move-options">${options.map(a=>`<button class="button follower-choice" data-execute="${escape(a.id)}" style="--faction:${factionMeta[a.faction].color}">${factionMeta[a.faction].symbol} ${escape(factionName(a.faction))}<span>＋1</span></button>`).join('')}</div>`;
      return;
    }
    if(selectedCard&&isMyTurn()) {
      let options=legal().filter(a=>a.cardId===selectedCard);
      if(selectedRegion)options=options.filter(a=>a.regions.includes(selectedRegion)||!a.regions.length);
      if(!options.some(a=>a.id===selectedAction))selectedAction=options.length===1?options[0].id:null;
      $('#move-panel').innerHTML=`<span class="eyebrow">PLAN YOUR MOVE</span><h3>${escape(cardName(selectedCard))}</h3><p class="instruction">${escape(cardDescription(theme,selectedCard))}</p><label class="field-label" for="action-choice">Choose the effect${selectedRegion?' · '+escape(regionName(selectedRegion)):''}<select id="action-choice" class="field-input" ${!options.length?'disabled':''}><option value="" ${!selectedAction?'selected':''}>${options.length?'Choose a move ('+options.length+')':'No moves in this region'}</option>${options.map(a=>`<option value="${escape(a.id)}" ${a.id===selectedAction?'selected':''}>${escape(words(a.label))}</option>`).join('')}</select></label><p class="instruction">Select a region to narrow the choices. Play the card, then recruit one ally.</p><button class="button button-primary" data-command="confirm-move" ${!selectedAction?'disabled':''}>Play this card <span aria-hidden="true">→</span></button>`;
      return;
    }
    $('#move-panel').innerHTML=regionInfo+`<span class="eyebrow">THE QUIET ADVANTAGE</span><p class="instruction">${game.phase==='ended'?'Review the final board, or begin a new succession.':'You do not own a faction. Collect allies from the faction you think will prevail.'}</p><p class="instruction">Select an action card below to begin.</p>`;
  }

  function winnerText() {
    if(!game.result)return'';
    if(game.teams&&game.result.winners.length===2)return'Team '+(game.players.findIndex(p=>p.id===game.result.winners[0])%2+1)+' takes the seat.';
    if(game.result.winners.length>1)return'A shared succession.';
    return(game.players.find(p=>p.id===game.result.winners[0])?.name??'A contender')+' takes the seat.';
  }
  function renderResult() {
    $('#result-overlay').hidden=game.phase!=='ended';
    if(game.phase==='ended')$('#result-overlay').innerHTML=`<div class="result-card">${emblem('crown')}<span class="eyebrow">${game.result.type==='invasion'?'THE INVASION':THEMES[theme].ending}</span><h2>${escape(winnerText())}</h2><p>${escape(words(game.result.reason))}</p><button class="button button-primary" data-command="new-game">Begin another reign <span aria-hidden="true">↗</span></button></div>`;
  }
  function sceneState() {
    return{theme,courts:game.players.map(p=>factionIds.map(f=>p.court[f])),regions:REGIONS.map(r=>{const region=game.regions[r.id];return{id:r.id,name:regionName(r.id),cubes:factionIds.map(f=>region.followers[f]),controller:factionIds.includes(region.control)?factionIds.indexOf(region.control):null,unstable:region.control==='unstable',resolved:region.control!==null,current:game.order[game.round]===r.id};})};
  }
  function updateScene() { if(scene)try{scene.update(sceneState(),selectedRegion);}catch{useFallback();} }
  function renderFallback() {
    $('#board-fallback').innerHTML=`<div class="fallback-board">${REGIONS.map(r=>{const t=game.regions[r.id];return`<button class="territory ${selectedRegion===r.id?'is-selected':''} ${game.order[game.round]===r.id?'is-current':''}" data-region="${r.id}"><strong>${escape(regionName(r.id))}</strong><span>${t.control?(t.control==='unstable'?'× Deadlock':escape(factionName(t.control))):factionIds.map(f=>token(f,t.followers[f])).join('')}</span></button>`;}).join('')}</div>`;
  }
  function useFallback() {
    document.documentElement.dataset.scene='fallback';
    scene?.dispose();scene=null;$('#board-canvas').hidden=true;$('#board-fallback').hidden=false;
    $('#board-help').textContent='Accessible board view · Select a region to plan your move';
    $('.camera-controls').hidden=true;
  }
  async function setupScene() {
    try{const module=await import('./scene.js');scene=module.createBoardScene($('#board-canvas'),{onRegionClick:selectRegion});updateScene();experience?.applyAtmosphere();document.documentElement.dataset.scene='ready';}
    catch(error){useFallback();document.documentElement.dataset.scene='fallback';console.warn('3D view unavailable; the accessible board is ready.',error.message);}
    $('#board-canvas').addEventListener('board-context-lost',useFallback);
  }
  function selectRegion(id) { selectedRegion=id;selectedAction=null;experience?.audio.play('select');render(); }
  function advance(id, remote=false) {
    if(!remote&&!isMyTurn())return;
    if(mode==='online'&&!roomReady)return;
    if(mode==='online'&&!room.isHost&&!remote){room.sendAction(id,game.revision);return;}
    try{
      const before=game;game=applyAction(game,id);history.push(id);selectedCard=null;selectedAction=null;
      if(game.phase!=='summon')selectedRegion=null;
      if(mode==='online'&&room.isHost)room.broadcast(game);
      render();experience?.transition(before,game);
    }catch(error){toast(error.message);}
  }
  function scheduleAI() {
    if(mode!=='solo'||game.activePlayer===0||game.phase==='ended'){clearTimeout(aiTimer);aiTimer=null;return;}
    const revision=game.revision,epoch=sessionEpoch;
    if(aiTimer&&scheduleAI.revision===revision&&scheduleAI.epoch===epoch)return;
    clearTimeout(aiTimer);scheduleAI.revision=revision;scheduleAI.epoch=epoch;
    aiTimer=setTimeout(()=>{aiTimer=null;
      if(epoch!==sessionEpoch||revision!==game.revision||mode!=='solo'||game.activePlayer===0)return;
      try{const move=chooseAIAction(game);if(move){const before=game;game=applyAction(game,move);history.push(move.id);selectedCard=null;selectedAction=null;render();experience?.transition(before,game);}}catch(error){toast('The court could not move: '+error.message);}
    },game.phase==='summon'?500:850);
  }
  function onClick(event) {
    const button=event.target.closest('button');if(!button||button.disabled)return;
    experience?.audio.unlock();
    if(button.hasAttribute('data-close')){button.closest('dialog')?.close();return;}
    if(button.dataset.region){selectRegion(button.dataset.region);return;}
    if(button.dataset.card){selectedCard=selectedCard===button.dataset.card?null:button.dataset.card;selectedAction=null;experience?.audio.play('select');render();return;}
    if(button.dataset.execute){advance(button.dataset.execute);return;}
    switch(button.dataset.command) {
      case'new-game':$('#new-game-form').elements.theme.value=theme;$('#player-count').value=String(game.players.length);updateNewGameForm();$('#new-game-modal').showModal();break;
      case'menu':experience?.openMenu();break;
      case'guide':experience?.openGuide();break;
      case'settings':experience?.openSettings();break;
      case'atmosphere':experience?.cycleAtmosphere();break;
      case'rules':showRules();break;
      case'dice':openDice();break;
      case'roll-dice':experience?.audio.play('dice');diceTray?.roll();break;
      case'focus':scene?.focusRegion(selectedRegion||game.order[game.round]);break;
      case'invite':updateInvite();$('#invite-modal').showModal();break;
      case'clear':selectedCard=null;selectedRegion=null;selectedAction=null;render();break;
      case'pass':{const action=legal().find(a=>a.type==='pass');if(action)advance(action.id);break;}
      case'confirm-move':if(selectedAction)advance(selectedAction);break;
      case'view-3d':case'view-top':view=button.dataset.command==='view-top'?'top':'3d';scene?.setView(view);for(const b of document.querySelectorAll('.camera-controls button[aria-pressed]')){const active=b===button;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));}break;
      case'create-room':$('#invite-modal').close();$('#new-game-form').elements.mode.value='online';updateNewGameForm();$('#new-game-modal').showModal();break;
      case'start-table':if(room?.start())$('#invite-modal').close();break;
      case'rejoin':if(joiningRoomId)joinRoom(joiningRoomId);break;
      case'rename':{const name=$('#lobby-name').value.trim();if(room?.rename(name)){try{localStorage.setItem('ceoisdead.name',name);}catch{}toast('Your name is updated.');}break;}
      case'copy-link':copyLink();break;
    }
  }
  function onChange(event) { if(event.target.id==='action-choice'){selectedAction=event.target.value||null;renderMovePanel();}else if(event.target.id==='player-count'||event.target.name==='mode')updateNewGameForm(); }
  function updateNewGameForm() {
    const count=Number($('#player-count').value),solo=$('#new-game-form').elements.mode.value==='solo';
    for(const [i,word] of ['two','three','four'].entries()){
      const field=$('#player-'+word+'-field');field.hidden=solo||i+2>count;field.querySelector('input').disabled=field.hidden;
    }
    $('#player-format-note').textContent=count===4?'Teams: seats 1 + 3 versus seats 2 + 4. Each player keeps their own cards and allies.':`${count} individual rivals. ${count} consecutive passes settle a region.`;
  }
  async function openDice() {
    const dialog=$('#dice-modal');if(!dialog.open)dialog.showModal();
    if(diceTray||diceLoading)return;
    diceLoading=true;$('#roll-dice').disabled=true;$('#dice-result').textContent='Preparing your tray…';
    try {
      const {createDiceTray}=await import('./dice.js');
      if(!dialog.open)return;
      diceTray=createDiceTray($('#dice-canvas'),{
        onRolling(rolling){$('#roll-dice').disabled=rolling;if(rolling)$('#dice-result').textContent='Rolling…';},
        onResult(values){$('#dice-result').textContent=values?`${values[0]} + ${values[1]} = ${values[0]+values[1]}`:'A die landed on an edge. Roll again.';}
      });
      $('#roll-dice').disabled=false;$('#dice-result').textContent='Your luck is waiting.';
    } catch(error) {$('#dice-result').textContent='The 3D tray could not load. Close it and try again.';console.warn('Dice tray unavailable:',error.message);}
    finally {diceLoading=false;}
  }
  function onNewGame(event) {
    event.preventDefault();
    const form=new FormData(event.currentTarget),nextMode=form.get('mode');
    const count=Number(form.get('player-count')),bots=COURT.slice(1).map(p=>p.name);
    const names=['one','two','three','four'].slice(0,count).map((word,i)=>i>0&&nextMode==='solo'?bots[i-1]:String(form.get('player-'+word)||`Player ${i+1}`));
    resetGame(nextMode,names,String(form.get('theme')));
    try{localStorage.setItem('ceoisdead.name',names[0]);}catch{}
    $('#new-game-modal').close();
    if(nextMode==='online'){startRoom();$('#invite-modal').showModal();}
  }
  function resetGame(nextMode,names,nextTheme=theme) {
    sessionEpoch++;clearTimeout(aiTimer);room?.close();room=null;roomReady=false;roomLink='';roomStatus='';
    localSeat=0;roomLobby=null;joiningRoomId=null;
    mode=nextMode;theme=normalizeTheme(nextTheme);game=createGame({seed:newSeed(),players:names.map(n=>n.trim().slice(0,24)||'Player')});history=[];
    selectedCard=null;selectedRegion=null;selectedAction=null;
    const url=new URL(location.href);url.searchParams.delete('room');window.history.replaceState({},'',url);
    render();
  }
  function showRules() {
    $('#rules-body').innerHTML=`
    <ol class="rules-list">
      <li class="rules-step"><strong>Back a faction. Keep your options open.</strong><p>You are a contender, not a faction. ${escape(factionIds.map(f=>factionName(f)).join(', '))} compete to control eight regions. The allies beside your name are your personal support.</p></li>
      <li class="rules-step"><strong>Play one card, then recruit one ally.</strong><p>Choose a card and its effect. Then remove one ally from any open region and add it to your support. Every player has eight one-use cards for the entire game.</p></li>
      <li class="rules-step"><strong>Passing can be a power move.</strong><p>${game.players.length} consecutive passes settle the next region on the agenda. The faction with the most allies there takes control. A tie creates deadlock. Settled regions cannot be changed.</p></li>
      <li class="rules-step"><strong>Win the succession.</strong><p>After all eight regions settle, rank factions by regions held, then most recent victory. The contender with the most support in the leading faction wins; ties compare the second faction, then less recent card play. ${game.teams?'In this four-player game, the winning contender brings their teammate to victory. Team courts remain separate for this ending.':''}</p></li>
      <li class="rules-step"><strong>Watch for an invasion.</strong><p>Three deadlocked regions end the game immediately. ${game.teams?'Combine the allies held by seats 1 + 3 and by seats 2 + 4 before counting complete faction sets. The team with more sets wins; ties favor the latest card played by either teammate.':'The contender with the most complete sets of three different allies wins. A tie favors the most recent card play.'}</p></li>
    </ol>${game.teams?'<p class="muted">Seats 1 + 3 form Team 1; seats 2 + 4 form Team 2. Take turns in seat order. For the standard team experience, avoid tactical discussion and showing teammates your hand. A final succession tie compares each team’s latest card play and favors the earlier team.</p>':''}<p class="muted">The client keeps complete game state; it does not enforce hand secrecy. “Negotiate” changes the agenda, not the allies. “Outmanoeuvre” requires neighboring regions. You must use each card's fullest legal effect; the move picker enforces this.</p><a href="https://github.com/Suphian/ceoisdead/blob/main/RULES.md" target="_blank" rel="noopener">Read the full rules &amp; card reference ↗</a>`;
    $('#rules-modal').showModal();
  }
  function playerStatus(i) {
    const parts=['Seat '+(i+1)];
    if(game.teams)parts.push('Team '+(i%2+1));
    if(mode==='online'&&localSeat===i)parts.push('You');
    if(mode==='online'&&!roomReady)parts.push(roomLobby?.seats[i]?.connected?'Joined':'Waiting');
    else if(game.activePlayer===i&&game.phase!=='ended')parts.push('Playing');
    else if(mode==='solo'&&i>0)parts.push('Practice rival');
    return parts.join(' · ');
  }
  function makeRoom() {
    const epoch=sessionEpoch;
    room=new GameRoom({
      onStatus(message,kind){
        if(epoch!==sessionEpoch)return;
        roomStatus=message;
        if(kind==='error'){roomReady=false;if(!room?.connected)roomLobby=null;render();toast(message);}
        else updateInvite();
      },
      onConnected(ready){
        if(epoch!==sessionEpoch)return;
        roomReady=ready;
        if(ready)$('#invite-modal').close();
        render();
      },
      onLobby(lobby){
        if(epoch!==sessionEpoch)return;
        roomLobby=lobby;localSeat=room?.seat??localSeat;roomReady=room?.ready??false;
        if(game.players.length===lobby.capacity&&!lobby.started)game={...game,players:game.players.map((p,i)=>({...p,name:lobby.seats[i].name}))};
        render();
      },
      onState(state){
        if(epoch!==sessionEpoch||room?.isHost)return;
        try{
          const validated=deserializeGame(JSON.stringify(state));
          if(validated.revision<game.revision)return;
          const before=game,notify=roomReady&&validated.revision===game.revision+1;
          game=validated;localSeat=room?.seat??localSeat;mode='online';selectedCard=null;selectedRegion=null;selectedAction=null;render();
          if(notify)experience?.transition(before,game);
        }catch{
          toast('Received an invalid table update. Start a fresh table.');roomReady=false;room?.close();render();
        }
      },
      onAction({actionId,revision,seat}){
        if(epoch!==sessionEpoch||!room?.isHost||!roomReady||game.activePlayer!==seat||game.revision!==revision)return;
        if(legal().some(a=>a.id===actionId))advance(actionId,true);
      }
    });
    return room;
  }
  async function startRoom() {
    roomStatus='Opening the lobby…';updateInvite();
    const epoch=sessionEpoch;
    try{
      const result=await makeRoom().host(game);
      if(epoch!==sessionEpoch)return;
      const inviteUrl=new URL(result.url);inviteUrl.searchParams.set('theme',theme);roomLink=inviteUrl.href;
      updateInvite();render();
    }catch(error){if(epoch!==sessionEpoch)return;roomStatus=error.message;roomReady=false;updateInvite();toast(error.message);}
  }
  async function joinRoom(id) {
    let token='',name='';
    try{token=sessionStorage.getItem('ceoisdead.seat.'+id)||'';name=localStorage.getItem('ceoisdead.name')||'';}catch{}
    resetGame('online',['Host','You']);
    localSeat=null;joiningRoomId=id;
    const inviteUrl=new URL(location.href);inviteUrl.searchParams.set('room',id);inviteUrl.searchParams.set('theme',theme);
    window.history.replaceState({},'',inviteUrl);roomLink=inviteUrl.href;
    roomStatus='Joining your friends’ table…';$('#invite-modal').showModal();updateInvite();
    const epoch=sessionEpoch;
    try{
      const member=await makeRoom().join(id,{token,name});
      if(epoch!==sessionEpoch)return;
      localSeat=member.seat;
      try{sessionStorage.setItem('ceoisdead.seat.'+id,member.token);}catch{}
      toast('You joined seat '+(member.seat+1)+'. '+(room?.ready?'The table is live.':'Waiting for the host to start.'));
      render();
    }catch(error){if(epoch!==sessionEpoch)return;roomStatus=error.message;updateInvite();toast(error.message);}
  }
  function updateInvite() {
    if(!$('#invite-link'))return;
    const online=mode==='online',host=Boolean(room?.isHost),joined=Boolean(room?.connected),started=Boolean(roomLobby?.started);
    $('#invite-description').textContent=online?(host
      ?'Share this one link with '+(game.players.length-1)+' friends. Start when all seats are filled.'
      :'Everyone uses the same invitation link. Your assigned seat stays yours after the game starts.')
      :'Choose two, three, or four players and create an online table. This starts a fresh game.';
    $('#invite-status').textContent=roomStatus||'No online table is open yet.';
    $('#invite-link').value=roomLink;$('#copy-link').disabled=!roomLink;
    $('#create-room').hidden=online&&joined;
    const seats=roomLobby?.seats??[];
    $('#lobby-seats').innerHTML=seats.map(s=>'<li class="lobby-seat '+(s.connected?'is-connected':'')+'">'+portrait(s.seat)+'<div><strong>'+escape(s.name)+'</strong><small>'+(game.teams?'Team '+(s.seat%2+1)+' · ':'')+(s.seat===localSeat?'Your seat':s.seat===0?'Host':'Guest')+'</small></div><span class="seat-state">'+(s.connected?'Joined':started?'Rejoining…':'Open seat')+'</span></li>').join('');
    $('#lobby-format').textContent=seats.length?(game.teams?'Team 1: seats 1 + 3 · Team 2: seats 2 + 4':game.players.length+' individual rivals'):'';
    $('#start-table').hidden=!host||started;
    $('#start-table').disabled=!seats.length||!seats.every(s=>s.connected);
    $('#rejoin-table').hidden=!joiningRoomId||joined;
    $('.lobby-name').hidden=!joined||started;
    $('#rename-player').disabled=!joined||started;
    const nameInput=$('#lobby-name');
    if(document.activeElement!==nameInput)nameInput.value=game.players[localSeat]?.name||'';
    nameInput.disabled=!joined||started;
  }
  async function copyLink() {
    if(!roomLink)return;
    try{await navigator.clipboard.writeText(roomLink);toast('Invite link copied. Send it to your friend.');}
    catch{$('#invite-link').focus();$('#invite-link').select();toast('Select and copy the link above.');}
  }

  const incomingRoom=new URLSearchParams(location.search).get('room');
  if(incomingRoom)theme=normalizeTheme(new URLSearchParams(location.search).get('theme'));
  if(!incomingRoom)restore();
  mount();
  experience=createExperience({getContext:()=>({game,mode,theme,roomReady,localSeat}),onLighting:value=>scene?.setLighting(value),onNewGame:nextMode=>{const form=$('#new-game-form');form.elements.mode.value=nextMode;form.elements.theme.value=theme;$('#player-count').value=String(game.players.length);updateNewGameForm();$('#new-game-modal').showModal();},onFullRules:showRules});
  render();setupScene();
  if(incomingRoom&&/^[a-zA-Z0-9_-]{1,100}$/.test(incomingRoom))joinRoom(incomingRoom);
  else experience.showWelcomeOnce();
  window.addEventListener('beforeunload',()=>{clearTimeout(aiTimer);room?.close();scene?.dispose();diceTray?.dispose();experience?.dispose();});
  document.documentElement.dataset.game='ready';
