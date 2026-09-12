# CEO IS DEAD — prototype rules

An original corporate presentation of a two-player, standard-rules strategy prototype. The code, interface, board geometry and copy are original; no published rulebook text or artwork is bundled.

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

Each player has eight one-use cards and two starting supporters. Setup uses 16 supporters/faction, four/division, including two guaranteed home supporters.

Play one card, maximize its legal effect, then recruit one supporter from any unresolved division; or pass. Playing resets passes.

Resolve the queued division after both players pass consecutively. Plurality claims it; ties create instability. Clear its supporters into supply and close it permanently.

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

## Explicit prototype interpretations

- The final normal-ending tiebreak compares when each player **last played a card**, even if cards remain. The publisher's wording about playing all cards is ambiguous for unspent hands; this implementation does not require exhausting a hand.
- If only one faction controls divisions, neither remaining faction has a claim to rank second. Skip secondary-faction support and use action timing.
- If neither tied player ever acted, share victory. If a card leaves no supporters anywhere on the board, recruitment is impossible and the turn advances.

The implementation currently covers **two-player standard play**. The advanced asymmetric cards and four-player teams are outside this version.

Mechanics reference: [Osprey's official The King Is Dead: Second Edition rulebook](https://www.ospreypublishing.com/media/3yxddtqg/tkid2_rulebook.pdf), by Peer Sylvester. The published game uses historical factions and regions; the corporate names above are this prototype's presentation.

## Implementation notes

`site/game/engine.js` is deterministic and independent of the browser. Every command identifies a legal effect at a specific state revision. A played card and the mandatory recruitment are separate commands; passing is unavailable during recruitment.

Imported snapshots have a 128 KiB text cap and strict shape, count, card, phase, result and log validation. This catches malformed data; it does not establish trust in a remote host or prove that an entire match history was honest. Online clients must send commands to the host, which checks the active seat and current revision before applying them. A local practice opponent uses the same legal-command API.
