import { AnimatePresence, motion } from 'motion/react'
import {
  BellRing,
  Boxes,
  BookOpen,
  Command,
  Eraser,
  Flag,
  Gauge,
  GitPullRequest,
  Globe,
  MousePointerClick,
  GitFork,
  LayoutGrid,
  Lock,
  MessagesSquare,
  Plug,
  Rocket,
  Search,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { spring } from '../lib/motion'
import { cx } from '../lib/util'
import { useApp } from '../store/app'
import { IconButton } from './ui'

type Block =
  | { p: string }
  | { list: string[] }
  | { keys: [string, string][] }
  | { code: string }
  | { tools: [string, string][] }

interface Section {
  id: string
  title: string
  icon: ReactNode
  blurb: string
  blocks: Block[]
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: <Rocket size={15} />,
    blurb: 'Pick a project and the first session starts on its own.',
    blocks: [
      { p: 'The launcher lists every folder you have used Claude Code in, newest first, pulled from ~/.claude/history.jsonl. Type to filter, press Enter to open the top match, or use Open folder for something new. Pin the projects you live in so they stay on top.' },
      { p: 'Opening a project creates a page named after it and starts a Claude session in the project root. If another session already works there, you get the new-session sheet instead, pointed at a fresh worktree.' },
      { p: 'Every tile is the real claude CLI. Slash commands, your own skills, plugins, hooks, MCP servers, plan mode and /resume all behave the way they do in your terminal. The app adds a bus, ports and a browser around it.' },
      { list: ['⌘T starts another session on the current project.', '⌘⇧T starts one in a new worktree.', '⌘O goes back to the launcher. Your pages keep running behind it.'] },
    ],
  },
  {
    id: 'layout',
    title: 'Tiles, pages & layout',
    icon: <LayoutGrid size={15} />,
    blurb: 'Tiles reflow on their own. You decide what sits next to what.',
    blocks: [
      { p: 'A page holds a set of tiles and lays them out in a grid that picks its own column count. Tiles with an open preview take two columns. A short last row stretches to fill the width.' },
      { list: [
        'Double-click a tile header, or press ⌘↵, to focus it. The others shrink into a strip on the right.',
        'Drag a tile by its header to reorder it. Drop it on a page tab to move it to that page.',
        '⇧-click headers to select several tiles, then use Broadcast in the dock to type one prompt into all of them.',
        'Double-click a page tab to rename it. Hover a tab and press × to close the page and stop its sessions.',
        '⌘⌥← and ⌘⌥→ switch pages. ⌘1 to ⌘9 jump to a tile on the current page.',
      ] },
      { p: 'Pages, tiles and previews persist. Quit the app and they come back where you left them, with each Claude session reattached through --resume.' },
      { p: 'Builds installed with bun run install-app check GitHub for new commits on main at launch and every hour. When there are some, a card in the corner lists them. Update pulls and rebuilds in the background, then Restart now installs it and reopens Canopy with your sessions. Check for updates in the palette, or Settings › Check now, asks right away.' },
      { p: 'Settings › Appearance switches between light and dark. It follows macOS by default, or pin it to Light or Dark. Terminals restyle with it, and new Claude sessions pick a matching light or dark palette.' },
    ],
  },
  {
    id: 'sessions',
    title: 'Sessions & roles',
    icon: <Users size={15} />,
    blurb: 'Roles shape what a session is told to do, not what it can do.',
    blocks: [
      { p: 'The new-session sheet sets the checkout, role, model, permission mode and an optional first prompt. Resume lists past transcripts for the project, across all of its worktrees, so you can pull an old conversation back into a tile.' },
      { list: [
        'Lead breaks work into tasks and spawns workers in their own worktrees.',
        'Worker does one task, claims its files and reports back.',
        'Reviewer starts in plan mode and never edits.',
        'QA runs the project’s checks, reads the diff and drives the preview, then reports. Its brief is a prompt you can change (Settings → Prompts, or an adapter).',
        'Docs keeps HANDOFF.md current as other sessions land work.',
      ] },
      { p: 'The tile menu has Restart (resume), Update HANDOFF.md, Hand off to a fresh session, Start dev server, Shell here and Reveal in Finder. A crashed or exited session shows a Resume button over its terminal.' },
    ],
  },
  {
    id: 'profiles',
    title: 'Profiles (work and personal)',
    icon: <UserRound size={15} />,
    blurb: 'Two Claude logins side by side, one click apart.',
    blocks: [
      { p: 'A profile is a Claude config folder with its own login, settings, history and transcripts. The default is ~/.claude. Add another in Settings → Profiles: give it a name, a color and a folder (~/.claude-personal, say). Canopy can copy your settings.json and CLAUDE.md into it and link your skills folder so both profiles share skills. Start a session on the new profile and run /login once.' },
      { p: 'Once there are two, a colored pill sits at the left of the top bar and a thin line in the same color runs across the top of the window. Click the pill, or press ⌥⌘P, to pick the profile new sessions start as. ⌥⌘1 and ⌥⌘2 switch straight to the first and second. Running sessions keep the profile they started with, and each tile shows its profile next to the name.' },
      { p: 'The new-session sheet has a profile picker too. Tick Always use this profile for a project and its sessions start on that profile whatever the top bar says. Resume finds transcripts in every profile and reopens each one on the profile it came from. Handoffs, QA siblings and sessions started with spawn_session inherit the profile of the session that made them.' },
    ],
  },
  {
    id: 'worktrees',
    title: 'Worktrees & ports',
    icon: <GitFork size={15} />,
    blurb: 'One checkout, one session. Every worktree owns its ports.',
    blocks: [
      { p: 'Two sessions in one checkout flip branches under each other and sweep each other’s files into commits. When you try it, the sheet offers a new worktree, a read-only reviewer, or Start anyway.' },
      { p: 'A new worktree lands next to the repo as <repo>-wt-<branch>. The app reserves a web and api port pair for it and remembers that reservation even while the dev server is stopped, so the next worktree never gets handed the same pair. It copies .env with the port keys rewritten and links HANDOFF.md to the primary checkout’s copy.' },
      { p: 'You can leave the branch empty. Write the first prompt instead and the app names the worktree from it, with a quick Haiku call on your own Claude Code login. The suggestion shows greyed in the branch field while you type; click the field to edit it. The prefix is the adapter’s branchPrefix, else the one your recent branches use (feat/, fix/…), else orch/. A name that is taken gets -2. Sessions that start one with spawn_session and no branch get the same naming. Turn it off in Settings.' },
      { p: 'Sessions get PORT and WEB_PORT in their environment. Their brief also tells them to use those ports.' },
      { p: 'Worktrees (in the dock) shows every worktree with its branch, changes, ahead/behind count, ports and sessions. From there you can start a session or dev server in it, or remove it. Removal refuses when there are uncommitted changes or commits that exist on no other branch unless you confirm, and it stops any session still running in the worktree first.' },
    ],
  },
  {
    id: 'bus',
    title: 'Session bus',
    icon: <MessagesSquare size={15} />,
    blurb: 'Sessions talk to each other through MCP tools. You can join in.',
    blocks: [
      { p: 'Every Claude session gets an orchestrator MCP server. The tools are pre-approved, so calling them never asks for permission.' },
      { tools: [
        ['list_sessions', 'Everyone running: name, role, status, task, branch, ports.'],
        ['send_message', 'Message a session by name, or "user" to reach you in the bus drawer.'],
        ['broadcast', 'One message to the whole project, or to every session.'],
        ['read_inbox', 'Read messages and mark them read.'],
        ['claim / release / who_owns', 'Advisory file locks shared across every worktree of the repo.'],
        ['set_status', 'The short task line on the tile header.'],
        ['get_ports / open_preview', 'Find the worktree’s dev server and open it beside the terminal.'],
        ['spawn_session', 'Ask you to start another session. You approve it in a pop-up.'],
        ['handoff', 'Pass work to a named session, or to a fresh one seeded with the summary.'],
      ] },
      { p: 'Delivery: an idle session wakes with a short prompt and reads the message. A busy one gets it the moment its turn ends. Nobody gets woken while you have a half-typed prompt in their tile. Each session takes at most four automatic wakes every five minutes, so two sessions cannot ping-pong forever.' },
      { p: 'Open the drawer with ⌘B. Feed shows the conversation and lets you message a session, the project, or everyone. Claims lists every lock with a Release button. Overlap scans for files changed in more than one worktree.' },
    ],
  },
  {
    id: 'claims',
    title: 'File claims',
    icon: <Lock size={15} />,
    blurb: 'Claim before you edit. Everyone else gets asked first.',
    blocks: [
      { p: 'A session claims repo-relative paths or globs such as src/api/**. Another session editing a claimed file, in any worktree of the same repo, hits a PreToolUse hook. By default Claude asks you for permission and shows who holds the claim. Settings can switch that to block the edit, or turn claims off.' },
      { p: 'Claims are advisory. They prevent accidents, not determined edits, and they disappear when the session that made them closes.' },
    ],
  },
  {
    id: 'preview',
    title: 'Browser preview',
    icon: <Globe size={15} />,
    blurb: 'See each worktree’s web server without leaving the tile.',
    blocks: [
      { p: 'The globe in a tile header turns green when something listens under that worktree. The app finds ports by watching the processes each session starts, and falls back to the listening process’s working directory, never to the port number alone. Click the globe, or press ⌘⇧P, to split the tile into terminal and browser.' },
      { list: [
        'Drag the divider to resize. Port chips jump between servers.',
        'Fill, 1440, 768 and 390 set the page width. Wider widths scale down to fit.',
        'The moon toggles prefers-color-scheme between dark, light and page default.',
        'The camera opens the screenshot in a mark-up sheet: draw arrows, boxes or freehand, then Send pastes the PNG’s path into the session’s prompt. ⌥-click saves straight to ~/.orchestrator/shots/<session>; ⇧-click saves and pastes without marking up.',
        'Each worktree has its own cookie jar, so a login on one branch never collides with another.',
        'Clicking a localhost link in a terminal opens it in the preview.',
      ] },
      { p: 'No server yet? Start dev server runs the project adapter’s run script or the package.json dev script with the worktree’s ports exported. Its logs open under the preview. If it can’t find a command or the server exits, Set up with Claude asks the tile’s session to install what’s missing and add a devCommand to the repo’s .orchestrator.json.' },
    ],
  },
  {
    id: 'tiles',
    title: 'Other tile kinds',
    icon: <Boxes size={15} />,
    blurb: 'Tiles for the things you keep opening next to the code.',
    blocks: [
      { p: 'Database console here, in a tile’s menu, opens psql on the checkout’s DATABASE_URL. The URL is read from the .env when the tile starts and handed to psql through its environment, so it never shows up in a process list. The side panel shows which database you are on, switches between .env files that define one, and turns the db, seed and migrate scripts in package.json into buttons. Anything named like reset, drop or push asks for a second click.' },
      { p: 'Railway logs & variables asks once per checkout which project, service and environments to use, prefilled from the Railway CLI’s own link when it has one. The tile streams railway logs, and the panel’s tabs switch environment. Compare lists every variable that differs between a local .env and the environment, by name; values stay hidden until you reveal one, and the app never stores them. SSH opens railway ssh in its own tile. Nothing here deploys or writes a variable.' },
      { p: 'Hosts come from ~/.ssh/config, plus any you add in Settings. Each one is a card on the launcher and an entry in the palette: Shell opens ssh in a tile, the sparkle runs Claude on the host itself.' },
      { p: 'Open design beside… puts a claude.ai artifact, a Figma file or any URL in a tile next to the session. Design tiles share one browser profile, so you sign in once. Compare captures the session’s live preview and lays it over the design with an opacity slider, or beside it, and Mark up sends that comparison to the session.' },
    ],
  },
  {
    id: 'claude-browser',
    title: 'Browser tools for Claude',
    icon: <MousePointerClick size={15} />,
    blurb: 'Sessions drive the preview you are watching, not a hidden Playwright window.',
    blocks: [
      { p: 'Every session has browser tools on the orchestrator MCP server, scoped to the preview beside its own terminal. The tools open the preview if it is closed, so a session can test its own worktree’s app without being asked to.' },
      { tools: [
        ['browser_open / browser_navigate', 'Open the preview or load a URL. Relative paths resolve against the current page.'],
        ['browser_snapshot', 'Headings, page text, and every visible button, link and input tagged with a ref such as e12.'],
        ['browser_click / browser_type', 'Act on a ref or a CSS selector with real mouse and keyboard events.'],
        ['browser_screenshot', 'Saves to ~/.orchestrator/shots/<session> and hands the image back to Claude.'],
        ['browser_evaluate / browser_console / browser_wait_for', 'Run JavaScript, read console output, wait for text to appear.'],
        ['browser_resize', 'Switch the pane between fill, 1440, 768 and 390.'],
      ] },
      { p: 'Because it is the same preview, it keeps the worktree’s logins, and two sessions can never fight over one browser profile.' },
    ],
  },
  {
    id: 'pr',
    title: 'PRs & screenshot sets',
    icon: <GitPullRequest size={15} />,
    blurb: 'The PR, its checks and its screenshots, without leaving the tile.',
    blocks: [
      { p: 'Click PR #n in a tile’s footer, or choose Pull request in the tile menu, to slide out the PR panel. It shows the state, every check, the review decision, the latest feedback and the body. Draft PR, Update body and Address feedback hand the job to the session, so your PR template and harness rules still apply. Retake screenshots opens a screenshot set.' },
      { p: 'A screenshot set (the stacked-images button in the preview toolbar) captures a list of routes as full-page PNGs. It uses the preview’s login, at one width (1440 by default) and in light or dark. The files are numbered 01-route-1440.png, 02-… in ~/Desktop/<project>-pr-<N>-screenshots. Routes are remembered per project.' },
    ],
  },
  {
    id: 'goals',
    title: 'Goals & safe shipping',
    icon: <Flag size={15} />,
    blurb: 'Keep a session going until QA says it is done. Ship only what is yours.',
    blocks: [
      { p: 'Goal… in the tile menu takes a goal, a stop condition and a round cap. The session works a round and reports with goal_report. If it claims done, a QA sibling starts in the same checkout, checks the work and answers with goal_verdict. A clean verdict marks the goal met. Problems go back to the worker as the next round. The goal chip on the header shows the round, and its popover lists every round with QA’s findings.' },
      { p: 'QA and reviewer sessions are read-only, and the app enforces it: their edits are blocked by a hook, not just discouraged in the prompt.' },
      { p: 'Ship… lists every changed file in the worktree and who it belongs to. A file is yours if you edited it. It belongs to a sibling session in the same checkout if that session edited or claimed it. Your files start checked. Ask owner messages a sibling over the bus. Ship asks the session to commit only those files and push. Point the Ship prompt at your own skill in Settings → Prompts; if it uses {target}, the sheet also offers staging, prod or both.' },
    ],
  },
  {
    id: 'meters',
    title: 'Ports, usage & context',
    icon: <Gauge size={15} />,
    blurb: 'The questions you used to ask Claude, answered in the top bar.',
    blocks: [
      { p: 'The plug in the top bar lists every listening port on the machine with its process, working directory and owning session. Open sends it to that tile’s preview, Restart reruns the worktree’s dev server, and Kill stops it. A port no session owns asks before it is killed. Ports the app has reserved for worktrees are listed underneath, live or idle.' },
      { p: 'The gauge shows what today’s Claude work would cost at API list prices. It reads each session’s transcript and prices every message for the model that answered it, with output, cache writes and cache reads at their own rates. Its popover lists the raw token counts, splits the cost by session and project (sessions you closed today still count) and can run /usage in the active tile. A session that hits a rate or usage limit gets flagged and you get a notification.' },
      { p: 'Chips on each Claude tile show the model, the effort level and the permission mode. Changing one runs /model, /effort or a Shift+Tab, the same as typing it yourself. The context ring measures the last turn against the model’s window (1M tokens on Claude 4.6 and later, 200K on older models) and opens Fresh session with handoff, Clear and Compact. Past 80% it pulses.' },
    ],
  },
  {
    id: 'fresh',
    title: 'Fresh context & handoffs',
    icon: <Eraser size={15} />,
    blurb: 'Start clean without losing the thread, now or tomorrow.',
    blocks: [
      { p: 'Fresh session with handoff asks the session to write a handoff and print it. The app then starts a new session in the same checkout, seeded with that handoff, in the same tile. The old session closes. Nothing needs approving because you asked for it.' },
      { p: 'Save handoff for later, in the tile menu or the context ring, does the same writing but keeps the result on a shelf instead of starting anything. Save handoff and close also ends the session, which is the end-of-day move.' },
      { list: [
        'Handoffs live as markdown in ~/.orchestrator/handoffs/<project>/, with the checkout, branch, session name and transcript id at the top.',
        'Launcher cards show how many are waiting. Click the count, or open the new-session sheet’s Pick up tab.',
        'Pick up starts a fresh session where the work lives. If that worktree is gone, it starts in the main checkout and is told which branch to restore.',
        'Resume original conversation brings back the full history instead, when the transcript still exists.',
        'Rename, open in your editor, delete, or Import file… to shelve a handoff written somewhere else.',
      ] },
      { p: 'Clear runs /clear in place. Use it when the history is not worth carrying. The wording of the handoff request is yours to change in Settings → Prompts.' },
    ],
  },
  {
    id: 'attention',
    title: 'Attention & notifications',
    icon: <BellRing size={15} />,
    blurb: 'The app tells you which session needs you, and when.',
    blocks: [
      { p: 'A session waiting on a permission prompt glows amber. Its page tab shows a count, and the top bar shows how many need you. A session that finished its turn gets a quieter finished state, which clears when you click into it.' },
      { p: 'Press ⌘J to jump to the next session that needs you. With the window in the background, macOS notifications do the same job. Click one to go straight to the tile.' },
      { p: 'The ring in a header shows how much of the context window the session has used. Past roughly 80%, hand it off to a fresh session from the tile menu.' },
    ],
  },
  {
    id: 'keys',
    title: 'Keyboard shortcuts',
    icon: <Command size={15} />,
    blurb: 'Everything worth doing twice has a key.',
    blocks: [
      { keys: [
        ['⌘K', 'Command palette: commands, sessions, projects, hosts, skills, and a search across every terminal’s scrollback'],
        ['⌘K then /', 'Only your skills: user, plugin and project ones. Enter runs it in the active Claude tile, or a scratch session'],
        ['⌘T', 'New session'],
        ['⌘⇧T', 'New worktree + session'],
        ['⌘O', 'Projects launcher'],
        ['⌘⇧O', 'Overview of every session'],
        ['⌘B', 'Session bus'],
        ['⌘J', 'Next session that needs you'],
        ['⌘↵', 'Focus or unfocus the active tile'],
        ['⌘⇧P', 'Toggle the preview for the active tile'],
        ['⌘W', 'Close the active tile'],
        ['⌘1 to ⌘9', 'Jump to a tile on this page'],
        ['⌘⌥← / ⌘⌥→', 'Previous or next page'],
        ['⌥⌘P', 'Profile menu (with two or more profiles)'],
        ['⌥⌘1 to ⌥⌘9', 'Start new sessions as that profile'],
        ['⌘/', 'This guide'],
        ['⇧↵', 'New line inside a Claude prompt'],
      ] },
    ],
  },
  {
    id: 'adapters',
    title: 'Project adapters',
    icon: <Plug size={15} />,
    blurb: 'Teach the app a repo’s own worktree and dev-server scripts.',
    blocks: [
      { p: 'A repo with its own tooling can ship a .orchestrator.json at its root, or you can keep adapters for repos you don’t control in ~/.orchestrator/adapters (Settings → Open folder; match is a path prefix and may start with ~/). An adapter can route worktree creation and dev servers through the repo’s scripts, add tile actions and a badge, and override any prompt. When a create script hands out ports another worktree already claims, the app moves the new tree to a free pair. examples/adapter.example.json documents every field.' },
      { code: `{
  "worktree": {
    "create": "scripts/new-worktree.sh {branch} {base}",
    "run": "./.wt-run.sh",
    "preflight": "scripts/wt-doctor.sh"
  },
  "devCommand": "bun run dev",
  "previewPath": "/login"
}` },
      { p: 'Placeholders: {branch}, {base}, {primary}, {slug}, {path}. Values get shell-quoted for you.' },
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshooting',
    icon: <Wrench size={15} />,
    blurb: 'The things most likely to bite, and the fix for each.',
    blocks: [
      { list: [
        'A session will not resume: Claude only writes a transcript after the first message, so a never-used session starts fresh with the same id instead.',
        'Login answers 403 on a worktree port: the app needs TRUSTED_ORIGINS for that port. An adapter’s run script can set it; otherwise add it to the worktree’s .env.',
        'A port shows under the wrong tile: two processes share a working directory. Start the server from the tile that owns it, or use Start dev server.',
        'No notifications: turn them on in Settings and allow Canopy in System Settings › Notifications.',
        'After changing the app’s code, run bun run install-app in the project. It rebuilds, re-signs and refreshes the Desktop alias.',
        'Do not run the dev build and the installed app at the same time. They share one state file.',
      ] },
    ],
  },
]

function textOf(s: Section) {
  return [s.title, s.blurb, ...s.blocks.flatMap((b) => ('p' in b ? [b.p] : 'list' in b ? b.list : 'keys' in b ? b.keys.flat() : 'tools' in b ? b.tools.flat() : [b.code]))]
    .join(' ')
    .toLowerCase()
}

export function HelpPanel() {
  const { helpOpen, set } = useApp()
  const [active, setActive] = useState('start')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ helpOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen, set])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? SECTIONS.filter((s) => textOf(s).includes(needle)) : SECTIONS
  }, [q])
  const section = matches.find((s) => s.id === active) ?? matches[0]

  return (
    <AnimatePresence>
      {helpOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-md" onClick={() => set({ helpOpen: false })} />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={spring.bouncy}
            className="glass relative flex h-[min(780px,88vh)] w-[min(1080px,100%)] overflow-hidden rounded-3xl shadow-[var(--pop-shadow)]"
          >
            <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 p-4">
              <div className="mb-4 flex items-center gap-2.5 px-1">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-400/40 to-sky-400/30 ring-1 ring-white/10">
                  <BookOpen size={15} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold">Guide</div>
                  <div className="text-[11px] text-white/45">How Canopy works</div>
                </div>
              </div>
              <div className="relative mb-3">
                <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-white/35" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search the guide…"
                  aria-label="Search the guide"
                  className="no-drag h-9 w-full rounded-xl border border-white/[0.08] bg-black/30 pr-3 pl-8 text-[12.5px] text-white placeholder-white/30 outline-none focus:border-violet-400/40"
                />
              </div>
              <nav className="-mx-1 min-h-0 flex-1 overflow-y-auto scroll-thin px-1">
                <AnimatePresence initial={false}>
                  {matches.map((s) => (
                    <motion.button
                      key={s.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={spring.snappy}
                      onClick={() => setActive(s.id)}
                      className={cx(
                        'relative mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px]',
                        section?.id === s.id ? 'text-white' : 'text-white/55 hover:text-white/85',
                      )}
                    >
                      {section?.id === s.id && (
                        <motion.span layoutId="help-active" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-white/[0.08]" />
                      )}
                      <span className="relative text-white/50">{s.icon}</span>
                      <span className="relative">{s.title}</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
                {!matches.length && <div className="px-3 py-6 text-[12.5px] text-white/40">Nothing matches “{q}”.</div>}
              </nav>
              <div className="mt-3 border-t border-white/[0.06] px-1 pt-3 text-[11px] leading-relaxed text-white/40">
                Open this any time with <kbd>⌘/</kbd> or the ? in the top bar.
              </div>
            </aside>

            <div className="relative min-w-0 flex-1">
              <div className="absolute top-4 right-4 z-10">
                <IconButton title="Close (esc)" onClick={() => set({ helpOpen: false })}>
                  <X size={15} />
                </IconButton>
              </div>
              <AnimatePresence mode="wait">
                {section && (
                  <motion.article
                    key={section.id}
                    initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                    transition={spring.gentle}
                    className="absolute inset-0 overflow-y-auto scroll-thin px-10 pt-9 pb-12 select-text"
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-violet-300/80 uppercase">
                      {section.icon} {section.title}
                    </div>
                    <h2 className="mb-6 max-w-2xl text-[26px] leading-tight font-semibold tracking-tight text-white">{section.blurb}</h2>
                    <div className="max-w-2xl space-y-5">
                      {section.blocks.map((b, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.04 * i }}>
                          <BlockView b={b} q={q} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.article>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Mark({ text, q }: { text: string; q: string }) {
  const needle = q.trim()
  if (needle.length < 2) return <>{text}</>
  const i = text.toLowerCase().indexOf(needle.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-violet-400/30 px-0.5 text-white">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  )
}

function BlockView({ b, q }: { b: Block; q: string }) {
  if ('p' in b) return <p className="text-[14px] leading-[1.7] text-white/75"><Mark text={b.p} q={q} /></p>
  if ('list' in b)
    return (
      <ul className="space-y-2">
        {b.list.map((t) => (
          <li key={t} className="flex gap-3 text-[14px] leading-[1.65] text-white/75">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300/70" />
            <span><Mark text={t} q={q} /></span>
          </li>
        ))}
      </ul>
    )
  if ('keys' in b)
    return (
      <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
        {b.keys.map(([k, d], i) => (
          <div key={k} className={cx('flex items-center gap-4 px-4 py-2.5', i % 2 === 0 && 'bg-white/[0.025]')}>
            <kbd className="min-w-[96px] text-center !text-[12px] !text-white/85">{k}</kbd>
            <span className="text-[13.5px] text-white/75"><Mark text={d} q={q} /></span>
          </div>
        ))}
      </div>
    )
  if ('tools' in b)
    return (
      <div className="grid gap-2">
        {b.tools.map(([n, d]) => (
          <div key={n} className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-2.5">
            <div className="font-mono text-[12.5px] text-violet-200">{n}</div>
            <div className="mt-0.5 text-[13px] text-white/65"><Mark text={d} q={q} /></div>
          </div>
        ))}
      </div>
    )
  return <pre className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-white/80">{b.code}</pre>
}
