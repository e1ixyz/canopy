# Canopy roadmap

_Written 2026-10-02. Items 1–10 were built the same day and 11–18 on 2026-10-03 (see HANDOFF.md, Current state). Still open: notarization and publishing from 18, all of 19 and 20, and 22 (added 2026-10-03). 21 was built on 2026-10-05._

_Based on your Claude Code history: 6,441 prompts sent between 2026-05-04 and 2026-10-02 (`~/.claude/history.jsonl`), plus tool calls across 501 session transcripts in `~/.claude/projects`._

Each item below starts from something you already do by hand, many times, inside Claude Code. The app owns the terminals, worktrees, ports and browsers, so it can take most of these over. The order is by how often the habit shows up and how little new machinery it needs.

## What the history says

| Habit | How often | Where it shows up |
| --- | --- | --- |
| Clearing context | 396 `/clear` | prompts |
| Usage checks | 290 `/usage`, 20 `/usage-credits` | prompts |
| Planning first | 299 `/plan` | prompts |
| Autonomous loops | 116 `/goal`, 76 "qa it" | prompts |
| Side questions | 91 `/btw`, 88 of them some form of "what port is this on" | prompts |
| Handoffs | 115 `/handoff-chat`, 186 `handoff` skill runs | prompts, transcripts |
| Pull requests | 1,070 `gh pr view`, 418 `gh pr checks`, 280 `gh pr edit`, 210 `gh pr create`; 83 prompts about the PR body | transcripts, prompts |
| Merging against develop | 189 prompts about merge, rebase or conflicts | prompts |
| Driving a browser | 6,124 Playwright MCP calls, 1,128 of them screenshots | transcripts |
| Screenshots to a Desktop folder | 34 prompts | prompts |
| Pasting images | 447 prompts with an attached image | prompts |
| Design passes | 37 `/design`, 71 "compare / variations", 50 Figma links | prompts |
| Railway | 782 `railway ssh`, 428 `variables`, 392 `logs`, 376 `deployment`; 47 `/ship` | transcripts, prompts |
| SSH to your own boxes | about 1,000 `ssh` calls to the Mac Studio, the Office DJ box and the MC VPS | transcripts |
| Databases | 376 `psql` calls, 66 seed requests, 52 resets or migrations | transcripts, prompts |
| Etwal harness scripts | 1,771 `ds:check`, 543 `.wt-run.sh`, 209 `wt-doctor`, 192 `wt-status`, 174 `new-worktree` | transcripts |
| Coordinating with another session | 35 prompts ("there's another session working, only push this work") | prompts |
| Model and effort switches | 54 `/model`, 78 `/effort` | prompts |

## Now: small builds, daily payoff

### 1. Ports you never have to ask about (built)
You asked some version of "what port is this on" 88 times, mostly through `/btw`, mostly in etwal worktrees. The tile footer already shows reserved and live ports. The next step is a top-bar Ports popover listing every listener the app can see, its owning worktree and session, and a Kill button and a Restart dev server button. That covers the twelve "kill 5173 & 5174 and restart" prompts too. The data is already in `PortWatcher` and `WorktreeService.portsFor`.

### 2. Usage meter (built)
`/usage` shows up 290 times. That is a check you run between almost every task. A small meter in the top bar can read token counts from each live session's transcript (the same tail read `contextUsage` does today) and roll them up per session, per project and per day. It should warn before a session hits a rate limit, not after. Clicking it runs `/usage` in the active tile for the authoritative numbers.

### 3. Fresh context without losing the thread (built)
You cleared context 396 times and wrote 115 chat handoffs. Those are the same move: start clean, keep the state. Two buttons on every Claude tile would cover it. Clear runs `/clear` in place. Fresh with handoff runs the handoff-chat skill, starts a new session in the same worktree seeded with the block, and closes the old tile into the new one with a morph. When the context ring passes 80%, the ring itself should offer this.

### 4. Model, effort and mode chips (built)
You switched models 54 times and effort 78 times, and plan mode is your default way in (299 `/plan`). Put the current model, effort and permission mode on the tile header as chips. Clicking one types the slash command into the PTY, so it stays exactly Claude Code's own behavior.

