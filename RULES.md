# The Toga Is Dead — prototype rules

An independent browser implementation of the standard 2–4-player mechanics of *The King Is Dead: Second Edition*. Two and three players compete individually. Four players form teams: seats 1 + 3 versus seats 2 + 4. The medieval and optional Roman presentations use the same rules. No published rulebook prose or artwork is bundled.

You are a contender, not a faction. Followers collected in your **court** represent your support for the three factions. The illustrated characters have no special abilities.

## Factions and regions

| Medieval faction | Roman label | Engine ID | Medieval home |
| --- | --- | --- | --- |
| Scottish | Senate | `scots` | Moray |
| Welsh | Citizens | `welsh` | Gwynedd |
| English | Legions | `english` | Essex |

| Region / engine ID | Roman label | Previous corporate label |
| --- | --- | --- |
| Moray / `moray` | Cisalpina | Research |
| Strathclyde / `strathclyde` | Etruria | Product |
| Lancaster / `lancaster` | Latium | Operations |
| Northumbria / `northumbria` | Umbria | Engineering |
| Gwynedd / `gwynedd` | Sardinia | People |
| Warwick / `warwick` | Campania | Finance |
| Essex / `essex` | Apulia | Sales |
| Devon / `devon` | Sicilia | Ventures |

Engine identifiers and adjacency remain stable across presentations. Older corporate factions were Founders (`scots`), Operators (`welsh`), and Investors (`english`). Local saves using that theme now display the medieval kingdom without changing their history.

## Setup and turns

Each player receives eight one-use cards and two random followers. Two-player setup uses 16 followers per faction; three- and four-player setup uses 18. Every region starts with four followers, including two guaranteed home followers in each faction's home. The initial reserve contains 12, 16, or 14 followers for two, three, or four players respectively. The eight regions receive a shuffled resolution order. Seat 1 starts this prototype.

On your turn, either **play one card and then recruit one follower**, or **pass**. Use the card's fullest legal effect; the move picker enforces this. Recruit from any unresolved region into your court, even a region unaffected by your card. Played cards remain spent. If a card has no legal effect, you may still spend it and recruit.

Play proceeds in seat order. When every player passes consecutively, resolve the next region: two, three, or four passes depending on the player count. A played card resets the sequence. The faction with the most followers there claims the region; a tie makes it unstable. Return all its followers to the reserve and close the region permanently. The next seat takes the next turn as normal.

## The eight cards

| Cards | Effect |
| --- | --- |
| Scottish / Welsh / English Support | Place two matching followers from the reserve in one unresolved region adjacent to matching controlled territory or the faction's unresolved home. Use one if only one is available. Roman labels are Senate / Citizens / Legions Support. |
| Assemble and Assemble II | Place one available follower of each faction from the reserve into unresolved regions, together or separately. |
| Negotiate | Exchange two unlocked, unresolved regions in the resolution order, then lock one of their region cards against further exchanges. Followers stay in place. |
| Manoeuvre | Exchange one follower from each of two different unresolved regions. They need not be adjacent. |
| Outmanoeuvre | Exchange one follower for two across adjacent unresolved regions. A 1:1 exchange is allowed only when no legal full 1:2 exchange exists. |

An exchange cannot exactly reverse another player's most recent card play using the same exchange card. Passing does not remove this restriction; another card play replaces it.

## Victory

**Invasion:** the third unstable region ends the game immediately. Count complete sets of one follower from each faction in each court. The most sets wins; a tie favors the contender who most recently played a card.

**Coronation:** otherwise, resolve all eight regions. Rank factions by regions claimed, breaking faction ties in favor of the most recent claim. Compare contenders' followers of the first-ranked faction, then the second-ranked faction. If still tied, the contender whose final card play happened earliest wins, subject to the interpretations below. The Roman presentation calls this the imperial succession.

### Four-player teams

Keep teammates' hands and courts separate during play. At coronation, compare **individual** courts; a winning contender wins for their entire team. If contenders from both teams remain tied after comparing faction support, apply team action timing below.

For invasion, **combine teammates' courts before counting complete sets**. The team with the most combined sets wins. A tie favors the team whose member most recently played a card. Both winning teammates appear in the result.

For the standard team experience, avoid tactical discussion and showing teammates your hand. The browser prototype distributes complete state to clients and does not enforce hand secrecy.

## Explicit prototype interpretations

- The final coronation tiebreak compares when each contender **last played a card**, even if cards remain. This extends the publisher's hand-exhaustion wording to unspent hands; exhausting a hand is not required.
- If only one faction controls regions, neither remaining faction has a claim to rank second. Skip secondary-faction support and use action timing.
- For a final team coronation tie, compare the latest card play by either member of each tied team and favor the earlier team timestamp. This uses the same unspent-hand interpretation.
- Indistinguishable action timing produces a shared victory. If no followers remain anywhere on the board after a card, recruitment is impossible and the turn advances.

The interface offers two- and three-player individual play and four-player teams, with practice rivals, same-screen play, and online tables. Advanced asymmetric cards are outside this version. Dice, portraits, music, lighting, and Roman architecture do not change legal moves or scoring. The field guide is an introduction; this document records the card details and edge cases.

Mechanics reference: [Osprey's official The King Is Dead: Second Edition rulebook](https://www.ospreypublishing.com/media/3yxddtqg/tkid2_rulebook.pdf), by Peer Sylvester. PDF pages: setup 4, play 6, victory 7, four-player teams 8, and standard cards 9. The prose here is an original summary; the interpretations above identify prototype choices.

## Implementation notes

`site/game/engine.js` is deterministic and browser-independent. Canonical action IDs identify a legal effect at a specific state revision. Playing a card and mandatory recruitment are separate commands; passing is unavailable during recruitment.

Imported snapshots have a 128 KiB text cap and strict shape, follower-count, card, phase, result, and log validation. Validation rejects malformed data; it does not authenticate the remote host or prove the entire match history. Online clients send commands to the host, which checks the active seat and revision before applying them. Practice rivals use the same legal-command API.
