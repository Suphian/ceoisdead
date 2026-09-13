import { COURT, cardTitle, normalizeTheme, translate, emblem } from './presentation.js';

/** Local presentation only: never submits an action or changes the supplied game. */
export function createTurnFeedback({ root = document.body, onDismiss } = {}) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  let previous = null, pending = null, announcedTurn = null;
  let frame = null, toastTimer = null, disposed = false, lastCardKey = '';

  const modal = doc.createElement('dialog');
  modal.id = 'turn-modal';
  modal.className = 'turn-feedback-modal';
  modal.setAttribute('aria-labelledby', 'turn-modal-title');
  modal.setAttribute('aria-describedby', 'turn-modal-detail');
  modal.innerHTML = `<div class="turn-feedback-paper">
    <span class="turn-feedback-eyebrow">THE NEXT MOVE IS YOURS</span>
    <div class="turn-feedback-portrait" aria-hidden="true"><img alt="" width="88" height="88"><span>${emblem('crown')}</span></div>
    <p id="turn-modal-player" class="turn-feedback-player"></p>
    <h2 id="turn-modal-title"></h2>
    <p id="turn-modal-detail"></p>
    <button type="button" class="button button-primary" data-turn-feedback="dismiss" autofocus>Let’s play <span aria-hidden="true">→</span></button>
  </div>`;

  const lastCard = doc.createElement('aside');
  lastCard.id = 'last-played-card';
  lastCard.className = 'last-played-card';
  lastCard.hidden = true;
  lastCard.setAttribute('aria-label', 'Last played card and latest move');
  lastCard.setAttribute('aria-live', 'polite');
  lastCard.setAttribute('aria-atomic', 'true');
  lastCard.innerHTML = '<span class="last-played-art" aria-hidden="true"></span><div><span class="turn-feedback-eyebrow" id="last-played-by"></span><strong id="last-played-title"></strong><p id="last-played-detail"></p><small id="last-played-activity"></small></div>';

  const toast = doc.createElement('div');
  toast.id = 'played-card-toast';
  toast.className = 'played-card-toast';
  toast.hidden = true;
  // The persistent card announces the same information once to assistive tools.
  toast.setAttribute('aria-hidden', 'true');
  toast.innerHTML = '<div class="played-card-paper"><span class="turn-feedback-eyebrow"></span><span class="played-card-art"></span><strong></strong><p></p></div>';
  root.append(modal);

  const find = (element, selector) => element.querySelector(selector);
  const cardArt = id => emblem(({ 'scottish-support': 'scots', 'welsh-support': 'welsh', 'english-support': 'english' })[id] || (id?.startsWith('assemble') ? 'assemble' : id || 'book'));
  const describe = (theme, text) => translate(theme, text).replace(/\bsummons\b/g, 'recruits');

  function attachBoardFeedback() {
    const board = root.querySelector('.board-stage') || doc.querySelector('.board-stage');
    if (board && lastCard.parentNode !== board) board.append(lastCard, toast);
  }

  function hideToast() {
    view.clearTimeout(toastTimer);
    toastTimer = null;
    toast.hidden = true;
  }

  function closeModal() {
    if (modal.open) modal.close();
  }

  function dismiss(reason = 'dismiss') {
    const wasOpen = modal.open;
    pending = null;
    closeModal();
    if (wasOpen) onDismiss?.({ reason, turn: announcedTurn });
  }

  function presentPending() {
    frame = null;
    if (disposed || !pending || !modal.isConnected || doc.hidden) return;
    if ([...doc.querySelectorAll('dialog[open]')].some(dialog => dialog !== modal)) return;
    const { key, name, seat, character, hotseat, firstTurn } = pending;
    find(modal, '.turn-feedback-eyebrow').textContent = hotseat ? 'PASS THE SCREEN' : 'THE NEXT MOVE IS YOURS';
    find(modal, '#turn-modal-player').textContent = `${name} · Seat ${seat + 1}`;
    find(modal, '#turn-modal-title').textContent = hotseat ? `${name}’s turn` : 'It’s your turn';
    find(modal, '#turn-modal-detail').textContent = firstTurn
      ? 'Play one card, then recruit one ally. Or pass and keep your cards for later.'
      : 'Choose your next card, then recruit one ally. Passing is a move, too.';
    const portrait = find(modal, '.turn-feedback-portrait img');
    const hasPortrait = typeof character?.image === 'string' && /^[a-z0-9_-]+$/i.test(character.image);
    portrait.hidden = !hasPortrait;
    find(modal, '.turn-feedback-portrait > span').hidden = hasPortrait;
    if (hasPortrait) portrait.src = new URL(`./assets/portraits/${character.image}.png`, import.meta.url).href;
    modal.dataset.turn = key;
    hideToast();
    modal.showModal();
    announcedTurn = key;
    pending = null;
    find(modal, '[data-turn-feedback="dismiss"]').focus({ preventScroll: true });
  }

  function queuePresentation() {
    if (disposed || !pending || frame !== null) return;
    frame = view.requestAnimationFrame(presentPending);
  }

  function update({ game, mode = 'solo', localSeat = 0, roomReady = false, roomLobby, characters = COURT, theme = 'medieval', paused = false }) {
    if (disposed || !game) return;
    attachBoardFeedback();
    const skin = normalizeTheme(theme);
    const log = game.log || [];
    const newTable = !previous || previous.seed !== game.seed;
    const ready = !paused && (mode !== 'online' || Boolean(roomReady && roomLobby?.started !== false));
    const viewerSeat = mode === 'online' ? localSeat : 0;
    const mine = mode === 'hotseat' || (Number.isInteger(viewerSeat) && game.activePlayer === viewerSeat);
    const actionable = ready && mine && game.phase === 'action';
    if (newTable) {
      pending = null;
      announcedTurn = null;
      lastCardKey = '';
      closeModal();
      hideToast();
    }

    const lastPlay = log.findLast(entry => entry.type === 'play');
    const latest = log.at(-1);
    const actor = lastPlay && game.players.find(player => player.id === lastPlay.player);
    const latestKey = JSON.stringify([game.seed, skin, lastPlay?.revision, latest?.revision, latest?.text, actor?.name]);
    if (latestKey !== lastCardKey) {
      lastCardKey = latestKey;
      lastCard.hidden = !latest;
      lastCard.dataset.cardId = lastPlay?.cardId || '';
      lastCard.dataset.revision = String(lastPlay?.revision || 0);
      find(lastCard, '.last-played-art').innerHTML = cardArt(lastPlay?.cardId);
      find(lastCard, '#last-played-by').textContent = lastPlay ? `Last card · ${actor?.name || 'A contender'}` : 'Latest move';
      find(lastCard, '#last-played-title').textContent = lastPlay ? cardTitle(skin, lastPlay.cardId) : describe(skin, latest?.text || '');
      find(lastCard, '#last-played-detail').textContent = lastPlay ? describe(skin, lastPlay.detail) : 'No cards played yet.';
      find(lastCard, '#last-played-activity').textContent = lastPlay && latest !== lastPlay ? describe(skin, latest.text) : '';
    }

    const playedByOpponent = lastPlay && game.players.findIndex(player => player.id === lastPlay.player) !== viewerSeat;
    if (!newTable && previous.ready && ready && mode !== 'hotseat' && playedByOpponent && lastPlay.revision > previous.revision) {
      find(toast, '.turn-feedback-eyebrow').textContent = `${actor?.name || 'A contender'} played`;
      find(toast, '.played-card-art').innerHTML = cardArt(lastPlay.cardId);
      find(toast, 'strong').textContent = cardTitle(skin, lastPlay.cardId);
      find(toast, 'p').textContent = describe(skin, lastPlay.detail);
      hideToast();
      toast.dataset.cardId = lastPlay.cardId;
      toast.dataset.revision = String(lastPlay.revision);
      // Restart the arrival animation if another opponent's card follows quickly.
      void toast.offsetWidth;
      toast.hidden = false;
      toastTimer = view.setTimeout(hideToast, 3600);
    }

    // A card effect keeps the same turn through recruitment. Completed passes,
    // recruits and the no-allies notice identify actual new turns instead.
    const boundary = log.findLast(entry => ['pass', 'summon', 'notice'].includes(entry.type))?.revision || 0;
    const key = `${game.seed}:${game.activePlayer}:${boundary}`;
    if (!actionable) {
      pending = null;
      closeModal();
      if (!ready || (mine && game.phase === 'summon') || game.phase === 'ended') hideToast();
    } else if (announcedTurn !== key) {
      if (modal.open && modal.dataset.turn !== key) closeModal();
      pending = { key, name: game.players[game.activePlayer].name, seat: game.activePlayer, character: characters[game.activePlayer], hotseat: mode === 'hotseat', firstTurn: game.revision === 0 };
      queuePresentation();
    }
    previous = { seed: game.seed, revision: game.revision, ready };
  }

  function onClick(event) {
    if (event.target.closest('[data-turn-feedback="dismiss"]')) dismiss('button');
    else if (event.target === modal) dismiss('backdrop');
  }
  function onCancel(event) { event.preventDefault(); dismiss('escape'); }
  const observer = new view.MutationObserver(queuePresentation);
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  modal.addEventListener('click', onClick);
  modal.addEventListener('cancel', onCancel);
  doc.addEventListener('visibilitychange', queuePresentation);

  function dispose() {
    if (disposed) return;
    disposed = true;
    pending = null;
    observer.disconnect();
    doc.removeEventListener('visibilitychange', queuePresentation);
    modal.removeEventListener('click', onClick);
    modal.removeEventListener('cancel', onCancel);
    if (frame !== null) view.cancelAnimationFrame(frame);
    hideToast();
    closeModal();
    modal.remove();
    lastCard.remove();
    toast.remove();
  }

  return { update, dismiss, dispose };
}
