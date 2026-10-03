import type { PromptKey } from '@shared/prompts'
import { orch } from './orch'
import { submitPrompt } from './terms'

/** Resolve a registry prompt for this session (settings, adapter, default) and submit it */
export async function askPrompt(sessionId: string, key: PromptKey, vars?: Record<string, string | number | undefined>) {
  submitPrompt(sessionId, await orch.invoke('prompts:get', sessionId, key, vars))
}
