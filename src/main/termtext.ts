/** Reading a PTY's output as text, for the hub's status and attention detection */

export const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]/g

/** Claude Code's own limit banners, not any output that mentions rate limits (a session building rate limiting would trip that) */
export const LIMIT = /(usage|5-hour|weekly|opus|session) limit reached|limit reached\W{0,4}resets|out of (extra )?usage|API Error:? 429|rate_limit_error/i

/**
 * Terminal output as text. Claude Code's renderer skips over spaces with cursor moves
 * (forward, `ESC[nC`, or to a column, `ESC[nG`), so those become spaces before the rest is stripped.
 */
export function plainText(d: string) {
  return d
    .replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(Math.min(Number(n) || 1, 256)))
    .replace(/\x1b\[\d*G/g, ' ')
    .replace(ANSI, '')
}

/** Claude Code's workspace-trust dialog, shown before SessionStart in any folder it hasn't seen (every new worktree) */
export const TRUST = /trust this folder|trust the files in this folder/i
