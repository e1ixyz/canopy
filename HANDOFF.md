# Orchestrator - handoff

A desktop harness that runs many real `claude` CLI sessions in tiles, wires them into a shared bus, and gives each worktree its own ports and browser preview.

_Last updated 2026-10-02._ App icon source: `build/icon.svg` (rendered to `build/icon.icns`).

## Run it

```sh
bun install          # postinstall rebuilds node-pty against Electron
bun run dev          # electron-vite dev (HMR for the renderer; main changes need a restart)
bun run typecheck && bun run test
bun run install-app  # packaged app → ~/Applications/Orchestrator.app + Desktop alias
```

To test next to a real instance without touching its state or stealing focus:

```sh
ORCH_USER_DATA=/tmp/orch-test ORCH_DEBUG_PORT=47898 bun run dev
```

In dev, or in the packaged app when `ORCH_DEBUG_PORT` is set, a debug server on `127.0.0.1:47899` (or that port) serves `/shot` (PNG of the window) and `/eval` (POST JS, runs in the renderer). The store is exposed as `window.__app` in dev. That is how the UI got verified: spawn sessions, send prompts with `orch.send('pty:write', id, …)`, then screenshot.

## How it fits together

```
main (Node)                                   renderer (React + Motion)
  hub.ts        sessions, PTYs, hooks, wake     store/app.ts   zustand: pages, tiles, sessions, bus
  bus/server.ts HTTP: /hook/<sid>/<event>       lib/terms.ts   xterm instances live outside React
                      /mcp/<sid> (MCP tools)    lib/layout.ts  grid + focus layouts (pure, tested)
  bus/bus.ts    messages, inbox, claims         components/    Tile, PreviewPane (<webview>), BusDrawer…
  hooks/inject.ts --settings / --mcp-config / brief per session
  worktree/     git, ports, adapters, service
  port-watcher.ts lsof → ports per session (process tree first, then deepest cwd)
  recents.ts    history.jsonl, transcripts, context usage, last assistant text
  usage.ts      incremental token totals per transcript
  browser.ts    BrowserBridge: preview webviews for MCP browser_* tools + screenshot sets (CDP)
  goal.ts       GoalController: rounds, QA verdicts, stop nudges
  ship.ts / pr.ts  changed-file ownership; gh pr view
  store.ts      JSON state in userData/state.json
```

Each Claude session is spawned as `claude --session-id <id> --mcp-config <file> --settings <file> --append-system-prompt <brief>`. Once a transcript exists it uses `--resume <id>` instead. The settings layer adds hooks that `curl` the hub with the hook payload. UserPromptSubmit, PreToolUse and Stop answer back: inbox injection, the claim guard, and stop-blocking to deliver messages. It also pre-allows `mcp__orchestrator`. Your own hooks in `~/.claude/settings.json` still run (verified: your handoff Stop hook fired inside a tile).

PTY output is batched (8ms) with a sequence number. A terminal that attaches late replays the ring buffer (2MB) and drops live chunks whose seq is already in the replay.

## Current state

Working and verified in the running app:
- launcher, pages and tiles
- spawn, resume after restart
- MCP tools: `set_status`, `list_sessions`, `send_message` with automatic wake and reply, `claim` plus the PreToolUse ask
- dev server start, port attribution, preview webview
- worktree create and remove (refuses dirty trees unless forced)
- overview, palette, new-session sheet, guide (⌘/)
- Roadmap items 1–10 (built 2026-10-02), each exercised in an isolated instance against the scratch demo repo with Haiku sessions:
  - Ports popover: listeners with command, cwd and owner; kill (verified); restart dev.
  - Usage meter: `src/main/usage.ts` tails transcripts incrementally, de-duplicated by message id.
  - Fresh session with handoff, which replaces the tile.
  - Model, effort and mode chips. The mode is read from the hooks' `permission_mode`.
  - Adapter actions plus a ratchet badge. Etwal: wt-doctor, wt-status, wt-merge-check, `ds:check`. Commands resolve with the "Client Work" space quoted correctly.
  - PR panel (`src/main/pr.ts`).
  - Screenshot sets (`BrowserBridge.shotSet`, CDP full-page).
  - Browser MCP tools for sessions. A Haiku session opened, clicked, typed and took a screenshot on its own.
  - Goal rounds (`src/main/goal.ts`): worker → QA sibling → verdict → met.
  - Ship sheet (`src/main/ship.ts`): splits files between sessions that share a checkout.

