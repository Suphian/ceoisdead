# Working on The Toga Is Dead

This is a static browser strategy game in the `the-toga-is-dead` repository. Medieval is the default presentation; Roman is optional. Keep focused branches and commit working milestones with descriptive messages. The repository is the shared source of truth.

## Module boundaries

- `site/game/engine.js`: deterministic, immutable 2–4-player rules, team scoring, legal actions, serialization, and practice AI. The interface uses four-player teams. Preserve documented tiebreak interpretations unless the task explicitly changes rules.
- `site/app.js`: interface, saved histories, orchestration, and online integration. Submit canonical action IDs through `applyAction`; do not duplicate the rules in the UI.
- `site/presentation.js`: theme normalization, faction/region labels, contender identities, and original SVG emblems. Preserve stable engine IDs. Legacy `corporate` saves normalize to medieval without losing their history.
- `site/experience.js`: welcome menu, five-chapter guide, interactive example, browser/device read-aloud, sound controls, and atmosphere settings. Guide demonstrations must not mutate the match.
- `site/audio.js`: original procedural music and SFX. Create/unlock AudioContext only from a user gesture. Preserve opt-in music, safe preference storage, hidden-tab suspension, bounded voices, and disposal. Duplicate unlock handlers in one click must still start music correctly.
- `site/scene.js`, `site/world.js`, `site/landmarks.js`: scene entry point, coastal board, and original procedural architecture. Rendering consumes adapter state and must not change game state. Dispose shared geometry/materials through their owner.
- `site/guidance.js` and `site/turn-feedback.js`: pure next-step coaching, turn modals, and played-card feedback. Never mutate game state.
- `site/game-library.js`: same-device game archive. Keep seat tokens and host checkpoints out of public summaries, URLs, and logs.
- `site/room.js`: host-authoritative peer transport. Verify guest seat, state revision, and legal action ID before applying a move. Preserve private resume tokens, frozen started seats, cosmetic character choices, host checkpoints, and pause-on-disconnect behavior.
- `site/styles.css`, `site/kingdom.css`: responsive interface and historical presentation.
- `site/assets/`: generated illustrations and their prompt records, plus retained legacy CC0 GLBs. Read `site/assets/README.md` before replacing or crediting assets; the current scene does not load those GLBs.
- `scripts/serve.mjs`: dependency-free Node static server serving only `site/`.
- `test/`: engine, mocked transport, and audio lifecycle regression tests.

## Run and verify

Use Node.js 24 or newer. The application needs no dependency installation or build step:

```sh
npm run dev
npm test
```

For browser verification, install the pinned tools when needed:

```sh
npm install --no-save --package-lock=false --ignore-scripts playwright@1.63.0
npx playwright install chromium
npm run dev
# In another terminal:
node scripts/browser-smoke.mjs
node scripts/browser-experience.mjs
node scripts/browser-multiplayer.mjs
node scripts/browser-guidance.mjs
```

Smoke checks cover gameplay and responsive layouts. Experience checks cover the menu, artwork loading, guide, first-click audio, atmosphere, Roman presentation, and legacy corporate saves. Multiplayer checks cover 3/4-player tables, shared lobbies, actual WebRTC turns, seat ownership, and guest refresh reconnection. `BASE_URL` can target another server.

CI runs syntax checks, Node tests, and the browser verification scripts; screenshots and reports are attached as `browser-results`. A live-network check may report unavailable signaling. Read the result before claiming that online play was validated. Audio lifecycle tests do not replace listening through speakers or headphones.

## Collaboration and quality

Agree on ownership across engine, rendering, experience, assets, and transport modules. Rebase or merge updated `main` before opening a pull request. Stage only intended files. Do not commit generated test artifacts, `node_modules`, credentials, or local saves.

Prioritize the desktop experience while preserving usable small-screen layouts, keyboard controls, the DOM fallback board, reduced motion, and visible connection errors. New portraits remain decorative unless an explicit rules change adds abilities. Keep music, SFX, lighting, and guide examples local to the device.

Pin browser library versions. Keep generated-art prompts and third-party licenses with their assets, and accurately distinguish generated illustrations, original procedural geometry/audio, and third-party files. Rules or transport changes need meaningful regression coverage; presentation changes need a browser check. Update README.md, RULES.md, and asset provenance when behavior or sources change.
