import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPTS, fillText, resolvePrompt, shipHasTargets } from './prompts'

describe('prompts', () => {
  it('falls back from settings to adapter to default', () => {
    expect(resolvePrompt('prFeedback', {}, { pr: 7 })).toBe('Look at the review comments and failing checks on PR #7 and address them.')
    expect(resolvePrompt('updateHandoff', { adapter: { updateHandoff: '/docs' } })).toBe('/docs')
    expect(resolvePrompt('updateHandoff', { settings: { updateHandoff: '/handoff' }, adapter: { updateHandoff: '/docs' } })).toBe('/handoff')
    // blank overrides don't count
    expect(resolvePrompt('handoff', { settings: { handoff: '  ' } })).toBe(DEFAULT_PROMPTS.handoff)
  })
  it('fills known placeholders and keeps unknown ones', () => {
    expect(fillText('/ship{target}. {files} {nope}', { target: ' staging', files: 'a b' })).toBe('/ship staging. a b {nope}')
    expect(fillText('/ship{target}', { target: '' })).toBe('/ship')
  })
  it('offers deploy targets only when the ship prompt uses {target}', () => {
    expect(shipHasTargets({})).toBe(false)
    expect(shipHasTargets({ settings: { ship: '/ship{target} {files}' } })).toBe(true)
  })
  it('defaults never lean on personal skills', () => {
    for (const t of Object.values(DEFAULT_PROMPTS)) expect(t).not.toMatch(/handoff-chat|etwal|^\/\w/)
  })
})
