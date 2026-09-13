# Standard rules audit

Audited on 2026-09-13 against [Osprey's official The King Is Dead: Second Edition rulebook](https://www.ospreypublishing.com/media/3yxddtqg/tkid2_rulebook.pdf), by Peer Sylvester. Page numbers below are PDF pages. The board diagrams on pages 3 and 5 were also inspected visually. The publisher's PDF and artwork are not bundled in this repository.

Scope: the eight-card standard game for two or three individuals, or four players in opposite-seat teams. The Roman presentation changes names and scenery, not rules. Advanced Cunning Actions are outside this version.

## Checked mechanics

| Mechanic | Implemented behavior and evidence | Source |
| --- | --- | --- |
| Follower totals | Two players use 16 per faction; three/four use 18. `createGame` and conservation invariants enforce the totals. | p. 4 |
| Starting courts and homes | Each player draws two followers. Each region starts with four, including two Scottish in Moray, Welsh in Gwynedd, and English in Essex. Initial reserves total 12/16/14 for 2/3/4 players. Setup tests cover this. | p. 4 |
| Cards and queue | Each player has three Support cards, two Assemble cards, Negotiate, Manoeuvre, and Outmanoeuvre, used once each. Eight region cards are shuffled once at setup. | p. 4 |
| Turn order | Players act in seat order. A card resets consecutive passes. Playing a card retains the actor until recruitment finishes; passing advances immediately. | p. 6 |
| Mandatory recruitment | After a card, only follower-recruit commands are legal. Recruit one board follower, including from an unrelated region, never from the reserve. The next seat acts afterward. Closed regions contain no followers. | p. 6 |
| Partial/no-effect actions | Use the fullest legal effect available. A card with no legal effect may still be spent and requires recruitment if any board follower remains. | p. 6 |
| Support | Both followers enter one open region adjacent to matching controlled territory or the unresolved faction home. Scarce supply reduces the number; a captured home does not prevent support through another controlled base. | p. 9 |
| Assemble | Place one available follower of each faction, together or separately. A depleted faction is omitted without skipping the others. | p. 9 |
| Negotiate | Exchange two unresolved, unlocked queue cards and lock one. This changes the queue, not followers or territorial control. A locked card cannot be exchanged again. | p. 9 |
| Manoeuvre | Exchange one follower per side between any two open regions. Same-faction exchanges are permitted even when they leave the board unchanged. | p. 9 |
| Outmanoeuvre | Exchange 1:2 across an actual shared border. Use 1:1 only when no legal full exchange exists. Same-faction exchanges are permitted. | p. 9 |
| Reversals | An exchange cannot exactly reverse another player's latest same-card action before another card is played. Passes do not clear this restriction. | p. 9 |
| Adjacency | All 13 undirected borders match the printed map. Source-derived adjacency and exchange tests protect this topology. | pp. 3, 5 |
| Region settlement | Exactly 2/3/4 consecutive passes settle the next queued region. A unique plurality controls it; a tied maximum or empty region makes it unstable. All followers return to reserve; the region closes permanently. Normal seat order continues. | p. 6 |
| Invasion | The third unstable region ends the game immediately, including on the eighth settlement. Individuals compare complete three-faction sets, then latest card play. | p. 7 |
| Coronation | Otherwise settle all eight regions. Rank factions by claims, then latest claim. Compare individual support for the leading faction, then the second faction, then the first exhausted hand. | p. 7 |
| Four-player scoring | Seats 1+3 and 2+4 are teams. Keep courts separate for coronation; an individual winner wins with their teammate. Combine courts before counting invasion sets. Invasion ties use the team's latest card; coronation ties prioritize the first team to exhaust both hands. | p. 8 |
| Dice | The rules engine has no dice action or roll-dependent outcome. The separate tray is a local toy; browser smoke coverage verifies it leaves the saved match unchanged. | Standard actions, pp. 6, 9 |

`site/game/engine.js` owns these decisions. `test/engine.test.js`, `test/multiplayer-engine.test.js`, and `test/rules-audit.test.js` check setup, card boundaries, turn transitions, endings, serialization, and deterministic replays.

## Confirmed issue corrected

The old coronation fallback could award an earlier unspent hand over a tied contender who had used all eight cards. This also affected teams. Current scoring first restricts the tie to exhausted contenders, or teams whose two hands are exhausted, and compares completion timing among them. Only if none qualify does the documented fallback apply.

Two complete legal replays demonstrate the correction:

- `official-timing-11`: both contenders have English 3 / Welsh 3. Seat 1 exhausted its hand; seat 2 retained a card. Seat 1 now wins.
- `official-team-timing-2`: the leading individuals tie. Team 1 exhausted both hands; Team 2 retained a card. Team 1 now wins.

Both regression tests failed before the fix and pass afterward. A third replay verifies legacy version-one behavior remains stable.

## Turn clarity and region order

The standard rule does **not** settle or lock a territory after every player's turn. A played card and its recruitment may alter the current contest, but settlement waits for every player to pass consecutively. Negotiate's lock applies only to a region card's position in the queue. Automatically settling after each turn would be a different ruleset. See p. 6 and the Negotiate rule on p. 9.

A disabled hand during recruitment is intentional: choose a region and then a follower to finish that same turn. An unstarted or disconnected online table also disables moves; that is lobby/connection state, not a different game rule.

Strathclyde is not fixed as the first contest. In a deterministic audit of 256 distinct setup seeds, every region appeared first; Strathclyde appeared 31 times. An existing room/save keeps its original queue. One pass in a two-player game leaves the current contest in place; the second consecutive pass settles it.

## Remaining explicit prototype choices

- Seat 1 starts; the printed game chooses the person who most recently visited a castle (p. 4).
- When no tied contender has exhausted a hand, the final coronation fallback favors the earliest last card play. Teams use the earliest of their latest member actions when neither team exhausted both hands. The printed text does not resolve this unspent-hand case (pp. 7-8).
- If only one faction claimed regions, the other two have no latest claim to determine second place. The prototype skips secondary support rather than choosing a faction arbitrarily.
- If the entire board is empty after a card, impossible recruitment is skipped. Indistinguishable final timing shares victory. These boundary choices are documented in [RULES.md](../RULES.md).
- Complete client snapshots do not enforce hidden hands or the printed restriction on inspecting opponents' older discards (p. 6). Team tactics and hand-sharing restrictions remain player responsibilities (p. 8).
- Version-one snapshots retain their original coronation timing interpretation for compatibility. Current games use the corrected exhaustion priority.

No further standard-game engine defect was found in this audit. These documented choices should remain visible when describing the prototype's fidelity to the printed game.
