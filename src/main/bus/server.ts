import { createServer, type IncomingMessage, type Server } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getState } from '../store'
import { HOOK_EVENTS, type HookEvent } from '../hooks/inject'
import type { Hub } from '../hub'
import { recipients } from './bus'

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const json = (v: unknown) => text(JSON.stringify(v, null, 2))

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** One MCP server per request (stateless transport), bound to the calling session */
function buildMcp(hub: Hub, sid: string) {
  const server = new McpServer({ name: 'orchestrator', version: '0.1.0' })
  const me = () => {
    const s = hub.sessions.get(sid)
    if (!s) throw new Error('Unknown session')
    return s
  }

  server.registerTool(
    'list_sessions',
    { description: 'List every session in the orchestrator: name, id, role, status, current task, branch, worktree, live and reserved ports.' },
    async () => json(hub.list().filter((s) => s.status !== 'exited' && s.status !== 'error').map((s) => hub.describe(s))),
  )

  server.registerTool(
    'send_message',
    {
      description:
        'Send a message to another session (by name or id) or to "user" (the human, shown in the GUI). Idle recipients are woken to read it; busy ones get it when their current turn ends. Only send when needed — no acknowledgements.',
      inputSchema: { to: z.string(), body: z.string(), wake: z.boolean().optional() },
    },
    async ({ to, body, wake }) => {
      const from = me()
      const ids = recipients(to, from, hub.list())
      if (!ids.length) return text(`No session named "${to}". Call list_sessions to see who is running.`)
      for (const id of ids) hub.bus.post('message', from.id, id, body, wake ?? true)
      return text(`Sent to ${ids.map((i) => hub.sessions.get(i)?.name ?? i).join(', ')}.`)
    },
  )

  server.registerTool(
    'broadcast',
    {
      description: 'Send one message to every session on the same project ("project", default) or every session in the orchestrator ("all").',
      inputSchema: { body: z.string(), scope: z.enum(['project', 'all']).optional(), wake: z.boolean().optional() },
    },
    async ({ body, scope, wake }) => {
      hub.bus.post('broadcast', me().id, scope === 'all' ? '*' : 'project', body, wake ?? false)
      return text('Broadcast sent.')
    },
  )

  server.registerTool(
    'read_inbox',
    { description: 'Read (and mark read) any messages other sessions or the user sent you.' },
    async () => {
      const msgs = hub.bus.unread(sid)
      if (!msgs.length) return text('Inbox is empty.')
      const out = hub.bus.formatInbox(sid, msgs)
      hub.bus.markRead(sid)
      hub.patch(sid, { unread: 0 })
      return text(out)
    },
  )

  server.registerTool(
    'claim',
    {
      description:
        'Claim repo-relative files, directories or globs (e.g. "src/api/**") before editing, so sessions in other worktrees of the same repo are warned off them. Fails for paths someone else holds.',
      inputSchema: { paths: z.array(z.string()).min(1), reason: z.string().optional() },
    },
    async ({ paths, reason }) => {
      const { claimed, conflicts } = hub.bus.claim(me(), paths, reason ?? '')
      const lines = []
      if (claimed.length) lines.push(`Claimed: ${claimed.join(', ')}`)
      for (const c of conflicts)
        lines.push(`Held by ${hub.sessions.get(c.sessionId)?.name ?? c.sessionId}: ${c.pattern}${c.reason ? ` (${c.reason})` : ''}`)
      return text(lines.join('\n'))
    },
  )

  server.registerTool(
    'release',
    { description: 'Release your claims (all of them, or just the listed patterns).', inputSchema: { paths: z.array(z.string()).optional() } },
    async ({ paths }) => {
      const r = hub.bus.release(sid, paths)
      return text(r.length ? `Released ${r.join(', ')}` : 'Nothing to release.')
    },
  )

  server.registerTool(
    'who_owns',
    { description: 'Check who has claimed a repo-relative path.', inputSchema: { path: z.string() } },
    async ({ path }) => {
      const s = me()
      const owners = hub.bus.owners(s.repo ?? s.cwd, path.replace(/^\.\//, ''))
      if (!owners.length) return text(`${path} is unclaimed.`)
      return text(owners.map((c) => `${hub.sessions.get(c.sessionId)?.name ?? c.sessionId}: ${c.pattern} ${c.reason}`).join('\n'))
    },
  )

  server.registerTool(
    'set_status',
    {
      description: 'Set the short task line (and optional 0-100 progress) shown on your tile in the GUI.',
      inputSchema: { task: z.string(), progress: z.number().min(0).max(100).optional() },
    },
    async ({ task, progress }) => {
      hub.patch(sid, { task, progress })
      return text('Status updated.')
    },
  )

  server.registerTool(
    'get_ports',
    {
      description: "Ports for a session (default: you): the worktree's reserved pair and the ports actually listening under it.",
      inputSchema: { session: z.string().optional() },
    },
    async ({ session }) => {
      const id = session ? recipients(session, undefined, hub.list())[0] : sid
      const s = id ? hub.sessions.get(id) : undefined
      if (!s) return text('No such session.')
      const sameTree = hub.list().filter((o) => o.cwd === s.cwd)
      return json({ reserved: hub.reserved(s.cwd), listening: [...new Set(sameTree.flatMap((o) => o.ports))], lastUrl: s.url })
    },
  )

  server.registerTool(
    'open_preview',
    {
      description: "Open (or navigate) the browser preview next to your terminal in the GUI. Defaults to your worktree's dev server.",
      inputSchema: { url: z.string().optional() },
    },
    async ({ url }) => {
      const s = me()
      const port = hub.list().filter((o) => o.cwd === s.cwd).flatMap((o) => o.ports)[0]
      const target = url ?? s.url ?? (port ? `http://localhost:${port}` : undefined)
      if (!target) return text('No dev server is listening for this worktree yet. Start one, or pass a url.')
      hubEmitPreview(hub, sid, target)
      return text(`Preview opened at ${target}`)
    },
  )

  server.registerTool(
    'spawn_session',
    {
      description:
        'Ask the user to start another Claude Code session (they confirm in the GUI). worktree: "new" (default; a fresh git worktree + branch, the safe choice for parallel edits), "same" (read-only helpers only), or an absolute worktree path. Leave branch out and the new branch is named from the prompt.',
      inputSchema: {
        prompt: z.string(),
        name: z.string().optional(),
        role: z.enum(['worker', 'reviewer', 'qa', 'docs', 'lead', 'plain']).optional(),
        worktree: z.string().optional(),
        branch: z.string().optional(),
        model: z.string().optional(),
      },
    },
    async (a) => {
      const s = me()
      const project = getState().projects.find((p) => p.id === s.projectId)
      try {
        const created = await hub.requestSpawn(s, {
          kind: 'claude',
          projectPath: project?.path ?? s.cwd,
          cwd: s.cwd,
          name: a.name,
          role: hub.sessionRole(a.role),
          prompt: a.prompt,
          model: a.model,
          worktree: a.worktree ?? 'new',
          branch: a.branch,
        })
        return json({ started: true, ...hub.describe(created) })
      } catch (e) {
        return text(`Not started: ${(e as Error).message}`)
      }
    },
  )

  server.registerTool(
    'goal_report',
    {
      description:
        'Report the end of a goal round (only when the user started a goal for you). done = the stop condition holds. The result tells you what to do next.',
      inputSchema: { done: z.boolean(), summary: z.string(), remaining: z.string().optional() },
    },
    async (r) => text(await hub.goals.report(sid, r)),
  )

  server.registerTool(
    'goal_verdict',
    {
      description: 'QA sessions only: your verdict on the goal round you were asked to verify.',
      inputSchema: { clean: z.boolean(), findings: z.string() },
    },
    async (v) => text(hub.goals.verdict(sid, v)),
  )

  const page = async () => {
    const s = me()
    return hub.browser.ensure(sid, s.cwd, () => hubEmitPreview(hub, sid, s.url ?? ''))
  }
  const browserTool = <T extends Record<string, unknown>>(fn: (wc: Electron.WebContents, a: T) => Promise<unknown>) =>
    async (a: T) => {
      try {
        const out = await fn(await page(), a)
        return typeof out === 'string' ? text(out) : (out as ReturnType<typeof text>)
      } catch (e) {
        return text(`Error: ${(e as Error).message}`)
      }
    }

  server.registerTool(
    'browser_open',
    {
      description:
        "Open the browser preview beside your terminal (your worktree's dev server by default) and return a snapshot. Prefer these browser_* tools over Playwright for this worktree's app: they drive the preview the user is watching, with its own logins.",
      inputSchema: { url: z.string().optional() },
    },
    browserTool<{ url?: string }>(async (wc, { url }) => {
      if (url) await hub.browser.navigate(wc, url)
      return hub.browser.snapshot(wc)
    }),
  )
  server.registerTool(
    'browser_navigate',
    { description: 'Load a URL in your preview (relative paths resolve against the current page).', inputSchema: { url: z.string() } },
    browserTool<{ url: string }>(async (wc, { url }) => {
      const target = /^https?:/.test(url) ? url : new URL(url, wc.getURL() || 'http://localhost').toString()
      await hub.browser.navigate(wc, target)
      return `Loaded ${wc.getURL()} (${wc.getTitle()})`
    }),
  )
  server.registerTool(
    'browser_snapshot',
    { description: 'Text snapshot of the preview: headings, interactive elements with refs (e1, e2…) for click/type, and page text.' },
    browserTool(async (wc) => hub.browser.snapshot(wc)),
  )
  server.registerTool(
    'browser_click',
    { description: 'Click an element by ref from browser_snapshot (e.g. "e12") or a CSS selector.', inputSchema: { target: z.string() } },
    browserTool<{ target: string }>(async (wc, { target }) => {
      await hub.browser.click(wc, target)
      return `Clicked ${target}. Now at ${wc.getURL()}`
    }),
  )
  server.registerTool(
    'browser_type',
    {
      description: 'Type into an input by ref or CSS selector, replacing its value. submit presses Enter.',
      inputSchema: { target: z.string(), text: z.string(), submit: z.boolean().optional() },
    },
    browserTool<{ target: string; text: string; submit?: boolean }>(async (wc, a) => {
      await hub.browser.type(wc, a.target, a.text, !!a.submit)
      return `Typed into ${a.target}${a.submit ? ' and pressed Enter' : ''}.`
    }),
  )
  server.registerTool(
    'browser_evaluate',
    { description: 'Run JavaScript in the preview page (an expression or a function body) and return the JSON result.', inputSchema: { js: z.string() } },
    browserTool<{ js: string }>(async (wc, { js }) => hub.browser.evaluate(wc, js)),
  )
  server.registerTool(
    'browser_screenshot',
    { description: 'Screenshot the preview (fullPage for the whole scroll height). Saved to the Desktop and returned as an image.', inputSchema: { fullPage: z.boolean().optional() } },
    browserTool<{ fullPage?: boolean }>(async (wc, { fullPage }) => {
      const { file, jpeg } = await hub.browser.screenshot(wc, me().name, !!fullPage)
      return { content: [{ type: 'image' as const, data: jpeg, mimeType: 'image/jpeg' }, { type: 'text' as const, text: `Saved ${file}` }] }
    }),
  )
  server.registerTool(
    'browser_resize',
    { description: 'Set the preview width in CSS px (e.g. 1440, 768, 390), or 0 to fill the pane.', inputSchema: { width: z.number() } },
    browserTool<{ width: number }>(async (_wc, { width }) => {
      hubEmitWidth(sid, width > 0 ? Math.round(width) : 'fill')
      return width > 0 ? `Preview width set to ${Math.round(width)}px.` : 'Preview fills the pane.'
    }),
  )
  server.registerTool(
    'browser_console',
    { description: 'Recent console messages from the preview page.', inputSchema: { clear: z.boolean().optional() } },
    browserTool<{ clear?: boolean }>(async (wc, { clear }) => hub.browser.console(wc, !!clear)),
  )
  server.registerTool(
    'browser_wait_for',
    { description: 'Wait until text appears on the page (up to ms, default 15000), or just wait ms.', inputSchema: { text: z.string().optional(), ms: z.number().optional() } },
    browserTool<{ text?: string; ms?: number }>(async (wc, a) => hub.browser.waitFor(wc, a.text, a.ms)),
  )

  server.registerTool(
    'handoff',
    {
      description:
        'Hand your work off. With `to`, sends the summary to that session as a HANDOFF and wakes it. Without `to`, asks the user to start a fresh session in your worktree seeded with the summary. Write the summary as: goal, state, decisions with reasons, ordered next steps, anchors (branches, paths, PRs, ports, key files) and resume commands.',
      inputSchema: { summary: z.string(), to: z.string().optional() },
    },
    async ({ summary, to }) => {
      const s = me()
      if (to) {
        const ids = recipients(to, s, hub.list())
        if (!ids.length) return text(`No session named "${to}".`)
        for (const id of ids) hub.bus.post('handoff', s.id, id, summary, true)
        return text('Handoff delivered.')
      }
      const project = getState().projects.find((p) => p.id === s.projectId)
      try {
        const created = await hub.requestSpawn(
          s,
          {
            kind: 'claude',
            projectPath: project?.path ?? s.cwd,
            cwd: s.cwd,
            role: s.role,
            prompt: `You are picking up from session ${s.name}. Their handoff:\n\n${summary}`,
            worktree: 'same',
          },
          { handoff: true },
        )
        hub.bus.post('handoff', s.id, created.id, 'Session handed off', false)
        return text(`Fresh session ${created.name} started with your handoff. You can stop here.`)
      } catch (e) {
        return text(`Not started: ${(e as Error).message}`)
      }
    },
  )

  return server
}

let previewEmitter: (sid: string, url: string) => void = () => {}
let widthEmitter: (sid: string, width: number | 'fill') => void = () => {}
function hubEmitPreview(_hub: Hub, sid: string, url: string) {
  previewEmitter(sid, url)
}
function hubEmitWidth(sid: string, width: number | 'fill') {
  widthEmitter(sid, width)
}

export async function startBusServer(
  hub: Hub,
  onPreview: (sid: string, url: string) => void,
  onWidth: (sid: string, width: number | 'fill') => void,
): Promise<Server> {
  previewEmitter = onPreview
  widthEmitter = onWidth
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const parts = url.pathname.split('/').filter(Boolean)

      if (parts[0] === 'hook' && parts.length === 3 && req.method === 'POST') {
        const [, sid, event] = parts
        if (!hub.verify(sid, url.searchParams.get('t')) || !HOOK_EVENTS.includes(event as HookEvent)) {
          res.writeHead(403).end()
          return
        }
        const raw = await readBody(req)
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(raw || '{}')
        } catch {
          /* hooks always send JSON; ignore junk */
        }
        const out = hub.handleHook(sid, event as HookEvent, payload)
        const body = out && Object.keys(out as object).length ? JSON.stringify(out) : ''
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(body)
        return
      }

      if (parts[0] === 'mcp' && parts.length === 2) {
        const sid = parts[1]
        const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null
        if (!hub.verify(sid, auth)) {
          res.writeHead(403).end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' }).end()
          return
        }
        const raw = await readBody(req)
        const mcp = buildMcp(hub, sid)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        res.on('close', () => {
          transport.close()
          mcp.close()
        })
        await mcp.connect(transport)
        await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined)
        return
      }

      if (parts[0] === 'health') {
        res.writeHead(200).end('ok')
        return
      }
      res.writeHead(404).end()
    } catch (e) {
      if (!res.headersSent) res.writeHead(500).end(String(e))
    }
  })

  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve((server.address() as { port: number }).port)
      })
    })
  let port: number
  try {
    port = await listen(47821)
  } catch {
    port = await listen(0)
  }
  hub.serverPort = port
  hub.baseUrl = `http://127.0.0.1:${port}`
  // The spawn_session tool waits on a human; don't let Node cut it off.
  server.requestTimeout = 0
  server.headersTimeout = 0
  return server
}
