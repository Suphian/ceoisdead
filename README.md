# CEO is Dead

A browser strategy game being built together. The game lives in `site/`; its rules, interface, and Three.js scene are separate modules so friends can contribute independently.

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

Connect this repository to Netlify. The included `netlify.toml` sets the publish directory to **site** with no build command. Enable Deploy Previews to give each pull request a playable URL that updates after its changes are pushed and deployed. Static hosting does not add synchronized multiplayer; that needs separate game networking.

## Project map

- `site/index.html` — page and pinned browser dependency imports
- `site/app.js` — interface and player interactions
- `site/styles.css` — responsive presentation
- `site/scene.js` — Three.js board and visual effects
- `site/game/engine.js` — game state and rules
- `test/` — dependency-free rules tests
- `scripts/serve.mjs` — local static server
- `scripts/browser-smoke.mjs` — browser smoke test, when present

CI checks JavaScript syntax and runs the rules tests on pushes and pull requests. When a browser smoke script is present, a separate job installs a pinned Playwright version, starts the game, checks interactions, and retains screenshots/logs in its browser-results artifact. Runtime browser dependencies stay out of the Node package manifest.
