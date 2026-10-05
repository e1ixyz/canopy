import { AnimatePresence, motion } from 'motion/react'
import { Camera, CheckCircle2, CircleDashed, ExternalLink, FilePen, GitPullRequestDraft, Loader2, RefreshCw, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PromptKey } from '@shared/prompts'
import type { PrInfo, Session } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { askPrompt } from '../lib/prompts'
import { cx } from '../lib/util'
import { useApp } from '../store/app'
import { Button, IconButton } from './ui'

const CHECK = {
  pass: { icon: <CheckCircle2 size={12} />, cls: 'text-emerald-300' },
  fail: { icon: <XCircle size={12} />, cls: 'text-rose-300' },
  pending: { icon: <CircleDashed size={12} className="animate-spin" />, cls: 'text-amber-200' },
  skipped: { icon: <CircleDashed size={12} />, cls: 'text-white/35' },
}

/** Slide-out over a tile: the branch's PR, its checks and reviews, and the routines that change it */
export function PrPanel({ s, tileId, onClose }: { s: Session; tileId: string; onClose: () => void }) {
  const [pr, setPr] = useState<PrInfo | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const { set, setPreview } = useApp()

  const load = async (force = false) => {
    setLoading(true)
    setPr(await orch.invoke('pr:get', s.cwd, force).catch(() => null))
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cwd])

  const ask = (key: PromptKey, vars: Record<string, string | number>) => {
    askPrompt(s.id, key, vars)
    onClose()
  }

  const counts = pr ? { pass: pr.checks.filter((c) => c.state === 'pass').length, fail: pr.checks.filter((c) => c.state === 'fail').length, pending: pr.checks.filter((c) => c.state === 'pending').length } : null

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={spring.layout}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 bottom-0 z-30 flex w-[min(420px,92%)] flex-col border-l border-white/[0.08] bg-[var(--glass)] shadow-[var(--pop-shadow)]"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <GitPullRequestDraft size={15} className="text-violet-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{pr ? `#${pr.number} ${pr.title}` : 'Pull request'}</div>
          <div className="truncate font-mono text-[11px] text-white/40">
            {pr ? `${pr.head} → ${pr.base}` : s.branch}
          </div>
        </div>
        <IconButton title="Refresh" onClick={() => load(true)}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </IconButton>
        <IconButton title="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-thin px-4 py-4">
        {pr === undefined && <div className="py-10 text-center text-[12.5px] text-white/40">Asking GitHub…</div>}
        {pr === null && (
          <div className="py-8 text-center">
            <div className="text-[14px] font-semibold text-white/85">No PR for {s.branch ?? 'this branch'}</div>
            <div className="mx-auto mt-1 mb-5 max-w-[260px] text-[12.5px] text-white/45">The session opens one as a draft, using the repo's PR template if it has one.</div>
            <Button tone="primary" onClick={() => ask('prDraft', { branch: s.branch ?? 'this branch' })}>
              <GitPullRequestDraft size={14} /> Draft PR
            </Button>
          </div>
        )}
        {pr && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cx('rounded-md px-2 py-0.5 text-[11px] font-semibold', pr.isDraft ? 'bg-white/[0.08] text-white/70' : pr.state === 'MERGED' ? 'bg-violet-400/20 text-violet-100' : pr.state === 'CLOSED' ? 'bg-rose-400/15 text-rose-200' : 'bg-emerald-400/15 text-emerald-200')}>
                {pr.isDraft ? 'Draft' : pr.state.toLowerCase()}
              </span>
              {pr.reviewDecision && <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/65">{pr.reviewDecision.toLowerCase().replace(/_/g, ' ')}</span>}
              {counts && (
                <span className="ml-auto flex items-center gap-2 text-[11.5px]">
                  <span className="text-emerald-300">{counts.pass} ✓</span>
                  {counts.fail > 0 && <span className="text-rose-300">{counts.fail} ✗</span>}
                  {counts.pending > 0 && <span className="text-amber-200">{counts.pending} …</span>}
                </span>
              )}
            </div>

            {pr.checks.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                {pr.checks.map((c, i) => (
                  <div key={i} className={cx('flex items-center gap-2 px-1.5 py-1 text-[12px]', CHECK[c.state].cls)}>
                    {CHECK[c.state].icon}
                    <span className="truncate text-white/75">{c.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button tone="soft" size="sm" onClick={() => ask('prBody', { pr: pr.number, base: pr.base, head: pr.head })}>
                <FilePen size={12} /> Update body
              </Button>
              <Button
                tone="soft"
                size="sm"
                onClick={() => {
                  setPreview(tileId, { open: true })
                  onClose()
                  setTimeout(() => set({ shotSet: { sessionId: s.id, tileId } }), 500)
                }}
              >
                <Camera size={12} /> Retake screenshots
              </Button>
              <Button tone="soft" size="sm" onClick={() => ask('prFeedback', { pr: pr.number })}>
                Address feedback
              </Button>
              <Button tone="soft" size="sm" onClick={() => orch.invoke('shell:openExternal', pr.url)}>
                <ExternalLink size={12} /> Open on GitHub
              </Button>
            </div>

            {(pr.reviews.length > 0 || pr.comments.length > 0) && (
              <div>
                <div className="mb-2 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">Latest feedback</div>
                <AnimatePresence initial={false}>
                  {[...pr.reviews.filter((r) => r.body).map((r) => ({ who: r.author, tag: r.state.toLowerCase(), body: r.body })), ...pr.comments.map((c) => ({ who: c.author, tag: '', body: c.body }))]
                    .slice(-6)
                    .map((c, i) => (
                      <div key={i} className="mb-2 rounded-xl bg-white/[0.04] p-2.5">
                        <div className="text-[11px] text-white/45">
                          <b className="text-white/70">{c.who}</b> {c.tag}
                        </div>
                        <div className="mt-1 line-clamp-6 text-[12px] leading-relaxed whitespace-pre-wrap text-white/75 select-text">{c.body}</div>
                      </div>
                    ))}
                </AnimatePresence>
              </div>
            )}

            <div>
              <div className="mb-2 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">Body</div>
              <pre className="max-h-80 overflow-auto scroll-thin rounded-xl bg-black/35 p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-white/70 select-text">{pr.body || '(empty)'}</pre>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
