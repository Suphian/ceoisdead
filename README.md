# The Toga Is Dead

A desktop-first 3D browser succession game for 2–4 players, with solo practice, same-screen play, and online invitations. Choose the medieval coastal kingdom or the Roman empire. Two and three players compete individually; four players form teams: seats 1 + 3 versus seats 2 + 4. The GitHub repository is `Suphian/the-toga-is-dead`; the Vercel hosting project remains `ceoisdead`.

This independent prototype implements the standard mechanics described in [RULES.md](RULES.md), with original interface, architecture, illustrations, and procedural audio. The coastal board includes miniature landmarks, villages, forests, docks, boats, moving water, faction pieces, and move animations. Morning, golden-hour, and moonlight settings change the atmosphere locally.

The [standard-rule audit](docs/RULES-AUDIT.md) maps setup, cards, borders, turns, and scoring to the official publisher rulebook and regression tests, and records the prototype's remaining edge-case conventions.

**Play: [suph.app](https://suph.app)**, also [ceoisdead.vercel.app](https://ceoisdead.vercel.app). Choose **Invite your friends** in the welcome menu, or **New game → Invite friends**, select 2, 3, or 4 players, and create the table. Send the same invitation link to everyone. Guests need no Vercel or ChatGPT account. Each guest takes a seat and can choose their name and character; when everyone has joined, the host selects **Start game with everyone**. The plain domain opens the game without joining an existing table.

The five-chapter **Field guide** explains play and includes a pass demonstration that leaves the match unchanged. **Read aloud** uses the browser/device speech service when available. The four illustrated contenders are decorative identities with no special powers. Music is an original 72-second Web Audio arrangement; it defaults off, starts only after interaction, and pauses in hidden tabs. Sound, volume, and atmosphere preferences stay on the current device.

**Your turn** opens a clear turn announcement. A persistent identity badge marks your own seat, and the right-hand tips follow card selection, confirmation, and mandatory recruitment. The board displays the next region and consecutive passes needed to settle it; resolved regions are visibly locked. Opponent cards animate onto the table, and the most recently played card remains visible. Tips can be hidden without changing the match. The dice tray has been removed. A DOM board remains available when WebGL is unavailable.

**My games** lists open, closed, and completed tables saved in this browser. **Save & leave table** pauses your session; **Resume** restores it. Online games need the host and all players to return. Clearing browser data removes these saves; there is no account-based cross-device library.

## Run locally

Install [Node.js 24 or newer](https://nodejs.org/), then:

```sh
git clone https://github.com/Suphian/the-toga-is-dead.git
cd the-toga-is-dead
npm run dev
```

Open **http://127.0.0.1:3000**. The static game needs no npm installation or build step. Initial loading needs an internet connection for pinned browser libraries and web fonts. Refresh after editing files.

`npm test` runs the dependency-free engine, room transport, and audio lifecycle tests. The development server uses Node built-ins and serves only `site/`.

## Work with a friend

1. The repository owner adds the friend's GitHub account under **Settings → Collaborators → Add people**.
2. Each person clones the repository and opens it in Codex or an editor using their own account.
3. Start one focused feature from updated `main`:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c feature/my-change
   ```

4. Make the change, run `npm test`, and check it in the browser.
5. Stage the paths you changed, commit a working milestone, and push the branch:

   ```sh
   git add site
   git commit -m "Add my feature"
   git push -u origin feature/my-change
   ```

   Stage tests, scripts, or documentation explicitly when they are part of the change.
6. Open a pull request, review each other's work, and merge when the relevant checks pass. Start the next feature from updated `main`.

Agree on module ownership before editing together. Scene props, guide improvements, illustrations, audio, and transport work can proceed independently. A useful Codex prompt is:

> Read README.md, AGENTS.md, and RULES.md. Implement [one feature] on my current branch. Keep rules separate from presentation, add a meaningful regression test if behavior changes, run the relevant checks, and commit working milestones.

Sharing a ChatGPT conversation provides context; GitHub branches and pull requests carry the code.

## Edit and play together live

Both collaborators can use VS Code Live Share. The host opens the project, runs `npm run dev`, starts a Live Share session, and shares its invitation. Choose **Share server**, enter **3000**, and let the friend open it under **Shared Servers**. Both can edit the shared files and refresh their browsers while the host stays online.

For local-network testing, set `HOST=0.0.0.0` and optionally `PORT` before starting the server. The default binds to your own computer; Live Share works with that default.

## Deployment and online rooms

The Vercel project is **ceoisdead** in team **suph**, with production domain **suph.app**. `vercel.json` publishes `site/` without install or build commands. Git integration supplies production updates from `main` and branch previews for reviewing changes. The Netlify configuration remains as an alternative static-host setup.

Rooms use PeerJS/WebRTC. Up to three guests connect to the host, which validates seat ownership, state revision, and legal moves before broadcasting updates. Seats freeze when the match starts; any disconnect pauses everyone. Guests can refresh or resume from **My games**. Their private seat token is stored with the game on this browser and is never included in the shared link or public lobby.

Host snapshots preserve the game, original invitation ID, player choices, and reserved seats. The host can close the tab and reopen that table from **My games**; guests then reconnect with their saved seats. The table pauses while anyone is absent. An already-open host tab must be closed before the same table can be hosted again. These casual rooms have no account authentication or server persistence, and some networks block direct connections. Same-screen and practice modes remain available. Existing local corporate-themed saves restore with medieval presentation while retaining players, moves, and turn order.

## Project map

- `site/index.html`: metadata, styles, and pinned browser imports.
- `site/app.js`: game interface, saves, turn orchestration, and room integration.
- `site/presentation.js`: medieval/Roman labels, contender identities, and original SVG emblems.
- `site/experience.js`: welcome menu, five-chapter guide, device read-aloud, sound controls, and atmosphere settings.
- `site/audio.js`: original procedural music and SFX; no downloaded audio assets.
- `site/styles.css`, `site/kingdom.css`: responsive interface and historical presentation.
- `site/scene.js`, `site/world.js`, `site/landmarks.js`: scene entry point, coastal board, and original procedural architecture.
- `site/guidance.js`: pure next-step instructions derived from the real game state.
- `site/turn-feedback.js`: turn modals, opponent card animation, and persistent last action.
- `site/game-library.js`: validated same-browser archives and private room resume records.
- `site/assets/`: generated portraits, menu panorama, social cover, prompts, and retained legacy models; see [asset provenance](site/assets/README.md).
- `site/room.js`: peer transport, assigned seats, lobby, and private reconnect tokens.
- `site/game/engine.js`: deterministic rules, serialization, and practice AI.
- `test/`: engine, transport, and audio lifecycle tests.
- `scripts/serve.mjs`: local static server.
- `scripts/browser-smoke.mjs`: gameplay, responsive layout, and network checks.
- `scripts/browser-experience.mjs`: menu, guide, sound controls, themes, atmosphere, and legacy-save checks.
- `scripts/browser-multiplayer.mjs`: larger tables, lobbies, turn authority, and guest refresh reconnection.
- `scripts/browser-guidance.mjs`: turn modals, personal identity, card/recruitment instructions, and last-card feedback in two real browsers.
- `scripts/browser-library.mjs`: multiple saves, archive/reopen, completed review, and real host/guest fresh-tab recovery.

CI checks JavaScript syntax, runs Node tests, and runs the browser verification scripts with pinned Playwright. Screenshots and reports are retained in the `browser-results` artifact. Reports distinguish completed real-network checks from unavailable signaling/network services. See [AGENTS.md](AGENTS.md) for local browser-test commands.
