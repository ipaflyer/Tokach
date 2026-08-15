# Толкач (Tokach)

Local-first, two-players-on-one-device board game prototype. Pure static front end: `index.html` loads
`src/rules.js` (pure game core, no DOM), `src/log.js` (playtest log export), and `src/app.js` (DOM/UI glue).
Design/spec live in `GAME_DESIGN.md` and `PROTOTYPE_SPEC.md`.

## Cursor Cloud specific instructions

- No package manager, no lockfile, no build step, and no lint config. There is nothing to install — `node`,
  `python3`, and `google-chrome` are already available. Do not add a bundler/framework unless explicitly asked.
- Run the app by serving the repo root over HTTP and opening `index.html`, e.g. `python3 -m http.server 8000`
  then browse to `http://localhost:8000/index.html`. Opening the file via `file://` also works, but the HTTP
  server is the expected dev flow (a `tokach-server` tmux session is used for this).
- Test suite = `runSelfChecks()` in `src/rules.js`. Easiest path: click the **«Самопроверки правил»** button at
  the bottom of the page; it prints per-rule `OK`/`FAIL` lines and ends with `Все N проверок прошли.`
- To run the same checks headlessly (terminal evidence, no browser): the scripts attach their API to
  `window` (e.g. `window.TokachRules`) and are not CommonJS/ESM modules. Load them into a `vm` context that
  defines a `window` global, then call `window.TokachRules.runSelfChecks()`. Do not `require()` them directly.
- `.cursor/hooks.json` + `.cursor/hooks/game-loop.py` implement an autonomous "gameplay iteration" stop-hook.
  It is gated on the `.cursor/LOOP_ON` flag file (git-ignored) and is a no-op unless that file exists, so it
  does not affect normal runs. `.cursor/LOOP_ON` / `.cursor/LOOP_DONE` are git-ignored control flags.
- UI text and self-check names are in Russian; keep that convention when editing UI/log strings.
