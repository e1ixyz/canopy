import { describe, expect, it, vi } from 'vitest'
import { GoalController } from './goal'

function setup() {
  const prompts: [string, string][] = []
  const deps = {
    prompt: vi.fn((id: string, t: string) => void prompts.push([id, t])),
    qa: vi.fn(async () => 'qa1'),
    attention: vi.fn(),
    save: vi.fn(),
  }
  return { c: new GoalController(deps, (id) => id), deps, prompts }
}

describe('GoalController', () => {
  it('runs worker → QA → unclean → next round → clean', async () => {
    const { c, deps, prompts } = setup()
    c.start('w', { goal: 'fix finders', stop: 'no bugs', maxRounds: 3, qa: true })
    expect(prompts[0][1]).toMatch(/GOAL round 1\/3/)
    expect(await c.report('w', { done: true, summary: 'fixed two' })).toMatch(/QA session is verifying/)
    expect(deps.qa).toHaveBeenCalledOnce()
    expect(c.verdict('qa1', { clean: false, findings: 'search breaks on empty' })).toMatch(/round 2/)
    expect(prompts[1][1]).toMatch(/round 2\/3[\s\S]*search breaks on empty/)
    await c.report('w', { done: true, summary: 'fixed empty search' })
    expect(c.verdict('qa1', { clean: true, findings: '' })).toMatch(/met/)
    expect(deps.attention).toHaveBeenCalledWith('w', 'Goal met, verified by QA')
    expect(c.goals.has('w')).toBe(false)
  })
  it('continues in-turn without QA and stops at the round cap', async () => {
    const { c, deps } = setup()
    c.start('w', { goal: 'g', stop: 's', maxRounds: 2, qa: false })
    expect(await c.report('w', { done: false, summary: 'half' })).toMatch(/GOAL round 2\/2/)
    expect(await c.report('w', { done: false, summary: 'still' })).toMatch(/last allowed round/)
    expect(deps.attention).toHaveBeenCalledWith('w', 'Goal stopped at round 2')
  })
  it('nudges a QA that stops without a verdict, once per round', async () => {
    const { c } = setup()
    c.start('w', { goal: 'g', stop: 's', maxRounds: 2, qa: true })
    await c.report('w', { done: true, summary: 'done' })
    expect(c.onStop('qa1')).toMatch(/goal_verdict/)
    expect(c.onStop('qa1')).toBeNull()
  })
  it('goes back to running when the QA session goes away', async () => {
    const { c, deps } = setup()
    c.start('w', { goal: 'g', stop: 's', maxRounds: 2, qa: true })
    await c.report('w', { done: true, summary: 'done' })
    c.onSessionGone('qa1')
    expect(c.goals.get('w')?.status).toBe('running')
    expect(deps.attention).toHaveBeenCalledWith('w', 'QA for round 1 ended without a verdict')
  })
  it('does not wait on a QA that could not start', async () => {
    const { c, deps } = setup()
    deps.qa.mockRejectedValueOnce(new Error('worker gone'))
    c.start('w', { goal: 'g', stop: 's', maxRounds: 2, qa: true })
    expect(await c.report('w', { done: true, summary: 'done' })).toMatch(/could not start/)
    expect(c.goals.get('w')?.status).toBe('running')
  })
  it('nudges once per round when the worker stops without reporting', () => {
    const { c } = setup()
    c.start('w', { goal: 'g', stop: 's', maxRounds: 2, qa: false })
    expect(c.onStop('w')).toMatch(/goal_report/)
    expect(c.onStop('w')).toBeNull()
  })
  it('ignores verdicts from sessions nobody asked', () => {
    const { c } = setup()
    expect(c.verdict('stranger', { clean: true, findings: '' })).toMatch(/no round/)
  })
})
