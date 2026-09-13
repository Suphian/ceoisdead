/**
 * Derive presentation guidance from the current table without changing it.
 * Names are plain text: consumers must use textContent or escape HTML.
 *
 * optionCount is the number of currently displayed card effects. Call after
 * normalizing selectedAction against that list. regionOptions is the selected
 * region's recruit-action array (or its count). Targets are CSS selectors;
 * a null target means that there is no move for this viewer to make.
 */
export function getTurnGuidance({
  game, mode, localSeat, roomReady, roomLobby,
  selectedCard = null, selectedRegion = null, selectedAction = null,
  optionCount = 0, regionOptions = [],
}) {
  const players = game.players;
  const validSeat = Number.isInteger(localSeat) && localSeat >= 0 && localSeat < players.length;
  const viewerSeat = mode === 'solo' ? 0 : mode === 'online' && validSeat ? localSeat : null;
  const seatName = (index, name = players[index]?.name) => {
    // A saved/default name of "You" belongs to its seat, not every viewer.
    // Shared-screen play has no persistent personal "you" either.
    const ambiguous = typeof name === 'string' && name.trim().toLowerCase() === 'you';
    return !name || (ambiguous && index !== viewerSeat) ? `Seat ${index + 1}` : name;
  };
  const active = players[game.activePlayer];
  const activePlayerName = active ? seatName(game.activePlayer) : 'The active player';
  const localPlayerName = mode === 'hotseat' ? null
    : mode === 'solo' ? players[0]?.name ?? null
    : validSeat ? players[localSeat].name : null;
  const connected = mode !== 'online' || (roomReady === true && roomLobby?.started !== false && validSeat);
  const isMyTurn = Boolean(active && game.phase !== 'ended' && connected && (
    mode === 'hotseat' || (mode === 'solo' && game.activePlayer === 0)
    || (mode === 'online' && game.activePlayer === localSeat)
  ));
  const title = mode === 'hotseat' ? `${activePlayerName}’S TURN` : 'YOUR TURN';
  const result = (state, heading, detail, step, target = null) => ({
    state, title: heading, detail, step, target,
    localPlayerName, activePlayerName, isMyTurn,
  });

  if (game.phase === 'ended') {
    return result('ended', 'GAME OVER', 'The succession is settled. Review the result or start a new table.', 'Review the result');
  }

  if (mode === 'online' && !connected) {
    const seats = roomLobby?.seats ?? [];
    const started = roomLobby?.started === true || game.revision > 0 || game.phase === 'summon';
    if (started || (roomReady === true && !validSeat)) {
      const ownSeat = validSeat ? seats.find(seat => seat.seat === localSeat) : null;
      const missing = seats.filter(seat => !seat.connected).map(seat => seatName(seat.seat, seat.name));
      const detail = ownSeat?.connected === false || !validSeat
        ? 'Open Invite friends to reconnect and reclaim your seat. No one can move until the table is connected.'
        : missing.length
          ? `Waiting for ${missing.join(' and ')} to reconnect. Open Invite friends to check the table.`
          : 'The table is reconnecting. Open Invite friends to check the connection; no one can move yet.';
      return result('paused', 'MATCH PAUSED', detail, 'Check the connection', '#invite-button');
    }

    const capacity = roomLobby?.capacity ?? players.length;
    const joined = seats.filter(seat => seat.connected).length;
    const full = seats.length === capacity && joined === capacity;
    if (localSeat === 0) {
      return full
        ? result('lobby', 'TABLE READY', 'Everyone is here. Click Start game with everyone in the lobby.', 'Start the game', '#start-table')
        : result('lobby', 'WAITING FOR FRIENDS', `${joined} of ${capacity} players connected. Open Invite friends and share the table link; start when everyone has joined.`, 'Invite your friends', '#invite-button');
    }
    if (!validSeat) {
      return result('lobby', 'JOINING THE TABLE', 'Your seat is being assigned. Open Invite friends to check the connection.', 'Check the lobby', '#invite-button');
    }
    return result('lobby', 'WAITING FOR HOST', `${seatName(0)} will start the game when everyone has joined. Your cards will become available on your turn.`, 'Wait for the host', '#invite-button');
  }

  if (!isMyTurn) {
    return result('waiting', `WAITING FOR ${activePlayerName}`,
      game.phase === 'summon'
        ? `${activePlayerName} played a card and is choosing one follower to finish their turn.`
        : `${activePlayerName} is choosing a card or passing. Your cards become available on your turn.`,
      game.phase === 'summon' ? 'Wait for their follower choice' : 'Wait for their move');
  }

  if (game.phase === 'summon') {
    const region = game.regions[selectedRegion];
    const count = Array.isArray(regionOptions)
      ? regionOptions.filter(option => !option?.region || option.region === selectedRegion).length
      : Number.isFinite(regionOptions) ? regionOptions : 0;
    if (!selectedRegion || !region || region.control !== null || count <= 0) {
      return result('recruit-region', title,
        selectedRegion
          ? 'There are no followers to recruit from this selection. Choose another unresolved region that still has followers.'
          : 'The card is played. Select an unresolved region with followers on the board or in the region row below it.',
        'Choose a region to recruit from', '#region-rail');
    }
    return result('recruit', title, 'Click one follower button on the right to add that follower to the court and finish the turn.', 'Recruit one follower', '#move-panel .move-options');
  }

  if (active.hand.length === 0) {
    return result('action', title, 'All eight cards are spent. Click Pass turn to continue.', 'Pass turn', '#pass-button');
  }
  if (!selectedCard || !active.hand.includes(selectedCard)) {
    return result('action', title, 'Click an unused card in the hand below the board, or click Pass turn.', 'Choose a card or pass', '#hand');
  }
  if (optionCount <= 0) {
    return result('effect', title,
      selectedRegion
        ? 'This card has no available effects in the selected region. Choose another region, or clear the selection to see all effects.'
        : 'No effect is available in this selection. Choose another card or clear the selection.',
      selectedRegion ? 'Choose another region' : 'Choose another card', selectedRegion ? '#region-rail' : '#hand');
  }
  if (!selectedAction) {
    return result('effect', title, 'Choose the card’s effect from the menu on the right. Selecting a region narrows the choices.', 'Choose the card’s effect', '#action-choice');
  }
  return result('confirm', title, 'Click Play this card on the right. After it is played, recruit one follower to finish the turn.', 'Play this card', '[data-command="confirm-move"]');
}
