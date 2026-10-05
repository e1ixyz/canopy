# Canopy - handoff

A desktop harness that runs many real `claude` CLI sessions in tiles, wires them into a shared bus, and gives each worktree its own ports and browser preview.

_Last updated 2026-10-05._ App icon source: `build/icon.svg` (rendered to `build/icon.icns` and `build/icon.png` with `rsvg-convert` and `iconutil`).

The app was renamed from Orchestrator to Canopy on 2026-10-05. Only user-facing names changed: product name, window title, UI copy, the session brief, the icon. Internal names stayed: the repo folder and package name, appId `dev.orchestrator.app`, the userData folder (`main/index.ts` pins it to `Application Support/Orchestrator` so state survives), `~/.orchestrator`, the `ORCH_*` env vars and the `orchestrator` MCP server and tool names.

## Run it

```sh
bun install          # postinstall rebuilds node-pty against Electron
bun run dev          # electron-vite dev (HMR for the renderer; main changes need a restart)
bun run typecheck && bun run test
bun run install-app  # packaged app → ~/Applications/Canopy.app + Desktop alias, and removes the old Orchestrator.app (keeps the debug server)
bun run dist         # release .dmg (arm64 + x64) in dist/, ad-hoc signed, no debug server
```

To test next to a real instance without touching its state or stealing focus:

```sh
ORCH_USER_DATA=/tmp/orch-test ORCH_HOME=/tmp/orch-home ORCH_DEBUG_PORT=47898 bun run dev
```

`ORCH_HOME` moves `~/.orchestrator` (user adapters, saved handoffs) so a test instance doesn't touch yours.

In dev, or in an `install-app` build when `ORCH_DEBUG_PORT` is set, a debug server on `127.0.0.1:47899` (or that port) serves `/shot` (PNG of the window) and `/eval` (POST JS, runs in the renderer). The store is exposed as `window.__app` in dev. That is how the UI got verified: spawn sessions, send prompts with `orch.send('pty:write', id, …)`, then screenshot.

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
  prompts       src/shared/prompts.ts: every prompt the app types; settings > adapter > default
  handoffs.ts   HandoffShelf: ~/.orchestrator/handoffs/<project>/<date>-<slug>.md
  tiles.ts      commandFor(): PTY command for deploy/db/host tiles (db URL via ORCH_DB_URL env)
  db.ts / dotenv.ts / railway.ts / hosts.ts / skills.ts   data for those tiles and the palette
  paths.ts      orchHome() = ~/.orchestrator (or ORCH_HOME)
  naming.ts     suggestBranch(): worktree branch from the first prompt (one-shot `claude -p --model haiku`)
  termtext.ts   plainText()/TRUST/LIMIT: reading PTY output for status detection
