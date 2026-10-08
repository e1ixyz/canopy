# Canopy

A desktop app for running many Claude Code sessions side by side. Pick a project, open as many sessions as you want, give each one its own git worktree and ports, and watch their dev servers in a browser pane next to each terminal. Sessions talk to each other over a shared bus, so they can split work without stepping on the same files.

Every tile runs the real `claude` CLI in a PTY. Slash commands, your skills, plugins, hooks, MCP servers, plan mode and `/resume` all behave the way they do in a terminal.

## Run it

```sh
bun install        # also rebuilds node-pty for Electron
bun run dev        # hot-reloading dev build
bun run app        # production build, run locally
bun run package    # Canopy.app in dist/
bun run install-app  # build, install to ~/Applications, ad-hoc sign, alias on the Desktop; this build updates itself from GitHub
bun run dist       # release .dmg files (arm64 and x64), ad-hoc signed, no debug server
bun run test       # unit tests (vitest)
bun run typecheck
```

Needs macOS, Node 22+, bun, and `claude` on your login shell's PATH. The Railway tile needs the `railway` CLI, and the database tile needs `psql`.

### Installing a .dmg on another Mac

The release build is ad-hoc signed, not notarized, so macOS won't open it with a double-click the first time. Drag Canopy to Applications, then right-click it and choose Open (on macOS 15 and later: try to open it once, then System Settings → Privacy & Security → Open Anyway). If macOS says the app is damaged, run `xattr -dr com.apple.quarantine /Applications/Canopy.app`.

## What you get

- A launcher built from your Claude Code history (`~/.claude/history.jsonl`), with pinning and search.
- Pages of tiles that reflow with spring animations. Double-click a header to focus a tile, drag a header to reorder or drop it on another page's tab, and ⇧-click headers to select tiles for a broadcast prompt.
- One checkout per session. Starting a second session in a busy checkout offers a fresh worktree, a read-only reviewer, or an override. Leave a new worktree's branch empty and it is named from your first prompt.
- Worktrees with reserved port pairs. The harness keeps its own reservations, so a stopped worktree never loses its ports to the next one. Each new worktree gets `.env` copied with the ports rewritten and `HANDOFF.md` linked to the primary's.
- A browser pane per tile (⌘⇧P) with a separate cookie jar per worktree, device widths, a dark/light toggle, DevTools, and screenshots. ⇧-click the camera to paste the screenshot path into the session.
- A session bus: `send_message`, `broadcast`, `read_inbox`, `claim`/`release`/`who_owns`, `set_status`, `get_ports`, `open_preview`, `spawn_session` and `handoff`. Idle sessions wake when a message arrives, and busy ones get it when their turn ends.
- File claims enforced by a PreToolUse hook. Editing a file another session claimed asks first, or blocks if you set that in Settings.
- Status pills, a context-usage ring, an attention queue (⌘J) and macOS notifications when a session needs you.
- An overview of every session with live terminal thumbnails (⌘⇧O), plus a command palette that also searches every terminal's scrollback (⌘K).
- Browser tools for Claude (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot`…) that drive the preview beside the terminal instead of Playwright.
- A ports popover (kill, restart, open) and a token meter for today in the top bar. Each tile has model, effort and mode chips, plus a context ring that offers Fresh session with handoff.
- A PR panel per tile (state, checks, feedback, Draft PR / Update body), and screenshot sets that save numbered full-page PNGs of a list of routes.
- Goals that run in rounds with a read-only QA sibling verifying each one, and a Ship sheet that stages only this session's files when others share the checkout.
- Project actions and a ratchet badge from the repo's adapter.
- Saved handoffs: write one from a tile and pick it up later, from the launcher or the new-session sheet's Pick up tab, or resume the original conversation.
- Tiles beyond Claude: psql on the checkout's `DATABASE_URL` with its seed and migrate scripts as buttons; `railway logs` with environment tabs and a variables diff against your `.env`; ssh shells (or Claude) on hosts from `~/.ssh/config`; and a design URL (claude.ai artifact, Figma) beside a session, with the live preview overlaid for comparison.
- Mark-up for preview screenshots (arrows, boxes, pen) before the path goes into a session.
- Your skills in the palette (⌘K, then `/`).
- Light and dark modes that follow macOS unless you pin one in Settings. Terminals restyle to match.

## Prompts

Every prompt the app types into a session (the handoff request, Update HANDOFF.md, the PR panel's buttons, Ship, the QA and docs role briefs) has a default that works without any personal skills. Settings → Prompts overrides each one, and so can an adapter. For example, set Ship to `/ship{target}. Stage and commit ONLY these files: {files}` to hand off to your own skill; because it uses `{target}`, the Ship sheet then offers staging, prod or both.

## Project adapters

A repo with its own worktree tooling can drop a `.orchestrator.json` at its root. For repos you don't control, put adapters in `~/.orchestrator/adapters/` (Settings → Open folder); `match` is a path prefix and may start with `~/`. An adapter can route worktree creation and dev servers through the repo's scripts, add tile actions and a badge, set the database `.env` and Railway target, and override prompts. If a create script hands out ports another worktree already claims, the harness moves the new tree to a free pair. `examples/adapter.example.json` documents every field. If a repo has no dev command, or its dev server exits, the preview offers Set up with Claude, which has the session install what's missing and write a `devCommand` to `.orchestrator.json`.

```json
{
  "worktree": { "create": "scripts/new-worktree.sh {branch} {base}", "run": "./.wt-run.sh" },
  "devCommand": "bun run dev",
  "previewPath": "/"
}
```

Press ⌘/ in the app for the built-in guide. See `HANDOFF.md` for how it fits together and `ROADMAP.md` for what comes next.
