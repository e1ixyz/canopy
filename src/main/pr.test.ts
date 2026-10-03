import { describe, expect, it } from 'vitest'
import { checkState, parsePr } from './pr'

describe('pr', () => {
  it('maps check states', () => {
    expect(checkState({ conclusion: 'SUCCESS' })).toBe('pass')
    expect(checkState({ conclusion: 'FAILURE' })).toBe('fail')
    expect(checkState({ status: 'IN_PROGRESS' })).toBe('pending')
    expect(checkState({ state: 'SKIPPED' })).toBe('skipped')
  })
  it('parses gh pr view json', () => {
    const pr = parsePr(JSON.stringify({ number: 7, title: 't', url: 'u', state: 'OPEN', isDraft: true, body: 'b', statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS' }], comments: [{ author: { login: 'lead' }, body: 'nit' }], reviews: [], headRefName: 'feat/x', baseRefName: 'develop' }))
    expect(pr).toMatchObject({ number: 7, isDraft: true, head: 'feat/x', base: 'develop', checks: [{ name: 'ci', state: 'pass' }], comments: [{ author: 'lead', body: 'nit' }] })
  })
})