### 5. Etwal harness buttons (built)
The etwal scripts are your most-run commands after shell basics. The adapter knows their paths, so they can become actions on each etwal worktree: Preflight (`wt-doctor.sh`), Status (`wt-status.sh`), Merge check (`wt-merge-check.sh`) and Design ratchet (`bun run ds:check`). Each opens a small results tile, or summarizes back into the bus. The `ds:check` count (1,771) alone justifies a persistent ratchet badge on etwal tiles: green at or under baseline, red with the offending files when it regresses.

## Next: the workflows you repeat end to end

### 6. A PR panel per worktree (built)
PR traffic is the largest single cluster in the transcripts. A slide-out on each tile, fed by `gh pr view --json` and `gh pr checks`, would show the PR's state, checks, review comments and body. It needs four buttons, matching what you ask for in prompts. Draft PR it writes the body from the repo template, which for etwal follows the pr-body rules in the harness. Update body re-derives the body from the diff, the routine you ran 83 times. Retake screenshots and Open on GitHub cover the rest. The worktree strip already shows `PR #n`, so the hook point exists.

### 7. Screenshot sets from the preview (built)
You took 1,128 screenshots through Playwright and asked 34 times for them to land in a numbered Desktop folder. The preview pane already captures one shot to `~/Desktop`. A Shot set mode would take a list of routes, an optional login, and a width (1440 for etwal PRs) and save `01-<surface>-1440.png`, `02-…`, numbered, into `~/Desktop/<project>-pr-<N>-screenshots`. Before/after would run the same set against develop's worktree and the branch side by side.

### 8. Let Claude drive the in-app browser (built)
Playwright is your most-called MCP server by a wide margin, and the etwal harness carries a whole gotcha about the shared browser profile locking when two sessions use it. The preview webviews are real Chromium with a per-worktree cookie jar. Expose them through the orchestrator MCP server as `browser_navigate`, `browser_click`, `browser_evaluate` and `browser_screenshot` tools scoped to the session's own preview. You would see every click happen next to the terminal, and sessions could never fight over a profile again.

### 9. Goal mode with rounds (built)
`/goal` plus "qa it" runs 192 times, usually phrased as "keep going until there are no new bugs." A Goal toggle on a tile could take a goal and a stop condition and run in rounds. Each round prompts the session, records what it fixed, and asks a QA-role sibling to check the result in its own read-only view. It stops when a round comes back clean or hits a round cap. The bus, roles and `spawn_session` already exist. This adds a small loop controller and a round history in the tile.

### 10. Safer shipping alongside other sessions (built)
"There's another session working, so only push this work" and "fold in the other session's one-line change" come up 35 times, many inside `/ship`. The bus already knows who claimed what. A Ship action can show the files each session touched, from claims plus the git diff, stage only this session's files, and ask the other session over the bus before folding its change in. It then hands off to your existing `/ship` skill for the Railway part.

### 11. Railway tiles (built)
`railway ssh`, `variables`, `logs` and `deployment` add up to about 2,000 calls. Add a Deploy tile kind with environment tabs (staging, prod), a live `railway logs` stream in a terminal, a variables diff between local `.env` and each environment (the "make sure everything is in parity" prompts), and a one-click `railway ssh` shell. All of it runs the Railway CLI you already use, so auth stays where it is.

### 17. A handoff shelf to pick up later (built)
You asked for a handoff saved to a file 43 times (`/handoff-chat .md desktop`). Another 69 prompts amount to "continue from that handoff". Today those files pile up on the Desktop, and resuming means finding one and pasting it into a new session. The app already writes handoffs for Fresh session with handoff (`collectHandoff` in `src/main/hub.ts`), so it can keep them instead of throwing them away.

Save handoff, from the tile menu or the context ring, has the session write the handoff the same way. The app stores it as markdown in `~/.orchestrator/handoffs/<project>/<date>-<slug>.md`, together with the project, worktree, branch, session name and the transcript id. Saving can also close the session, which is the "I'm done for today" move. The launcher card shows a project's saved handoffs, and the new-session sheet gets a fourth tab, Pick up, next to Resume. Picking one starts a fresh session in the same worktree, seeded with the handoff. If the worktree is gone, the session starts in the primary checkout and is told which branch to restore. Each handoff also records the transcript id, so "Resume the original conversation instead" is one click when the full history matters more than a clean context. A saved handoff can be renamed, opened in an editor, or deleted, and pickups mark it used so the list stays short.

### 21. Worktree names from the first prompt (built)
Today a new worktree needs a branch name before anything starts, and the New worktree tab won't go without one. You usually know the task, not the name. A Settings toggle, Name worktrees from the first prompt, makes the branch field optional. Leave it empty, write the first prompt, and the app names the worktree for you.

