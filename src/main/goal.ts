import type { GoalState } from '@shared/types'

export interface GoalDeps {
  /** type a prompt into an idle worker session */
  prompt: (sessionId: string, text: string) => void
  /** start (or re-prompt) the QA sibling for a worker; returns its session id */
  qa: (workerId: string, existing: string | undefined, text: string) => Promise<string>
  attention: (sessionId: string, text: string) => void
  save: (sessionId: string, goal: GoalState | undefined) => void
}

export interface GoalStart {
  goal: string
  stop: string
  maxRounds: number
  qa: boolean
}

const roundLine = (g: GoalState) => `GOAL round ${g.round}/${g.maxRounds}`

export function workerPrompt(g: GoalState, findings?: string) {
  return [
    `${roundLine(g)}: ${g.goal}`,
    `Stop when: ${g.stop}`,
    findings ? `QA found these problems in the last round. Fix them first:\n${findings}` : '',
    'Work until this round is complete, then call the orchestrator goal_report tool with done (true only if the stop condition holds), a short summary of what you changed, and what remains.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function qaPrompt(g: GoalState, workerName: string, summary: string) {
  return [
    `You are verifying round ${g.round} of a goal that session ${workerName} is working on in this checkout.`,
    `Goal: ${g.goal}`,
    `Stop condition: ${g.stop}`,
    `${workerName}'s summary of the round:\n${summary}`,
    'Check the work for real: read the changed code, run the tests or the gate, and use the orchestrator browser_* tools on the preview when the change is visible. Do not edit any files.',
    'Then call the orchestrator goal_verdict tool with clean (true only if the stop condition holds and you found no new bugs) and findings (specific, file:line where you can).',
  ].join('\n\n')
}

/**
 * Runs a session toward a goal in rounds. The worker reports with goal_report;
 * when it claims done, a QA sibling verifies and answers with goal_verdict.
 * Unclean verdicts start the next round with the findings, up to maxRounds.
 */
export class GoalController {
  private qaNudged = new Map<string, number>()
  goals = new Map<string, GoalState>()

  constructor(
    private deps: GoalDeps,
    private nameOf: (id: string) => string,
  ) {}

  load(sessionId: string, g: GoalState | undefined) {
    if (g && (g.status === 'running' || g.status === 'verifying')) this.goals.set(sessionId, g)
  }

  start(sessionId: string, opts: GoalStart) {
    const g: GoalState = {
      goal: opts.goal.trim(),
      stop: opts.stop.trim() || 'the goal is fully done and verified',
      maxRounds: Math.max(1, Math.min(20, opts.maxRounds || 5)),
      round: 1,
      qa: opts.qa,
      history: [],
      status: 'running',
    }
    this.goals.set(sessionId, g)
    this.deps.save(sessionId, g)
    this.deps.prompt(sessionId, workerPrompt(g))
    return g
  }

  stop(sessionId: string) {
    const g = this.goals.get(sessionId)
    if (!g) return
    g.status = 'stopped'
    this.goals.delete(sessionId)
    this.deps.save(sessionId, g)
  }

  /** goal_report from the worker; the returned text is the tool result it sees */
  async report(sessionId: string, r: { done: boolean; summary: string; remaining?: string }): Promise<string> {
    const g = this.goals.get(sessionId)
    if (!g || g.status !== 'running') return 'No goal is running for this session.'
    g.history.push({ round: g.round, summary: r.summary, remaining: r.remaining })
    if (r.done && g.qa) {
      g.status = 'verifying'
      this.deps.save(sessionId, g)
      try {
        g.qaSessionId = await this.deps.qa(sessionId, g.qaSessionId, qaPrompt(g, this.nameOf(sessionId), r.summary))
      } catch (e) {
        // No QA could start: don't leave the goal waiting on a verdict that never comes.
        g.status = 'running'
        this.deps.save(sessionId, g)
        this.deps.attention(sessionId, `QA could not start: ${(e as Error).message}`)
        return 'The QA session could not start, so this round is unverified. Tell the user, then end your turn.'
      }
      this.deps.save(sessionId, g)
      return 'A QA session is verifying this round. End your turn now; if it finds problems they come back to you as the next round.'
    }
    if (r.done) return this.finish(sessionId, g, 'Goal met')
    if (g.round >= g.maxRounds) return this.halt(sessionId, g)
    g.round++
    this.deps.save(sessionId, g)
    return `Recorded. ${workerPrompt(g)}`
  }

  /** goal_verdict from a QA session; returns the QA's tool result */
  verdict(qaSessionId: string, v: { clean: boolean; findings: string }): string {
    const entry = [...this.goals.entries()].find(([, g]) => g.qaSessionId === qaSessionId && g.status === 'verifying')
    if (!entry) return 'There is no round waiting for your verdict.'
    const [workerId, g] = entry
    const last = g.history[g.history.length - 1]
    if (last) last.verdict = v
    if (v.clean) {
      this.finish(workerId, g, 'Goal met, verified by QA')
      return 'Thanks. The goal is marked met. End your turn.'
    }
    if (g.round >= g.maxRounds) {
      this.halt(workerId, g)
      return 'Thanks. The round cap is reached, so the goal stops here. End your turn.'
    }
    g.round++
    g.status = 'running'
    this.deps.save(workerId, g)
    this.deps.prompt(workerId, workerPrompt(g, v.findings))
    return `Thanks. Your findings went back to ${this.nameOf(workerId)} as round ${g.round}. End your turn.`
  }

  /** Stop hook: nudge once per round when the worker stops without reporting, or the QA without a verdict */
  onStop(sessionId: string): string | null {
    const qa = [...this.goals.entries()].find(([, x]) => x.qaSessionId === sessionId && x.status === 'verifying')
    if (qa) {
      const [, g] = qa
      if (this.qaNudged.get(sessionId) === g.round) return null
      this.qaNudged.set(sessionId, g.round)
      return `You are verifying round ${g.round} of a goal. Call goal_verdict now (clean: true, or clean: false with findings) before you stop.`
    }
    const g = this.goals.get(sessionId)
    if (!g || g.status !== 'running') return null
    const reported = g.history.some((h) => h.round === g.round)
    if (reported || g.nudged === g.round) return null
    g.nudged = g.round
    this.deps.save(sessionId, g)
    return `You are working toward a goal (${roundLine(g)}). If this round is finished, call goal_report now. If not, keep going.`
  }

  /** A session exited or was closed: a goal waiting on it as QA goes back to running, with attention on the worker */
  onSessionGone(sessionId: string) {
    for (const [workerId, g] of this.goals) {
      if (g.qaSessionId !== sessionId || g.status !== 'verifying') continue
      g.status = 'running'
      g.qaSessionId = undefined
      this.deps.save(workerId, g)
      this.deps.attention(workerId, `QA for round ${g.round} ended without a verdict`)
    }
  }

  private finish(sessionId: string, g: GoalState, text: string) {
    g.status = 'met'
    this.goals.delete(sessionId)
    this.deps.save(sessionId, g)
    this.deps.attention(sessionId, text)
    return 'Recorded. The goal is met. Summarize the outcome for the user and stop.'
  }

  private halt(sessionId: string, g: GoalState) {
    g.status = 'stopped'
    this.goals.delete(sessionId)
    this.deps.save(sessionId, g)
    this.deps.attention(sessionId, `Goal stopped at round ${g.round}`)
    return `Recorded. That was the last allowed round (${g.maxRounds}). Summarize what is done and what remains for the user, then stop.`
  }
}
