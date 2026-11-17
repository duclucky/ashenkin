import { Location } from '../game/Location'
import { useState } from 'react'
import { Dices, EyeOff, KeyRound, Lock, Minus, Plus, Shuffle, Ticket, Trophy } from 'lucide-react'
import { Addr, Button, BusyNote, Empty, Label, Panel, toast, useAction } from '../ui'
import { DEPLOYED, EXPLORER, RAFFLE, useWallet } from '../chain'
import { labKey } from '../fhe'
import { fmtDuration, fmtZama, useBalance, useLabKeyReady, useNow, useRefresh } from '../hooks'
import { GuestGate } from '../game/GuestGate'
import { MAX_PER_BUY, RAFFLE_LIVE, RAKE_PCT, TICKET_PRICE, raffleBuy, raffleDraw, useMyTickets, useRaffle } from '../raffle'

const QUICK = [1, 5, 10, 25, 50]

export default function Raffle() {
  const { account } = useWallet()
  const { busy, run, status } = useAction()
  const refresh = useRefresh()
  const now = useNow(1000)
  const r = useRaffle(account)
  const bal = useBalance(account)
  const keyReady = useLabKeyReady(account)
  const tickets = useMyTickets(account, r.data?.ticketsHandle)
  const [n, setN] = useState(5)

  if (!DEPLOYED || !RAFFLE_LIVE) return <Empty title="The Raffle Tent opens once its contract is live" />

  const round = r.data?.round
  const ended = !!round && now >= round.endsAt
  const drawing = !!round?.drawing
  const cost = n * TICKET_PRICE
  const short = bal.value != null && bal.value < BigInt(cost) * 1_000_000n
  const after = () => refresh('raffle', 'raffleTickets', 'balHandle', 'bal', 'relics', 'chronicle')

  async function buy() {
    if (!round || ended || drawing || busy) return
    const res = await run('Buy tickets', (st) => raffleBuy(account!, n, st), `${n} sealed ticket${n > 1 ? 's' : ''} bought`)
    if (res) after()
  }
  async function draw() {
    const res = await run('Draw the raffle', (st) => raffleDraw(st), 'Raffle settled')
    if (!res) return
    after()
    if (res.extended) toast({ kind: 'ok', title: 'Nobody played this round', detail: 'The timer was simply restarted.' }, 7000)
    else
      toast(
        {
          kind: 'ok',
          title: res.winner?.toLowerCase() === account?.toLowerCase() ? 'You won the raffle!' : `Round #${res.round} drawn`,
          detail: `Pot ${fmtZama(res.pot)} cZAMA → winner ${res.winner?.slice(0, 6)}…${res.winner?.slice(-4)} gets ${100 - RAKE_PCT}% plus a relic cache.`,
        },
        12000,
      )
  }

  return (
    <div className="space-y-8">
      <Location place="raffle" foreground={<Drum spinning={drawing} />}>
        <span>{TICKET_PRICE} cZAMA per ticket</span>
        {round && <span>Round #{round.id} · {drawing ? 'Drawing' : ended ? 'Ready to draw' : `${fmtDuration(round.endsAt - now)} left`}</span>}
      </Location>

      {(ended || drawing) && (
        <div className="flex flex-wrap items-center gap-4 border-[4px] border-[#111] bg-[var(--chm-yellow)] p-5 shadow-[6px_6px_0_#111]">
          <Dices className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl">{drawing ? 'The draw has started' : round?.entries ? 'Time is up: draw the winner' : 'Nobody bought a ticket'}</div>
            <div className="text-sm">
              {drawing
                ? 'The winner and pot are being decrypted by the Zama network. Finish it to pay out.'
                : round?.entries
                  ? 'Anyone can do it, you don’t need a ticket. It opens two values: the winning address and the pot. Ticket counts stay sealed forever.'
                  : 'Drawing an empty round just restarts its timer.'}
            </div>
          </div>
          {account && (
            <Button variant="primary" onClick={draw} busy={busy === 'Draw the raffle'} disabled={!!busy}>
              <Shuffle className="h-4 w-4" /> {drawing ? 'Finish the draw' : round?.entries ? 'Draw the winner' : 'Restart the round'}
            </Button>
          )}
          <BusyNote status={busy === 'Draw the raffle' ? status : null} />
        </div>
      )}

      {!account ? (
        <GuestGate place="raffle" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Panel className="p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-display text-2xl">Ticket booth</div>
                  <div className="text-sm text-[var(--chm-dim)]">The number is encrypted in your browser. The chain only ever sees ciphertext.</div>
                </div>
                <div className="font-mono text-xs font-black">{bal.value != null ? `purse ${fmtZama(bal.value)} cZAMA` : ''}</div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-3 border-[3px] border-[#111] bg-white p-3 shadow-[4px_4px_0_#111]">
                  <button className="border-2 border-[#111] bg-[var(--chm-gray)] p-1.5 hover:bg-[var(--chm-yellow)]" onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="fewer tickets">
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="w-24 text-center">
                    <div className="font-display text-5xl leading-none">{n}</div>
                    <div className="font-mono text-[10px] font-black uppercase text-[var(--chm-dim)]">ticket{n > 1 ? 's' : ''}</div>
                  </div>
                  <button className="border-2 border-[#111] bg-[var(--chm-gray)] p-1.5 hover:bg-[var(--chm-yellow)]" onClick={() => setN((x) => Math.min(MAX_PER_BUY, x + 1))} aria-label="more tickets">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => setN(q)} className={`border-2 border-[#111] px-2.5 py-1 font-mono text-xs font-black shadow-[2px_2px_0_#111] ${n === q ? 'bg-[#111] text-[var(--chm-yellow)]' : 'bg-white hover:bg-[var(--chm-yellow)]'}`}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <input type="range" min={1} max={MAX_PER_BUY} value={n} onChange={(e) => setN(Number(e.target.value))} className="mt-4 w-full accent-[#111]" aria-label="ticket count" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="gold" onClick={buy} busy={busy === 'Buy tickets'} disabled={!!busy || !round || ended || drawing}>
                  <Ticket className="h-4 w-4" /> Buy {n} sealed ticket{n > 1 ? 's' : ''} · {cost} cZAMA
                </Button>
                <BusyNote status={busy === 'Buy tickets' ? status : null} />
              </div>
              {r.isError && !r.data && <p className="mt-3 text-sm">Could not verify the ticket booth. <button type="button" className="min-h-11 font-bold underline" onClick={() => r.refetch()}>Reload round</button></p>}
              {short && <p className="mt-3 border-2 border-[#E5341D] bg-[#fff0ee] p-2 text-xs">Your purse looks short. An unpaid purchase still goes through but counts as 0 tickets. The chain can’t refuse it without revealing your balance.</p>}
            </Panel>

            <Panel className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label>Your sealed tickets · round #{round?.id ?? '—'}</Label>
                {r.data?.wins ? <span className="chm-tag" style={{ background: '#FFDD00' }}>{r.data.wins} raffle win{r.data.wins > 1 ? 's' : ''}</span> : null}
              </div>
              {!r.data?.entered ? (
                <p className="mt-3 text-sm text-[var(--chm-dim)]">You have no tickets in this round yet.</p>
              ) : !keyReady ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 font-display text-3xl">
                    <Lock className="h-6 w-6" /> ??
                  </span>
                  <Button variant="ghost" className="!py-1 text-xs" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', () => labKey(account), 'Lab key unlocked')}>
                    <KeyRound className="h-3.5 w-3.5" /> Unlock your lab key to read them
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <span className="font-display text-6xl leading-none">{tickets.data != null ? String(tickets.data) : '…'}</span>
                  <span className="pb-1 text-sm text-[var(--chm-dim)]">
                    ticket{tickets.data === 1n ? '' : 's'}, visible only to you.
                    {tickets.data === 0n && ' A purchase that wasn’t paid in full counts as 0.'}
                  </span>
                </div>
              )}
              <p className="mt-4 text-xs text-[var(--chm-dim)]">
                Your chance is your tickets ÷ all tickets. The total is sealed too, so nobody, including you, can work out anyone’s odds or who is ahead.
              </p>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel className="p-5">
              <Label className="mb-3">How it stays fair</Label>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0" /> Ticket counts, the running total and the pot are encrypted. A public pot would leak each buy, so it stays sealed until the draw.
                </li>
                <li className="flex gap-2">
                  <Shuffle className="mt-0.5 h-4 w-4 shrink-0" /> Each purchase of k tickets takes the lead with chance k ÷ (tickets so far). This is decided by encrypted randomness on ciphertext. In the end every ticket had exactly the same chance.
                </li>
                <li className="flex gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" /> The leader is an encrypted address. The contract itself can’t read who is winning, so there is no last-second sniping.
                </li>
                <li className="flex gap-2">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0" /> The draw opens only two values with a Zama KMS proof that the contract verifies: the winner and the pot.
                </li>
              </ul>
              <a className="mt-3 inline-block font-mono text-[11px] underline" href={`${EXPLORER}/address/${RAFFLE}`} target="_blank" rel="noreferrer">
                contract on Etherscan ↗
              </a>
            </Panel>
            <Panel className="p-5">
              <Label className="mb-3">Past draws</Label>
              {!r.data?.past.length ? (
                <div className="text-sm text-[var(--chm-dim)]">No round has been drawn yet. The first one is still selling.</div>
              ) : (
                <div className="space-y-3">
                  {r.data.past.map((p) => (
                    <div key={p.id} className="border-2 border-[#111] bg-white p-3">
                      <div className="flex justify-between font-mono text-xs font-black">
                        <span>round #{p.id}</span>
                        <span>
                          {p.players} player{p.players === 1 ? '' : 's'} · {p.entries} buy{p.entries === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mt-1 font-display text-2xl">{fmtZama(p.pot)} cZAMA</div>
                      <div className="text-xs text-[var(--chm-dim)]">
                        {/^0x0+$/.test(p.winner) ? (
                          'no paid tickets: pot went to the Treasury'
                        ) : (
                          <>
                            won by <Addr a={p.winner} you={account} />
                            {p.relicId ? ` · relic #${p.relicId}` : ''}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

/** A pixel lottery drum. It spins while a transaction is in flight. */
function Drum({ spinning }: { spinning: boolean }) {
  const K = '#111'
  return (
    <svg viewBox="0 0 32 26" shapeRendering="crispEdges" className="w-full" aria-hidden>
      <g style={{ transformOrigin: '16px 11px', animation: spinning ? 'spin 0.8s linear infinite' : undefined }}>
        <rect x={7} y={2} width={18} height={18} fill={K} />
        <rect x={9} y={4} width={14} height={14} fill="#FF8FC7" />
        <rect x={9} y={10} width={14} height={2} fill="#E5341D" />
        <rect x={15} y={4} width={2} height={14} fill="#E5341D" />
        <rect x={11} y={6} width={2} height={1} fill="#FFDD00" />
        <rect x={19} y={14} width={2} height={1} fill="#FFDD00" />
        <rect x={18} y={6} width={1} height={2} fill="#f7f5ee" />
        <rect x={12} y={14} width={1} height={2} fill="#f7f5ee" />
      </g>
      <rect x={4} y={20} width={24} height={3} fill={K} />
      <rect x={5} y={21} width={22} height={1} fill="#FFDD00" />
      <rect x={6} y={11} width={2} height={10} fill={K} />
      <rect x={24} y={11} width={2} height={10} fill={K} />
    </svg>
  )
}