```

Appearance: one look with a light and a dark mode, picked by `settings.appearance` (`system`/`light`/`dark`). Main sets `nativeTheme.themeSource` from it (`applyAppearance` in `src/main/index.ts`), so the renderer only reads `prefers-color-scheme`. `useTheme` in `App.tsx` puts `data-mode` on `<html>` and restyles xterm (`setTermPalette` in `lib/terms.ts`). The terminal palette per mode lives in `lib/theme.ts`; the CSS tokens are in `styles.css`. Ember, Console and Desktop 98 were removed on 2026-10-05; an old `theme` key in saved settings is ignored.
- Tailwind v4 compiles every utility to a CSS variable, so each mode remaps `--color-white` (the foreground ink: `text-white/50`, `bg-white/[0.06]`, `border-white/10`), `--color-black` (wells, scrims), `--color-violet-*` (the accent), radii and fonts. Light modes also flip the status scales (emerald/amber/rose/sky…). New code: keep writing `white`/`violet` classes; use `text-on-accent` on accent fills and `var(--tile-bg)`, `var(--glass)`, `var(--pop-shadow)` etc. for surfaces. No hex colors in components.
- JetBrains Mono is bundled with `@fontsource/jetbrains-mono` (imported in `main.tsx`); the CSP blocks web fonts.

Session kinds: `claude`, `shell`, `dev` (helper process), plus `deploy`, `db`, `host` (PTYs whose command comes from `Session.target`) and `design` (no process; the renderer shows `DesignView`). Side panels for db/deploy are in `components/SidePanels.tsx`.

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
- The Desktop is case-insensitive, and the project folder is `~/Desktop/orchestrator`. The alias is named `Canopy.app`, and the script only replaces or removes an alias when it is a plain file, so it never touches the project folder.
- A modal body must not read its target from the store: sheets keep rendering through their exit animation after the store field is cleared. Pass it in as a prop (see `DeploySetup.tsx`).
- Tailwind `relative` and `absolute` on one element: `relative` wins and an absolutely-sized child gets 0 height (bit the design webview).
- `bun run dist` packs into `~/Library/Caches/Canopy-dist` and copies the .dmg files back, because codesign rejects the iCloud Desktop's xattrs. `scripts/after-pack.cjs` ad-hoc signs only when `ORCH_ADHOC_SIGN=1`.
- The packaged app and `bun run dev` share the same state (`~/Library/Application Support/Orchestrator`, kept under the old name). Run one at a time.
- Claude Code's own colors come from its `auto` theme, which asks the terminal for its background (OSC 11) and falls back to `COLORFGBG`. So each xterm palette has an opaque `background` equal to the theme's `--term-bg`, and `hub.ts` sets `COLORFGBG` at spawn. A session started before a light/dark switch keeps its old palette until it restarts; light palettes also set `minimumContrastRatio: 3` as a safety net.
- Tailwind's `!` utilities sit in a cascade layer, and layered `!important` beats unlayered `!important`. Theme CSS can't override a `!text-…` class, so don't use `!` utilities on hooked elements (see `orch-kbd-accent` in `Dock.tsx`).
- Claude Code draws spaces as cursor moves (`ESC[nC` and absolute columns `ESC[nG`), so matching its output on stripped text fails ("Itrustthisfolder"). Use `plainText()` from `termtext.ts`, which turns those moves back into spaces first.
- The shortcut handler in `App.tsx` listens on window in the capture phase and stops propagation. Anything it handles never reaches React, so it returns early for ⌘↵ in text fields and for tile/page shortcuts while a sheet is open (`modalOpen`).
- IPC handlers reject any sender that isn't the app's own top frame (`trusted()` in `src/main/index.ts`). A new window or webview that needs IPC has to be allowed there explicitly.
- In dark appearance a `<webview>` page that sets no colors renders light text on a transparent canvas, so `styles.css` gives the webview a dark backing in dark mode.

Built 2026-10-03 (roadmap 11–18, one commit each after `87a178e`), each checked in an isolated dev instance:
- Stage 1 for others: prompts registry + Settings → Prompts (your old wording is saved as overrides in your real `state.json`; a backup is `state.json.bak-2026-10-03`), adapters in `~/.orchestrator/adapters` (etwal.json moved there, with its QA brief), `examples/adapter.example.json`, debug server compiled out unless `ORCH_DEBUG_BUILD=1`, `bun run dist`. A vitest test fails on any `/Users/` path in `src/` or `examples/`.
- Handoff shelf: save / save-and-close / pick up / resume original / import, verified with Haiku sessions.
- DB tile (psql connected, seed button ran), Railway tile (logs streamed from share-a-story production, env tabs, vars diff checked masked only), host tiles (ssh to office-dj spawns; the box didn't answer), skills in the palette, design tile with Compare and mark-up.

Built 2026-10-05: themes and the Appearance setting (the extra themes were later cut, leaving light and dark). Every screen (workspace, launcher, overview, palette, bus, settings, guide, new session, worktrees, ports and usage popovers, tile menu, context popover, preview, exited state, broadcast, goal, ship, design, deploy setup, screenshot set, mark-up, toasts) was screenshotted in every theme and mode through the debug server in an isolated instance, and the bugs found were fixed: git strip and overview rows overflowing, launcher stats wrapping, the SSH host inputs collapsing, the tile menu clipping inside short tiles, and the dark-mode preview.

Built 2026-10-05: roadmap 21. A new worktree's branch is optional (Settings toggle `nameWorktrees`, on by default). `src/main/naming.ts` asks Haiku for a slug (no hooks, tools, MCP or saved session; 10 s timeout, falls back to the prompt's first words), picks the prefix from `adapter.branchPrefix`, else the prefix most recent local branches share, else `orch/`, and adds `-2`… on collisions. The sheet suggests while you type (`worktree:suggestName`); `spawn_session` without a branch uses the same path. Verified in an isolated instance on a scratch repo (`feat/dark-mode-toggle`, `feat/test-date-formatting`, `-2` on a taken name).

Full QA pass the same day (live in an isolated instance plus three code reviews: main process, renderer, theming). Fixed:
- Sessions and shortcuts: the "trust this folder" dialog (every new worktree) shows Needs you instead of Starting forever; ⌘W/⌘↵/⌘1-9 no longer act on tiles hidden behind a sheet or the launcher (⌘W closes the sheet); ⌘↵ reaches sheets and text fields; sheets take focus from a terminal so Escape and typing go to them; ⌘↵ respects Start's busy/conflict guard; overlapping starts of one session (restore + Restart) queue instead of spawning two processes; the tile menu's Close asks first for a working session.
- Worktrees: removal checks for uncommitted work before stopping the sessions inside (and asks first in the UI); a fresh branch only warns about commits that exist on no other branch; a worktree deleted outside the app can be removed and frees its ports; adapter `ports`/`envPortKeys` are honored; the dev command exports its port env so it reaches `run dev` after an install.
- Bus and goals: "Everyone on <project>" from the drawer now reaches that project (the GUI sends `projectId`); a dead recipient resets to the project; a QA that stops without a verdict is nudged once, and a goal whose QA exits or can't start goes back to running with attention.
- Robustness: a .DS_Store in the handoff shelf no longer breaks the list; same-named projects don't see each other's handoffs; handoffs are collected for 30 min (not the 5-min spawn window); limit alerts match only Claude Code's banners; ports are re-announced after a restart; Ship reads `git status -z` (non-ASCII paths); failed invokes toast instead of hanging (Ship plan, Goal, Deploy setup, Worktrees, db/deploy tiles, bus send).
- Security: the main window can't be navigated away (a dropped link/file), and IPC answers only the app's own top frame.
- UI: popovers close from their trigger; Settings › Prompts edits a local draft; palette "This tile" actions follow the tile kind like the tile menu; the new-session sheet falls back to an offered tab and ignores stale results after a project switch; scroll areas inside modals fit; keyboard access for page tabs and launcher pin/handoff controls; tile headers keep the name and pills on one line (task truncates first).
- Themes: terminal fonts load before xterm measures, themed xterm scrollbars, `--webview-bg` for Compare and mark-up captures, readable spawn-request names and own bus avatar in light mode, guide scrim, preview frame edge.

Not exercised: the Railway SSH button (it would open a production shell), running a skill in a scratch session, Claude-over-ssh on a reachable host, Figma/claude.ai logins in the design profile, the x64 dmg on an Intel Mac.

## Next

`ROADMAP.md` ranks what to fold in next, from your Claude Code history. Items 1–18 and 21 are built. Open: Developer ID signing, notarization and GitHub Releases (rest of 18), then 19 (first-run checks, version tolerance, auto-update), 20 (Linux/Windows) and 22 (tile borders that warn at 150k/200k/250k context tokens). The in-app guide lives in `src/renderer/components/HelpPanel.tsx` (⌘/); update it when a feature changes.


1. Run a worktree through the etwal adapter on a scratch branch and check that the port collision repair rewrote `.wt-run.sh` and `.env`.
2. Exercise `spawn_session` from a lead session and approve it in the toast.
3. Real code signing (Developer ID + notarization) before the dmg goes to anyone; today it is ad-hoc signed.
4. P2 ideas from the plan: Monaco diff per worktree, cost dashboard from transcripts, fan-out compare, LAN read-only view.