The name comes from a one-shot `claude -p --model haiku` call on the prompt. It runs on the user's own Claude Code login, so there is no new key to set up. The call returns a short kebab-case slug, which the app turns into `<prefix>/<slug>`. The prefix comes from the adapter, or from the repo's recent branches (`feat/` for etwal), else `orch/`. If the branch already exists, the name gets a `-2`. If the call fails or takes more than a few seconds, the slug falls back to the prompt's first few words through the `slugify` that the handoff shelf already uses (`src/main/handoffs.ts`).

Renaming a worktree after the fact means moving its folder, renaming its branch and keeping its reserved ports, so the name is settled before anything is created. While you type the prompt, the sheet asks for a suggestion in the background and shows it in the branch field, greyed. Start accepts it, and you can overwrite it first. Sessions that `spawn_session` with `worktree: "new"` and no branch get the same naming in place of today's `orch/<name>-<hex>` (`requestSpawn` in `src/main/hub.ts`). The tile and session name can come from the same call.

### 22. Tile borders that warn about context size
The context ring is 16 pixels wide and only pulses at 80%. On a 1M-token model, 80% is 800k, far past the point where a session gets slow and forgetful. You want to know at a glance, across every tile on the canvas, which session is getting heavy. The tile border should tell you.

The thresholds are absolute token counts, so they mean the same thing on 200k and 1M models. Under 150k the border stays as it is. At 150k it turns yellow. At 200k it turns red. At 250k it turns red and flashes, a slow pulse on the border color, until the session clears, compacts or hands off. The ring keeps its percentage, and its popover adds the token count and the next threshold ("212k used, flashes at 250k").

`contextInfo` in `src/main/recents.ts` already computes the used tokens and throws them away after turning them into a percent. It should return `used` as well, and the session state should carry a `contextTokens` next to `contextPct` (`src/shared/types.ts`). `Tile.tsx` maps the count to a border class. The flash is a CSS keyframe on `border-color` and `box-shadow`, not a framer-motion loop, so ten heavy tiles don't cost ten animation frames each tick, and it respects `prefers-reduced-motion` by holding solid red. The three numbers go in Settings with these defaults.

Open question before building: the border already glows amber when a session is waiting for input (`glow` in `Tile.tsx`), so a yellow border at 150k would read as "needs you." The first step needs its own look, such as orange or a thinner, dashed amber line, and a waiting session at 250k needs a rule for which signal wins. The ring has the same issue in a smaller way: it already turns amber above 65% and rose above 85% (`Ring` in `src/renderer/components/ui.tsx`), so on a 1M model it can show purple while the border is red. Ring colors should follow the same token thresholds.

## Later: the rest of your machine

### 12. Saved remote hosts (built)
You SSH into the Mac Studio, the Office DJ box and the MC VPS regularly, often to restart a service or read logs. A Hosts list in the launcher could open any of them as a shell tile with one click, using the names already in your `~/.ssh/config`. A remote tile could also run Claude over SSH so a session lives on the box it is fixing, which matters for the Minecraft server work (`/mc-maintenance`, Crafty restarts, the ChatMenu and ServerManager plugins).

### 13. Database console per worktree (built; migration drift only when an adapter names a drift command)
`psql` shows up 376 times, mostly against the etwal dev DB and the isolated `*_test` databases the worktree script creates. A DB tile can open `psql` with the worktree's own `DATABASE_URL` from its `.env`. It can list the repo's seed scripts as buttons (66 seed requests) and show migration drift, the thing `dev-up.sh` and `wt-doctor.sh` check for.

### 14. Design canvas next to the code (built)
Design passes (`/design`, variations, Figma reconciliation) run through artifacts and Figma links. A tile kind that opens a claude.ai artifact or a Figma URL in a webview, pinned beside the session implementing it, saves the alt-tab. Pair it with item 7 so a screenshot of the live preview can drop straight onto the design for comparison.

### 15. Images into sessions (built)
447 prompts carry pasted images, usually a screenshot of the running app with a red circle. The preview can already save a shot and paste its path. Add an annotate step, a quick pen and arrow over the capture before it goes to the session, so "this padding, here" travels with the image.