Unit tests (39) cover:
- ports, adapters (including quote-aware `fill`), git parsing, lsof parsing and attribution
- the bus, globs and layout
- usage ingest, the goal state machine, ship classification, shot naming and PR parsing

Not yet exercised end to end:
- the etwal adapter's `new-worktree.sh` path (it runs installs and migrations, so test on a throwaway branch)
- `spawn_session` approval toasts
- broadcast prompts
- the PR panel against a real PR (only the no-PR state was checked)
- a full Ship through the user's `/ship` skill (the sheet was checked; nothing was pushed)

## Gotchas

- Don't pass a first prompt as a positional `claude "…"` argument. Multi-line prompts land unsubmitted in the input box. `Hub.start` holds `pendingPrompt` and pastes it after the SessionStart hook.
- Handoffs don't rely on the model calling the `handoff` tool, because Haiku skipped it. `collectHandoff` reads the last assistant message newer than the request. It retries for about 5 s because the transcript lags the Stop hook.
- QA and reviewer roles are read-only through `claimGuard`, which denies Edit/Write. QA runs in `auto` mode so its checks don't stall on prompts. `auto` is unavailable for Haiku, so a Haiku QA falls back to manual and will ask.

- Apps launched by another Claude session inherit `CLAUDE_CODE_CHILD_SESSION`, which turns off transcripts and breaks `--resume`. `env.ts` builds the env from a clean login shell (`env -i`-style seed, then `zsh -ilc env`) and strips those markers.
- xterm answers terminal queries (DA, focus) through `onData`. Those replies are not user typing, so the "don't wake while the user has a draft" check only counts printable input, and clears it on Enter, Ctrl-C or Ctrl-U.
- Newer Chromium returns a Promise from `scrollIntoView`. Arrow-function effects that return it crash on unmount ("destroy is not a function"), so use block bodies.
- Zustand selectors must return stable values. Use `useShallow` for derived arrays, or the renderer loops.
- macOS stops compositing occluded windows. `/shot` gets stale frames unless the instance runs with `ORCH_USER_DATA`, which turns off occlusion backgrounding.
- `--append-system-prompt` is fixed at spawn, so the sibling list in the brief goes stale. Sessions should call `list_sessions` for the live view.

- The Desktop is in iCloud, which keeps re-adding FinderInfo xattrs, and codesign refuses to sign "detritus". `install-app.sh` copies the app to `~/Applications` with `ditto --noextattr`, signs it there (`scripts/sign-adhoc.sh`, inside-out) and only puts an alias on the Desktop.
- The Desktop is case-insensitive: `~/Desktop/Orchestrator` IS the project folder `~/Desktop/orchestrator`. The alias is named `Orchestrator.app`, and the script only replaces it when it is a plain file.
- The packaged app and `bun run dev` share the same state (`~/Library/Application Support/Orchestrator`). Run one at a time.

## Next

`ROADMAP.md` ranks what to fold in next, from your Claude Code history. Items 1–10 are built. Open items: Railway, SSH and DB tiles; a handoff shelf to save a session's handoff and pick it up later (17); and the three stages of making the app installable for other people (18–20: strip personal paths and prompts, sign and notarize, then onboarding and version tolerance, then Linux/Windows). The in-app guide lives in `src/renderer/components/HelpPanel.tsx` (⌘/); update it when a feature changes.


1. Run a worktree through the etwal adapter on a scratch branch and check that the port collision repair rewrote `.wt-run.sh` and `.env`.
2. Exercise `spawn_session` from a lead session and approve it in the toast.
3. Real code signing (Developer ID + notarization) if the app ever leaves this machine; today it is ad-hoc signed.
4. P2 ideas from the plan: Monaco diff per worktree, cost dashboard from transcripts, fan-out compare, LAN read-only view.
