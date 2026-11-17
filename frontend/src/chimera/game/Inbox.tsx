import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { Inbox as InboxIcon, X, CheckCheck, Clock, ArrowRight, Egg, Map as MapIcon, Dumbbell, Swords, Eye, Store, Skull, Ticket } from 'lucide-react'
import { useWallet, errorText, setTxStep } from '../chain'
import { fmtDuration, useRefresh } from '../hooks'
import { usePending, type PendingItem } from '../pending'
import { Button, BusyNote, go, useAction, toast } from '../ui'
import { sfx } from './sfx'
import { closeScene, getSceneOpen, openScene, sceneActive, sceneDone, sceneFail, sceneStep, waitForSceneResult } from './store'

const ICON: Record<PendingItem['kind'], typeof Egg> = { egg: Egg, expedition: MapIcon, training: Dumbbell, battle: Swords, oracle: Eye, market: Store, raid: Skull, raffle: Ticket }
const BG: Record<PendingItem['kind'], string> = { egg: '#FFD209', expedition: '#3DDC97', training: '#FF8FC7', battle: '#FF7020', oracle: '#E9D9FF', market: '#5AC8FA', raid: '#FFD209', raffle: '#FF8FC7' }

let openInbox: (v: boolean) => void = () => {}
/** Open the inbox drawer from anywhere (map alerts, banners). */
export const showInbox = () => openInbox(true)

/** Header button: everything the keeper left half-done, with one "Finish all" button. */
export function InboxButton() {
  const { account } = useWallet()
  return account ? <ConnectedInbox account={account} /> : null
}

function ConnectedInbox({ account }: { account: Address }) {
  const p = usePending(account)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    openInbox = setOpen
    return () => { openInbox = () => {} }
  }, [])
  // One nudge per session if the keeper comes back to unfinished business.
  const n = p.items.length
  useEffect(() => {
    if (!account || n === 0 || sessionStorage.getItem('chm:inboxNudge') === account) return
    sessionStorage.setItem('chm:inboxNudge', account)
    toast({ kind: 'ok', title: `${n} unfinished action${n > 1 ? 's' : ''} waiting`, detail: 'Open the inbox (top bar) and press Finish all.' }, 9000)
  }, [account, n])
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="chm-hud-control chm-hud-inbox"
        data-pending={n > 0 || undefined}
        title={n ? `${n} unfinished action${n > 1 ? 's' : ''}` : 'Inbox: nothing waiting'}
        aria-label={n ? `Inbox, ${n} unfinished actions` : 'Inbox'}
      >
        <InboxIcon className="h-4 w-4" aria-hidden="true" />
        {n > 0 && <span className="chm-hud-count" aria-hidden="true">{n}</span>}
      </button>
      {open && <Drawer p={p} onClose={() => setOpen(false)} />}
    </>
  )
}