### 16. Personal skills as launchers (built: skills in the palette)
Smaller loops with dedicated skills: `/invoice` (11), meeting sync and analysis (121 meeting prompts, mostly Conduit work), `/recap` (18) and `/security-review` (16). The command palette can list every skill in `~/.claude/skills` and run one in the active tile, or in a scratch session when it does not belong to a project.

## Making it installable for others

Today the app assumes your machine: your paths, your skills, your Desktop and an ad-hoc signature that only your Mac trusts. These three stages turn it into something another Claude Code user can download.

### 18. Stage 1: send it to a friend (built, except signing with a Developer ID, notarizing and publishing to GitHub Releases)
Five fixes, most of them removals.

Move the built-in adapters out of the app bundle. `adapters/etwal.json` ships inside the build with `/Users/elimcgehee/...` paths in it. Per-user adapters belong in `~/.orchestrator/adapters/`, next to the repo-level `.orchestrator.json` that already works.

Make every prompt the app types self-contained. Fresh session with handoff asks for the handoff-chat format. The QA role brief mentions the etwal protocol. The PR panel sends "update the pr body", and Ship calls `/ship`. All four assume your personal skills. Each gets a default prompt that works for anyone, with today's wording as an adapter override, and Ship falls back to `git add <files> && git commit && git push`.

Compile the debug server out of release builds. Right now a packaged build that sees `ORCH_DEBUG_PORT` opens an endpoint that runs arbitrary JavaScript in the app. That is fine on your machine and unacceptable on anyone else's.

Sign and notarize. That needs an Apple Developer ID ($99 a year), hardened runtime with the entitlements Electron and node-pty need, and `notarytool`. electron-builder handles all of it once the certificate is in the keychain. Without it, other Macs report the app as damaged.

Publish a `.dmg` per architecture (arm64 and x64, since node-pty is native) on GitHub Releases. `scripts/install-app.sh` stays as your personal dev loop.

### 19. Stage 2: public beta (one to two weeks)
First-run checks: is `claude` installed, which version, is it logged in. A fix-it screen covers each failure, and Settings can override the claude binary and the shell.

Version tolerance. The supported surface is solid: the `--settings`, `--mcp-config`, `--append-system-prompt` and `--session-id` flags, plus hook payloads. The transcript format and its folder naming are not documented, yet usage, context, model and handoffs read them. Each of those should degrade quietly when the format moves, and CI should smoke-test against every new `claude` release.

Auto-update through electron-updater (signed builds only), plus a Homebrew cask.

A plain privacy note. Everything stays local. The app reads `~/.claude` history and transcripts, keeps its state in Application Support, sends no telemetry, and never edits the user's own Claude settings files, because hooks and MCP are injected per session. That last point belongs on the download page.

Naming and license. The app is now Canopy (renamed 2026-10-05); "Canopy for Claude Code" works as a description. Claude or Anthropic branding stays out of the app name and icon. Pick a license (MIT if it goes open source).

### 20. Stage 3: Linux, then Windows (several weeks)
Most of the app is portable. The parts that are not:

| Part | macOS today | Linux | Windows |
| --- | --- | --- | --- |
| Port watcher | `lsof`, `ps` | `ss` (lsof is often missing) | `Get-NetTCPConnection` |
| Login-shell environment | `zsh -ilc env` | `$SHELL -ilc env` | PowerShell profile |
| Hook commands | `curl` | `curl` | a bundled Node relay script |
| Desktop alias, iCloud signing workaround | osascript | not needed | not needed |
| Terminals | node-pty | node-pty | node-pty over ConPTY |

Ship macOS first and add Linux when someone asks for it. Windows waits for real demand.

## Not worth building

Some frequent things stay out on purpose. Slack and email drafting barely appear (7 prompts). The meeting and Slack prompts are mostly about features of Conduit itself, not workflows the harness should own. Plan review already works well inside Claude Code, so the app should show plans, not replace the flow.

## Where these plug in

Most items reuse what is there. Ports, usage and context live in `src/main/hub.ts`, `src/main/port-watcher.ts` and `src/main/recents.ts`. Repo scripts go through the adapter (`adapters/etwal.json`, `src/main/worktree/adapters.ts`). Anything a session should be able to do becomes a tool in `src/main/bus/server.ts`. Anything you click becomes a tile action in `src/renderer/components/Tile.tsx` or a palette command in `CommandPalette.tsx`. New tile kinds (deploy, host, db, design) extend `SessionKind` in `src/shared/types.ts`, the same way `shell` and `dev` do today.
