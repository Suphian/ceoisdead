# Working on CEO Is Dead

This is a static browser strategy game. The repository is the shared source of truth; keep changes in focused branches and commit working milestones with descriptive messages.

## Layout

- `site/game/engine.js`: deterministic, immutable two-player game rules, legal actions, serialization, and practice AI.
- `site/app.js`: game interface and orchestration. Submit canonical action IDs through `applyAction`; never implement a second rules engine in the UI.
- `site/scene.js`: original Three.js board. Rendering takes a small adapter state and must not change game state.
- `site/room.js`: peer transport. The host must verify guest seat, revision, and legal action IDs before applying a move.
- `site/styles.css`: responsive interface styles.
- `scripts/serve.mjs`: dependency-free Node static server for `site/`.
- `test/`: deterministic rules and mocked transport regression tests.
- `scripts/browser-smoke.mjs`: real browser playthrough and responsive checks.

## Run and verify

Use Node.js 24 or newer. There is no application dependency-install or build step:

```sh
npm run dev
npm test
```

For browser checks, install the pinned tool only when needed:

```sh
npm install --no-save --package-lock=false playwright@1.63.0
npx playwright install chromium
npm run dev
# In another terminal:
node scripts/browser-smoke.mjs
```

The CI runs syntax checks, Node tests, and the browser smoke test. Screenshots and the browser report are attached to the CI run. The live peer-network test may report an unavailable external signaling service; read that report before claiming online validation.

## Collaboration

Keep engine, rendering, assets, and transport changes separate when multiple people work at once. Rebase or merge the latest main before opening a pull request. Do not commit test artifacts, node_modules, credentials, or local saves.

The game has an accessible DOM board when WebGL is unavailable. Preserve keyboard controls, small-screen layouts, reduced motion, and visible connection errors. Pin CDN versions. Rules changes require meaningful engine regression coverage; UI changes should be checked in a browser.