function Drawer({ p, onClose }: { p: ReturnType<typeof usePending>; onClose: () => void }) {
  const { busy, run, status } = useAction()
  const refresh = useRefresh()
  const [done, setDone] = useState<Record<string, 'ok' | 'rejected' | 'err'>>({})
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && !getSceneOpen() && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])

  const after = (it: PendingItem) => refresh(...it.refresh, 'bal', 'balHandle', 'quests')

  const one = (it: PendingItem) =>
    run(it.title, async (step) => {
      try {
        const r = await it.run(step)
        setDone((d) => ({ ...d, [it.key]: pendingOutcome(r) }))
        return r
      } catch (e) {
        setDone((d) => ({ ...d, [it.key]: 'err' }))
        throw e
      } finally {
        after(it)
      }
    }, it.kind === 'market' ? 'Specimen transferred to the buyer' : `${it.title}: done`, it.scene && { spec: it.scene })

  const all = () => {
    if (sceneActive()) return
    return run('Finish all', async (step) => {
      const list = p.items.filter((it) => done[it.key] !== 'ok' && done[it.key] !== 'rejected')
      let ok = 0
      for (const [i, it] of list.entries()) {
        const tag = `(${i + 1}/${list.length}) ${it.title}`
        step(tag)
        const animation = it.scene ? openScene(it.scene, tag) : undefined
        const report = (message: string, hash?: string) => {
          if (it.scene) sceneStep(message, hash)
          step(`${tag} · ${message}`, hash)
        }
        setTxStep(report)
        try {
          const result = await it.run(report)
          if (it.scene) sceneDone(result, it.kind === 'market' ? 'Specimen transferred to the buyer' : `${it.title}: done`)
          const status = pendingOutcome(result)
          if (status === 'ok') ok++
          setDone((d) => ({ ...d, [it.key]: status }))
        } catch (e) {
          if (it.scene) sceneFail(errorText(e))
          setDone((d) => ({ ...d, [it.key]: 'err' }))
          toast({ kind: 'err', title: `${it.title} failed`, detail: errorText(e) }, 9000)
        } finally {
          setTxStep(step)
          after(it)
        }
        if (animation !== undefined && i < list.length - 1) {
          await waitForSceneResult(animation)
          closeScene(animation)
        }
      }
      if (ok) sfx.win()
      return { ok }
    }, 'Inbox batch finished')
  }

  const items = p.items
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={() => !busy && onClose()}>
      <aside className="chm-rise flex h-full w-full max-w-[440px] flex-col border-l-[4px] border-[#111] bg-[#F4F4F4] shadow-[-8px_0_0_#FFD209]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Inbox">
        <div className="flex items-center gap-3 border-b-[3px] border-[#111] bg-[#111] px-4 py-3 text-[#F4F4F4]">
          <InboxIcon className="h-5 w-5 text-[#FFD209]" />
          <div className="flex-1">
            <div className="font-pixel text-[11px] text-[#FFD209]">INBOX</div>
            <div className="text-xs opacity-80">Things you started that need one more step</div>
          </div>
          <button onClick={onClose} disabled={!!busy} className="border-2 border-[#F4F4F4] p-1 disabled:opacity-40" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.length > 0 && (
            <div className="border-[3px] border-[#111] bg-[#FFD209] p-3 shadow-[4px_4px_0_#111]">
              <div className="text-sm font-bold">
                {items.length} action{items.length > 1 ? 's' : ''} to finish. None of them spend new cZAMA: they only post a Zama proof or collect a payout.
              </div>
              <Button className="mt-2 w-full justify-center" onClick={all} busy={busy === 'Finish all'} disabled={!!busy}>
                <CheckCheck className="h-4 w-4" /> Finish all
              </Button>
              <BusyNote status={busy === 'Finish all' ? status : null} className="mt-2" />
            </div>
          )}
          {p.battleHistoryUnavailable && <div className="chm-panel p-3 text-sm" role="status">
            Battle history is unavailable. <button type="button" className="font-bold underline" onClick={() => { onClose(); go('arena/log') }}>Look up a battle by ID</button>
          </div>}
          {items.length === 0 && !p.battleHistoryUnavailable && (
            <div className="border-[3px] border-dashed border-[#111] bg-white p-5 text-center">
              <CheckCheck className="mx-auto h-8 w-8 text-[#1FA46A]" />
              <div className="mt-2 font-bold">{p.loading ? 'Checking your unfinished business…' : 'All caught up'}</div>
              <div className="text-sm text-[var(--chm-dim)]">Unproven eggs, unsettled fights, finished expeditions and unclaimed rewards show up here.</div>
            </div>
          )}

          {items.map((it) => {
            const I = ICON[it.kind]
            const st = done[it.key]
            return (
              <div key={it.key} className={`flex items-start gap-3 border-[3px] border-[#111] bg-white p-3 ${st === 'ok' ? 'opacity-50' : ''}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center border-2 border-[#111]" style={{ background: BG[it.kind] }}>
                  <I className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {it.title} {st === 'ok' && <span className="text-[#1FA46A]">✓</span>}
                    {st === 'rejected' && <span className="text-[#E5341D]"> · payment declined</span>}
                    {st === 'err' && <span className="text-[#E5341D]"> · failed, try again</span>}
                  </div>
                  <div className="text-xs text-[var(--chm-dim)]">{it.detail}</div>
                  <div className="mt-2 flex gap-2">
                    <Button className="!px-2.5 !py-1 text-xs" onClick={() => one(it)} busy={busy === it.title} disabled={!!busy || st === 'ok' || st === 'rejected'}>
                      Finish
                    </Button>
                    <button
                      className="inline-flex items-center gap-1 text-xs font-bold underline"
                      onClick={() => {
                        onClose()
                        go(it.route)
                      }}
                      disabled={!!busy}
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  {busy === it.title && <BusyNote status={status} className="mt-2" />}
                </div>
              </div>
            )
          })}

          {p.waiting.length > 0 && (
            <div className="pt-2">
              <div className="mb-2 font-mono text-[10px] font-black uppercase tracking-widest">On the clock</div>
              {p.waiting.map((w) => (
                <div key={w.key} className="flex items-center gap-2 border-b-2 border-dashed border-[#111]/30 py-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span className="flex-1">{w.title}</span>
                  <span className="font-mono text-xs font-bold">{fmtDuration(Math.max(0, Math.round(w.readyAt - p.now)))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function pendingOutcome(result: unknown) {
  return result && typeof result === 'object' && 'ok' in result && result.ok === false ? 'rejected' : 'ok'
}
