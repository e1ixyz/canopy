/**
 * Every prompt the app types into a session. The defaults work for anyone;
 * Settings → Prompts and an adapter's `prompts` override them (settings win).
 */
export type PromptKey = 'handoff' | 'updateHandoff' | 'prDraft' | 'prBody' | 'prFeedback' | 'ship' | 'qaBrief' | 'docsBrief' | 'devSetup'

export const PROMPT_KEYS: PromptKey[] = ['handoff', 'updateHandoff', 'prDraft', 'prBody', 'prFeedback', 'ship', 'qaBrief', 'docsBrief', 'devSetup']

export const PROMPT_INFO: Record<PromptKey, { label: string; vars?: string }> = {
  handoff: { label: 'Write a handoff (fresh session, save for later)' },
  updateHandoff: { label: 'Update HANDOFF.md (tile menu)' },
  prDraft: { label: 'PR panel: Draft PR', vars: '{branch}' },
  prBody: { label: 'PR panel: Update body', vars: '{pr} {base} {head}' },
  prFeedback: { label: 'PR panel: Address feedback', vars: '{pr}' },
  ship: { label: 'Ship sheet', vars: '{files} {branch} {target}' },
  qaBrief: { label: 'QA role brief' },
  docsBrief: { label: 'Docs role brief' },
  devSetup: { label: 'Preview: Set up the dev server', vars: '{error} {root}' },
}

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  handoff: [
    'Write a handoff so a fresh session can continue this work. Use these sections:',
    'Goal: one paragraph.',
    'State: what is done, what is in flight, what has not been tested yet.',
    'Decisions: each one with its reason.',
    'Next steps: ordered.',
    'Anchors: branches, worktree paths, PRs, ports, running servers, key files.',
    'Resume: the commands that get back to a working state.',
    'Be concrete and name files and commands. Print it as your final message. Do not save a file and do not call any tools.',
  ].join('\n'),
  updateHandoff:
    "Update HANDOFF.md at the repo root (create it if it's missing) so someone opening this repo cold is productive in ten minutes: what it is, how to run and test it, how it fits together, the current state, gotchas, and what's next. Ground every claim in the actual code and git state. Rewrite it in place; it is a snapshot, not a changelog.",
  prDraft:
    "Open a draft PR for {branch}. Follow the repo's pull request template if it has one (for example .github/pull_request_template.md); otherwise write Summary, Changes and Testing sections from the actual diff. Use gh pr create --draft.",
  prBody:
    'Rewrite the description of PR #{pr} from its actual diff against {base}. If the repo has a pull request template (for example .github/pull_request_template.md), follow it; otherwise use Summary, Changes, Testing and Screenshots sections. Apply it with gh pr edit {pr} --body-file <file>, then show me the new body.',
  prFeedback: 'Look at the review comments and failing checks on PR #{pr} and address them.',
  ship: 'Other sessions may be working in this checkout, so stage and commit ONLY these files and nothing else: {files}\nWrite a commit message that describes the change, commit, and push {branch}. Do not deploy anything.',
  qaBrief:
    "Your role: QA. Verify the work instead of changing it: run the project's checks (tests, typecheck, lint, any gate script), read the diff for regressions, and use the orchestrator browser_* tools on the preview for anything user-facing. Report findings ranked by severity with send_message.",
  docsBrief: "Your role: DOCS. Keep the project's HANDOFF.md (and the README where it drifts) current as the other sessions land work. Ground every claim in the code.",
  devSetup: [
    "Canopy couldn't start a dev server for this worktree. What happened: {error}",
    "Make it start: install the dependencies it needs, then add or update .orchestrator.json in {root} (the main checkout, where Canopy reads it) with a \"devCommand\" that starts the web app.",
    'The command must listen on $WEB_PORT if that is set (and $PORT for an API), since Canopy exports both for each worktree.',
    "Run it once to confirm it serves, stop it, and tell me what you installed and changed. Don't commit.",
  ].join('\n'),
}

export type PromptOverrides = Partial<Record<PromptKey, string>>

/** Plain-text {name} substitution; unknown placeholders stay as they are */
export function fillText(template: string, vars: Record<string, string | number | undefined> = {}) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m))
}

export function resolvePrompt(
  key: PromptKey,
  sources: { settings?: PromptOverrides; adapter?: PromptOverrides },
  vars: Record<string, string | number | undefined> = {},
) {
  const t = sources.settings?.[key]?.trim() || sources.adapter?.[key]?.trim() || DEFAULT_PROMPTS[key]
  return fillText(t, vars)
}

/** The ship sheet offers deploy targets only when the ship prompt can say where */
export const shipHasTargets = (sources: { settings?: PromptOverrides; adapter?: PromptOverrides }) =>
  (sources.settings?.ship?.trim() || sources.adapter?.ship?.trim() || DEFAULT_PROMPTS.ship).includes('{target}')
