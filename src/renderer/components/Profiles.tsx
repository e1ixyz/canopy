import { Check, ChevronDown, Plus, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_PROFILE_ID, PROFILE_COLORS, type Profile, type Session } from '@shared/types'
import { orch } from '../lib/orch'
import { initial, profileKey, useProfiles, type ProfileTint } from '../lib/profiles'
import { cx, tildify } from '../lib/util'
import { useApp } from '../store/app'
import { Button, inputCls, Popover, Toggle } from './ui'

const folderOf = (p: Profile) => (p.configDir ? tildify(p.configDir, orch.homedir) : '~/.claude')

const live = (s: Session) => s.kind === 'claude' && s.status !== 'exited' && s.status !== 'error'

function Avatar({ name, tint, size }: { name: string; tint: ProfileTint; size: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48), background: tint.color, color: tint.on }}
    >
      {initial(name)}
    </span>
  )
}

/** A thin bar in the active profile's color across the top of the window */
export function ProfileStripe() {
  const { active, multi, tint } = useProfiles()
  if (!multi) return null
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-40 h-[2px]" style={{ background: tint(active).color }} />
}

/** The top bar's pill: which profile new sessions start as, and a menu to switch */
export function ProfileSwitcher() {
  const { profiles, active, multi, tint } = useProfiles()
  const { profileMenuOpen: open, set, sessions, setActiveProfile } = useApp()
  if (!multi) return null
  const t = tint(active)
  const running = (id: string) => Object.values(sessions).filter((s) => live(s) && (s.profileId ?? DEFAULT_PROFILE_ID) === id).length
  const close = () => set({ profileMenuOpen: false })

  return (
    <div className="no-drag relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Profile for new sessions (⌥⌘P)"
        onClick={() => set({ profileMenuOpen: !open })}
        className="flex h-8 items-center gap-2 rounded-full pr-2.5 pl-[5px] text-[13px] font-semibold tracking-[-0.01em] text-white transition-[filter] hover:brightness-110"
        style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.ring}` }}
      >
        <Avatar name={active.name} tint={t} size={22} />
        <span className="max-w-40 truncate">{active.name}</span>
        <ChevronDown size={13} className="opacity-60" />
      </button>
      <Popover open={open} onClose={close} align="left" width={360}>
        <div role="menu" aria-label="Profiles" className="flex flex-col gap-0.5">
          <div className="px-2.5 pt-1.5 pb-1.5 text-[11px] font-semibold text-white/45">New sessions start as</div>
          {profiles.map((p, i) => {
            const pt = tint(p)
            const on = p.id === active.id
            const n = running(p.id)
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => setActiveProfile(p.id)}
                className={cx('flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors', !on && 'hover:bg-white/[0.05]')}
                style={on ? { background: pt.bg, boxShadow: `inset 0 0 0 1px ${pt.ring}` } : undefined}
              >
                <Avatar name={p.name} tint={pt} size={34} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-semibold text-white">{p.name}</span>
                  <span className="truncate font-mono text-[11px] text-white/45">{folderOf(p)}</span>
                  <span className="text-[11.5px] text-white/55">{n ? `${n} session${n === 1 ? '' : 's'} running` : 'No sessions running'}</span>
                </span>
                <span className="flex flex-col items-end gap-2">
                  {profileKey(i) && <kbd>{profileKey(i)}</kbd>}
                  {on && <Check size={16} strokeWidth={2.6} style={{ color: pt.color }} />}
                </span>
              </button>
            )
          })}
          <div className="mx-1.5 my-1 h-px bg-white/[0.07]" />
          <div className="px-2.5 pt-0.5 pb-1.5 text-[11.5px] leading-snug text-white/45">Running sessions keep the profile they started with.</div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => set({ profileMenuOpen: false, settingsOpen: true, addingProfile: true })}
              className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2 text-[12.5px] text-white/75 hover:bg-white/[0.06] hover:text-white"
            >
              <Plus size={14} /> Add profile
            </button>
            <button
              type="button"
              onClick={() => set({ profileMenuOpen: false, settingsOpen: true })}
              className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2 text-[12.5px] text-white/75 hover:bg-white/[0.06] hover:text-white"
            >
              <Settings2 size={14} /> Manage…
            </button>
          </div>
        </div>
      </Popover>
    </div>
  )
}

/** The profile a tile's session runs under, in its header */
export function ProfileChip({ session }: { session: Session }) {
  const { multi, tint, byId } = useProfiles()
  if (!multi || session.kind !== 'claude') return null
  const p = byId(session.profileId)
  const t = tint(p)
  return (
    <span
      title={`Profile: ${p.name} (${folderOf(p)})`}
      className="flex h-5 shrink-0 items-center gap-1 rounded-full pr-1.5 pl-[3px] text-[10.5px] font-semibold"
      style={{ background: t.bg, color: t.color }}
    >
      <Avatar name={p.name} tint={t} size={14} />
      {p.name}
    </span>
  )
}

/** Profile cards for the new-session sheet */
export function ProfilePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { profiles, multi, tint } = useProfiles()
  if (!multi) return null
  return (
    <div role="radiogroup" aria-label="Profile" className={cx('grid gap-2', profiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {profiles.map((p) => {
        const t = tint(p)
        const on = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.id)}
            className={cx('no-drag flex min-w-0 items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors', !on && 'border border-white/[0.08] hover:bg-white/[0.04]')}
            style={on ? { background: t.bg, boxShadow: `inset 0 0 0 1px ${t.ring}` } : undefined}
          >
            <span className={cx(!on && 'opacity-60')}>
              <Avatar name={p.name} tint={t} size={28} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cx('truncate text-[13px] font-semibold', on ? 'text-white' : 'text-white/70')}>{p.name}</span>
              <span className="truncate font-mono text-[10.5px] text-white/40">{folderOf(p)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { tint } = useProfiles()
  return (
    <div role="radiogroup" aria-label="Color" className="flex gap-1.5">
      {Object.keys(PROFILE_COLORS).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('no-drag h-5 w-5 rounded-full transition-transform hover:scale-110', c === value && 'ring-2 ring-white/70 ring-offset-2 ring-offset-[var(--tile-bg)]')}
          style={{ background: tint({ color: c }).color }}
        />
      ))}
    </div>
  )
}

/** Settings: name, color and folder per profile, and the add form */
export function ProfileSettings() {
  const { settings, updateSettings, addingProfile, set, toast } = useApp()
  const { profiles, tint } = useProfiles()
  const [adding, setAdding] = useState(addingProfile)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [color, setColor] = useState('violet')
  const [copySettings, setCopySettings] = useState(true)
  const [linkSkills, setLinkSkills] = useState(true)
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  useEffect(() => {
    if (!addingProfile) return
    setAdding(true)
    set({ addingProfile: false })
  }, [addingProfile, set])

  const patch = (id: string, p: Partial<Profile>) => updateSettings({ profiles: profiles.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  const add = async () => {
    try {
      const next = await orch.invoke('profiles:add', { name, color, configDir: folder.trim() || `~/.claude-${slug || 'profile'}`, copySettings, linkSkills })
      useApp.setState({ settings: next })
      toast(`Added ${name.trim()}. Start a session on it and run /login once.`, 'ok')
      setAdding(false)
      setName('')
      setFolder('')
    } catch (e) {
      toast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
    }
  }

  const remove = async (p: Profile) => {
    if (!confirm(`Remove the ${p.name} profile? Its folder (${folderOf(p)}) stays on disk.`)) return
    try {
      useApp.setState({ settings: await orch.invoke('profiles:remove', p.id) })
    } catch (e) {
      toast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
    }
  }

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-white/45 uppercase">Profiles</div>
      <div className="mb-2 text-[11.5px] text-white/40">
        Each profile is a separate Claude login with its own settings and history. New sessions start as the one picked in the top bar.
      </div>
      <div className="space-y-1">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px]">
            <Avatar name={p.name} tint={tint(p)} size={22} />
            <input
              aria-label="Profile name"
              defaultValue={p.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && patch(p.id, { name: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="no-drag w-28 rounded-md bg-transparent px-1 py-0.5 text-white/90 outline-none focus:bg-black/25"
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40" title={folderOf(p)}>
              {folderOf(p)}
            </span>
            <Swatches value={p.color} onChange={(c) => patch(p.id, { color: c })} />
            {p.id === DEFAULT_PROFILE_ID ? (
              <span className="w-6" />
            ) : (
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => remove(p)}
                className="no-drag rounded-md p-1 text-white/40 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {adding ? (
          <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="flex gap-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal" aria-label="Name" className={cx(inputCls, 'flex-[0_0_9rem]')} />
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={`~/.claude-${slug || 'personal'}`}
                aria-label="Config folder"
                className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12px]')}
              />
            </div>
            <Swatches value={color} onChange={setColor} />
            <div className="flex flex-col gap-2">
              <Toggle on={copySettings} onChange={setCopySettings} label="Copy settings.json and CLAUDE.md from ~/.claude" />
              <Toggle on={linkSkills} onChange={setLinkSkills} label="Share my skills folder" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button tone="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button tone="primary" size="sm" onClick={add} disabled={!name.trim()}>
                Add profile
              </Button>
            </div>
          </div>
        ) : (
          <Button tone="soft" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add profile
          </Button>
        )}
      </div>
      {settings.profiles && settings.profiles.length > 1 && (
        <div className="mt-2 text-[11.5px] text-white/40">Sign in once per profile: start a session on it and run /login.</div>
      )}
    </div>
  )
}
