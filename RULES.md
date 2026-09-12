# CEO IS DEAD — prototype rules

An original corporate presentation of a 2–4-player strategy prototype. Two and three players compete individually. Four players form two teams: seats 1 + 3 versus seats 2 + 4. No published rulebook text or artwork is bundled.

## Names used at this table

| Corporate faction | Engine ID | Home division |
| --- | --- | --- |
| Founders | `scots` | Research |
| Operators | `welsh` | People |
| Investors | `english` | Sales |

| Division | Engine region ID |
| --- | --- |
| Research | `moray` |
| Product | `strathclyde` |
| Operations | `lancaster` |
| Engineering | `northumbria` |
| People | `gwynedd` |
| Finance | `warwick` |
| Sales | `essex` |
| Ventures | `devon` |

The engine retains historical identifiers so presentation changes do not invalidate saved games. A coalition is a player's collected supporters.

## Play

Each player has eight one-use cards and two starting supporters. Two-player setup uses 16 supporters per faction; three- and four-player setup uses 18. Every division starts with four, including two guaranteed home supporters in each faction's home. Initial supply totals 12, 16, or 14 supporters for two, three, or four players respectively.

Play one card, maximize its legal effect, then recruit one supporter from any unresolved division; or pass. Playing resets passes.

Take turns in seat order, wrapping back to seat 1. Resolve the queued division after every player passes consecutively: two, three, or four passes. A played card resets the sequence. Plurality claims the division; ties create instability. Clear its supporters into supply and close it permanently. The next seat takes the next turn as normal.

| Cards | Effect |
| --- | --- |
| Founders/Operators/Investors Support | Add two matching supporters beside matching controlled territory or its unresolved home. |
| Assemble ×2 | Distribute one available supporter per faction among unresolved divisions. |
| Negotiate | Exchange two unlocked, unresolved contests; lock one of their cards. |
| Manoeuvre | Exchange one supporter per side between different divisions. |
| Outmanoeuvre | Exchange 1:2 across adjacent divisions; 1:1 only when no full exchange exists. |

Exchanges cannot immediately reverse an opponent's same-card exchange. Passes do not remove that restriction.

## Victory

Three instability marks: most complete faction sets wins; latest action breaks ties.

Otherwise resolve all eight divisions. Rank factions by claims, then latest claim. Compare coalition support for first-ranked faction, then second, then earliest final action.

### Four-player teams

Keep cards and courts separate during play. At a normal succession, compare **individual** courts as above; a winning contender wins for their entire team. Do not add teammates' support together for this ending. If tied contenders span both teams after the faction comparisons, use team action timing as described below.

For a hostile takeover, **combine teammates' courts before counting complete sets**. The team with the most combined sets wins. A tie favors the team whose member most recently played a card. Both winning teammates are named in the result.

For the standard team experience, avoid tactical discussion and showing teammates your hand. This browser prototype distributes complete state to clients and does not enforce hand secrecy.

## Explicit prototype interpretations

- The final normal-ending tiebreak compares when each player **last played a card**, even if cards remain. The publisher's wording about playing all cards is ambiguous for unspent hands; this implementation does not require exhausting a hand.
- If only one faction controls divisions, neither remaining faction has a claim to rank second. Skip secondary-faction support and use action timing.
- For a final team succession tie, compare the latest action by either member of each tied team and favor the earlier timestamp. This extends the same unspent-hand interpretation to the published team's hand-exhaustion wording.
- If tied players or teams have indistinguishable action timing, share victory. If a card leaves no supporters anywhere on the board, recruitment is impossible and the turn advances.

The interface supports **two- and three-player individual play and four-player teams**, including practice rivals, same-screen play, and online tables. Advanced asymmetric cards are outside this version.

Mechanics reference: [Osprey's official The King Is Dead: Second Edition rulebook](https://www.ospreypublishing.com/media/3yxddtqg/tkid2_rulebook.pdf), by Peer Sylvester. The published game uses historical factions and regions; the corporate names above are this prototype's presentation.

## Implementation notes

`site/game/engine.js` is deterministic and independent of the browser. Every command identifies a legal effect at a specific state revision. A played card and the mandatory recruitment are separate commands; passing is unavailable during recruitment.

Imported snapshots have a 128 KiB text cap and strict shape, count, card, phase, result and log validation. This catches malformed data; it does not establish trust in a remote host or prove that an entire match history was honest. Online clients must send commands to the host, which checks the active seat and current revision before applying them. A local practice opponent uses the same legal-command API.
