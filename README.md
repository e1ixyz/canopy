# Orchestrator

A desktop app for running many Claude Code sessions side by side. Pick a project, open as many sessions as you want, give each one its own git worktree and ports, and watch their dev servers in a browser pane next to each terminal. Sessions talk to each other over a shared bus, so they can split work without stepping on the same files.

Every tile runs the real `claude` CLI in a PTY. Slash commands, skills (`/handoff`, `etwal-harness`), plugins, your hooks, MCP servers, plan mode and `/resume` all behave the way they do in a terminal.

## Run it

```sh
bun install        # also rebuilds node-pty for Electron
bun run dev        # hot-reloading dev build
bun run app        # production build, run locally
bun run package    # Orchestrator.app in dist/
bun run install-app  # build, install to ~/Applications, ad-hoc sign, alias on the Desktop
bun run test       # unit tests (vitest)
bun run typecheck
```

Needs macOS, Node 22+, bun, and `claude` on your login shell's PATH.

## What you get

- A launcher built from your Claude Code history (`~/.claude/history.jsonl`), with pinning and search.
- Pages of tiles that reflow with spring animations. Double-click a header to focus a tile, drag a header to reorder or drop it on another page's tab, and ⇧-click headers to select tiles for a broadcast prompt.
- One checkout per session. Starting a second session in a busy checkout offers a fresh worktree, a read-only reviewer, or an override.
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
- Project actions and a ratchet badge from the adapter (etwal: wt-doctor, wt-status, wt-merge-check, `ds:check`).

## Project adapters

Repos with their own worktree tooling can drop a `.orchestrator.json` at the root, or ship one in `adapters/`. `adapters/etwal.json` routes worktree creation through etwal's `scripts/new-worktree.sh` and dev servers through `.wt-run.sh`. If that script hands out ports another worktree already claims, the harness moves the new tree to a free pair.

```json
{
  "worktree": { "create": "scripts/new-worktree.sh {branch} {base}", "run": "./.wt-run.sh" },
  "devCommand": "bun run dev",
  "previewPath": "/"
}
```

Press ⌘/ in the app for the built-in guide. See `HANDOFF.md` for how it fits together and `ROADMAP.md` for what comes next.
