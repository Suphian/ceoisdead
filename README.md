# CEO is Dead

An original 3D browser interface for a 2–4-player succession game, with corporate and medieval settings, solo practice, same-screen play, and online invitations. Two and three players compete individually; four players form two teams (seats 1 + 3 versus seats 2 + 4). Read [RULES.md](RULES.md) for the implemented rules and reference. The game lives in `site/`; its rules, interface, and Three.js scene are separate modules so friends can contribute independently.

**Play: https://suph.app** (also https://ceoisdead.vercel.app). Friends can open it without Vercel or ChatGPT accounts. Choose **New game → Invite friends**, select **2, 3, or 4 players**, and create the table. Send the same generated invitation link to everyone. Each guest gets a seat and can update their name in the lobby. Once everyone has joined, the host selects **Start game with everyone**. The plain domain opens the game without joining an existing table. WhatsApp and other link readers can use the static Open Graph artwork and metadata.

The coastal board includes miniature landmarks, forests, docks, boats, moving water, sculptural faction pieces, move animations, and camera focus. The optional **Dice tray** uses real rigid-body physics; it is a local toy, does not affect the rules, and its rolls are not synchronized with other players. Reduced-motion mode simulates the roll immediately and shows the resting result.

## Run locally

Install [Node.js 24 or newer](https://nodejs.org/), then:

```sh
git clone https://github.com/Suphian/ceoisdead.git
cd ceoisdead
npm run dev
```

Open **http://127.0.0.1:3000**. No npm installation or build step is needed for the game. The browser loads the pinned Three.js version declared in `site/index.html`, so initial loading requires an internet connection. Refresh the page after editing files.

`npm test` runs the game rules with Node's built-in test runner. The server uses Node built-ins and serves only `site/`.

## Work with a friend

1. The repository owner adds your GitHub account under **Settings → Collaborators → Add people**.
2. Clone the repository on your own computer and open it in Codex or your editor. Each person signs into their own ChatGPT/Codex account.
3. Pull the latest `main`, then create a branch for one small feature:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c feature/my-change
   ```

4. Make the change, run `npm test`, and play it in the browser.
5. Commit and push your branch, then open a pull request on GitHub:

   ```sh
   git add site
   git commit -m "Add my feature"
   git push -u origin feature/my-change
   ```

   Stage other changed paths explicitly when your work includes tests, scripts, or documentation.

6. Review each other's changes and merge when the checks pass. Start the next feature from updated `main`.

Good independent tasks include new scene props, card illustrations, interface improvements, and rule changes with tests. Agree on ownership before both editing the same module.

A useful Codex prompt:

> Read README.md and the game rules. Implement [one feature] on my current branch. Keep the rules separate from rendering, add a regression test when behavior changes, run the checks, and summarize the result.

Sharing a ChatGPT conversation is useful for explaining an idea; the GitHub branch and pull request carry the code.

## Edit and play together live

For a joint session, both install VS Code Live Share. One person opens the project, runs `npm run dev`, starts a Live Share session, and shares its invitation link. In Live Share, choose **Share server**, enter **3000**, and let the friend open it under **Shared Servers**. Both can edit the shared files and refresh their browsers to play the current version while the host stays online.

For local-network testing, set `HOST=0.0.0.0` and optionally `PORT` before starting the server; the default binds only to your own computer. Live Share works with the default host.

## Share a playable preview

The repository is deployed to Vercel as project **ceoisdead** in team **suph**. `vercel.json` publishes **site** with no install or build command. The production domain is **suph.app**. Git integration supplies production updates from `main` and preview deployments for branches; use a branch preview to review a friend's changes before merging. The existing Netlify configuration remains available as an alternative static host.

Online rooms use PeerJS/WebRTC: up to three guests connect directly to the host, who validates the assigned seat, state revision, and legal move before broadcasting updates. Seats are frozen when the host starts. Any disconnect pauses the entire match. A guest can refresh the same tab or click **Rejoin your seat** while the host remains online. A private resume token in that guest tab's session storage reclaims its original seat; it is never placed in the shared link or public lobby. Closing the host tab loses the room, and a guest who loses their tab's token cannot reclaim a started seat. These are casual rooms without account authentication, server persistence, or guaranteed connectivity across every network. Local play still works when direct connections are unavailable.

## Project map

- `site/index.html` — page and pinned browser dependency imports
- `site/app.js` — interface and player interactions
- `site/styles.css` — responsive presentation
- `site/scene.js` — stable scene entry point
- `site/world.js` — Three.js coastal board and visual effects
- `site/dice.js` — independently loaded Three.js / cannon-es physics tray
- `site/assets/` — self-contained CC0 GLB models and original licenses
- `site/og.png` — original generated social sharing artwork
- `site/room.js` — host-star PeerJS transport, lobby, assigned seats and private reconnect tokens
- `site/game/engine.js` — game state and rules
- `test/` — dependency-free rules and room transport tests
- `scripts/serve.mjs` — local static server
- `scripts/browser-smoke.mjs` — browser gameplay, responsive, and optional real-network checks
- `scripts/browser-multiplayer.mjs` — larger local tables, multiplayer lobbies, turn ownership and guest refresh reconnection

CI checks JavaScript syntax and runs the rules tests on pushes and pull requests. A separate browser job installs a pinned Playwright version, starts the game, checks interactions, and retains screenshots/logs in its browser-results artifact. The report distinguishes a completed real-network room check from an unavailable signaling/network service. Runtime browser dependencies stay out of the Node package manifest.
