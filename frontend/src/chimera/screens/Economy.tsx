import { Location, LocationNotes } from '../game/Location'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, RefreshCw, ExternalLink, Droplets, HeartHandshake, Store, Swords, Landmark, Skull, Map as MapIcon, CalendarCheck, Dumbbell, Gem, Eye, Activity, Flame, Crown, Ticket } from 'lucide-react'
import { Button, Empty, Label, Link, Panel, useAction } from '../ui'
import { CZAMA, DEPLOYED, RAID, TREASURY, ZAMA_MOCK, addrUrl, short, useWallet } from '../chain'
import { useBalance, useEconomy, useRefresh, useZones, useNow, fmtZama, BREED_FEES, trainFee, xpToNext } from '../hooks'
import { CACHE_PRICE, FUSE_PRICE, GUESS_PRICE, useOracle, useRelicWorld, useTBattles } from '../season'
import { publishPot, publishReserve } from '../actions'
import { useLineageEconomy, useRewardBudget } from '../economy'
import { DailyBudgetNotice } from '../game/EconomyPolicy'

export default function Economy() {
  const eco = useEconomy()
  const relics = useRelicWorld()
  const oracle = useOracle()
  const fights = useTBattles(1)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  if (!DEPLOYED) return <Empty title="The economy opens once the contracts are live" />
  const d = eco.data

  return (
    <div className="space-y-10">
      <Location place="economy" />
      <Circulation />
      <KeeperBudget />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <LocationNotes title="cZAMA contracts">
          <ul className="space-y-2">
            <li><a className="inline-flex gap-1 underline" href={addrUrl(CZAMA)} target="_blank" rel="noreferrer">cZAMA {short(CZAMA)} <ExternalLink className="h-3 w-3" /></a></li>
            <li><a className="inline-flex gap-1 underline" href={addrUrl(ZAMA_MOCK)} target="_blank" rel="noreferrer">Test ZAMA {short(ZAMA_MOCK)} <ExternalLink className="h-3 w-3" /></a></li>
            <li><a className="inline-flex gap-1 underline" href="https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia" target="_blank" rel="noreferrer">Zama registry <ExternalLink className="h-3 w-3" /></a></li>
          </ul>
        </LocationNotes>
        <Panel className="grid grid-cols-2 gap-px !bg-[#111] !p-0">
          <Live k="Treasury reserve" v={eco.reserve != null ? fmtZama(eco.reserve) : eco.reserveLoading ? '…' : '—'} unit="cZAMA" bg="#3DDC97" />
          <Live k="World Boss pot" v={eco.pot != null ? fmtZama(eco.pot) : eco.potLoading ? '…' : '—'} unit="cZAMA" bg="#FFDD00" />
          <Live k="Breeding fees paid" v={d ? fmtZama(d.fees) : '…'} unit="cZAMA" bg="#fff" />
          <Live k="Market volume" v={d ? fmtZama(d.volume) : '…'} unit="cZAMA" bg="#fff" />
          <Live k="Expeditions run" v={d ? d.expeditions.toLocaleString() : '…'} bg="#fff" />
          <Live k="Boss strikes" v={d ? `${d.strikes.toLocaleString()} · Lv ${d.level}` : '…'} bg="#fff" />
          <Live k="Training fees paid" v={d ? fmtZama(d.trainFees) : '…'} unit="cZAMA" bg="#fff" />
          <Live k="Levels trained" v={d ? `${d.levels.toLocaleString()} · ${d.xp.toLocaleString()} XP` : '…'} bg="#fff" />
          <Live k="Oracle jackpot" v={oracle.data?.pot != null ? fmtZama(oracle.data.pot) : oracle.isLoading ? '…' : '—'} unit="cZAMA" bg="#E9D9FF" />
          <Live k="Relic caches opened" v={relics.data ? `${relics.data.opened.toLocaleString()} · ${relics.data.fusions} fused` : '…'} bg="#E9D9FF" />
          <Live k="Colosseum fights" v={fights.data ? (fights.data[0]?.id ?? 0).toLocaleString() : '…'} bg="#fff" />
          <Live k="Riddle guesses" v={oracle.data ? oracle.data.total.toLocaleString() : '…'} bg="#fff" />
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 bg-[var(--chm-gray)] px-4 py-3 text-xs text-[var(--chm-dim)]">
            <span>Totals are published on demand: the contracts make a fresh ciphertext publicly decryptable.</span>
            <div className="flex gap-2">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" busy={busy === 'Reserve'} onClick={async () => { await run('Reserve', (s) => publishReserve(s), 'Reserve published'); refresh('economy', 'pub') }}>
                <RefreshCw className="h-3 w-3" /> Reserve
              </Button>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" busy={busy === 'Pot'} onClick={async () => { await run('Pot', (s) => publishPot(s), 'Pot published'); refresh('economy', 'pub', 'raid') }}>
                <RefreshCw className="h-3 w-3" /> Pot
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <LocationNotes title="Three separate resources">
        <p><b>Sepolia ETH:</b> blockchain gas. The dedicated daily faucet offers 0.002 ETH per account every 24 hours while funded. Living trials use the game’s separate sponsor budget.</p>
        <p><b>Test cZAMA:</b> confidential game currency for fees and funded reward pools. The Wishing Well’s test supply is not revenue or a promise of cash earnings.</p>
        <p><b>Living items:</b> materials and cosmetic lanterns in each NFT’s server-side bag. A verified victory awards loot. Its first lantern costs 3 Ash thread, or 1 Ash thread + 1 Archive fragment. There is no gas or combat bonus for crafting it.</p>
      </LocationNotes>

      {/* flow diagram */}
      <div>
        <Label className="mb-4">Where every cZAMA goes</Label>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1.2fr_auto_1fr] lg:items-stretch">
          <Column title="1 · In" color="#fff">
            <Node icon={<Droplets className="h-4 w-4" />} t="Testnet supplies" d="The Wishing Well wraps mock tokens into cZAMA. It supplies Sepolia test wallets." />
          </Column>
          <Arrow />
          <Column title="2 · Spend & circulate" color="#fff">
            <Node icon={<HeartHandshake className="h-4 w-4" />} t="Breeding fee" d={`${BREED_FEES[0]}–${BREED_FEES[6]} cZAMA per parent, rising with each breed (max 7).`} tags={[['60% → Boss', '#FFDD00'], ['40% → Treasury', '#3DDC97']]} />
            <Node icon={<Dumbbell className="h-4 w-4" />} t="Training fee" d="3 cZAMA for LV 1, +2 per level, up to 21 cZAMA for LV 10." tags={[['60% → Boss', '#FFDD00'], ['40% → Treasury', '#3DDC97']]} />
            <Node icon={<Store className="h-4 w-4" />} t="Market fee" d="5% of every sale. The seller keeps 95%." tags={[['5% → Boss', '#FFDD00']]} />
            <Node icon={<Swords className="h-4 w-4" />} t="Duel rake" d="Each side risks the smaller of the two sealed stakes. The winner receives the matched pot after the 5% fee." tags={[['5% → Boss', '#FFDD00']]} />
            <Node icon={<Gem className="h-4 w-4" />} t="Relic cache · fusion" d={`${CACHE_PRICE} cZAMA per cache, ${FUSE_PRICE} per fusion. The fee enters the shared game pools.`} tags={[['60% → Boss', '#FFDD00'], ['40% → Treasury', '#3DDC97']]} />
            <Node icon={<Eye className="h-4 w-4" />} t="Riddle guess" d={`${GUESS_PRICE} cZAMA per guess, 6 a day. All of it goes into the jackpot.`} tags={[['100% → Jackpot', '#E9D9FF']]} />
            <Node icon={<Flame className="h-4 w-4" />} t="Ascension" d="Voluntarily lock a spare creature in the altar forever. Hero XP remains subject to the daily cap. This removes the offering from circulation; its NFT history remains on-chain." tags={[['Permanently retired', '#FFD209']]} />
            <Node icon={<Ticket className="h-4 w-4" />} t="Raffle ticket" d="1 cZAMA per sealed ticket. Ticket counts and the pot stay encrypted until the draw." tags={[['90% → Winner', '#FF8FC7'], ['10% → Treasury', '#3DDC97']]} />
            <Node icon={<Skull className="h-4 w-4" />} t="Depths toll" d="2 cZAMA per dive into the Arkhive Depths, 3 dives a day." tags={[['100% → Treasury', '#3DDC97']]} />
          </Column>
          <Arrow />
          <Column title="3 · Earn (faucets)" color="#fff">
            <Node icon={<Landmark className="h-4 w-4" />} t="Treasury" d="Seeded with 300,000 cZAMA, refilled by breeding and training." tags={[['Expedition loot', '#5AC8FA'], ['Quest rewards', '#FF8FC7']]} dark />
            <Node icon={<Skull className="h-4 w-4" />} t="World Boss pot" d="Receives a share of breeding, training, relic, duel and market fees. Paid out when the boss falls." tags={[['25% killer', '#FFDD00'], ['50% raiders', '#3DDC97'], ['25% rolls over', '#FF8FC7']]} dark />
            <Node icon={<Eye className="h-4 w-4" />} t="Oracle jackpot" d="Paid in full to the first keeper who proves a perfect guess, plus a free relic. Unsolved? It rolls over." tags={[['Winner takes all', '#E9D9FF']]} dark />
            <Node icon={<Crown className="h-4 w-4" />} t="Season thrones" d="Every 14 days the three throne holders request prizes from the Treasury, plus a Relic Cache each. Actual transfers depend on available funding." tags={[['Targets: 2,000 / 1,000 / 500', '#FFDD00']]} dark />
            <Node icon={<Ticket className="h-4 w-4" />} t="Raffle pot" d="Every few days one sealed ticket wins 90% of the pot plus a relic cache. Nobody can see the odds while it sells." tags={[['One winner', '#FF8FC7']]} dark />
            <Node icon={<Skull className="h-4 w-4" />} t="Depths loot" d="The Treasury pays whatever is in your sealed sack when you climb out: 0.2 to 15 cZAMA per floor. Die down there and it pays 0." tags={[['Encrypted payout', '#B66DFF']]} dark />
          </Column>
        </div>
      </div>

      <Health reserve={eco.reserve} />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Rule icon={<Dumbbell className="h-5 w-5" />} t="Training" color="#3DDC97">
          XP from expeditions (10/25/50), boss strikes (12) and Colosseum fights (15 win, 8 loss, 6 for a defender who holds). Capped at 120 XP per creature per day, so progress depends on earned XP and the daily cap. Each level adds a hidden 2–5 power.
        </Rule>
        <Rule icon={<MapIcon className="h-5 w-5" />} t="Expeditions" color="#5AC8FA">
          3–7, 8–16 or 20–53 cZAMA on success, a small consolation on failure. 6 runs a day. The outcome is sealed until the creature returns.
        </Rule>
        <Rule icon={<CalendarCheck className="h-5 w-5" />} t="Daily quests" color="#FF8FC7">
          1 cZAMA per check-in, 2 per task, 10 for the chest. A streak adds +10% per day, up to 2×.
        </Rule>
        <Rule icon={<Skull className="h-5 w-5" />} t="World Boss" color="#FFDD00">
          Hidden HP, hidden damage. One strike per creature every 2 hours. Each new boss has +500 HP and inherits 25% of the last pot.
        </Rule>
      </div>

      <Panel className="p-6">
        <Label>Why confidential matters here</Label>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
          <p><b>Private purse.</b> Only your wallet can decrypt its cZAMA balance. The public market listing shows its asking price.</p>
          <p><b>Blind stake matching.</b> The contract computes the smaller stake and refunds any excess on encrypted amounts.</p>
          <p><b>Still auditable.</b> Fee totals are public, and the Treasury and pot can be published by anyone at any time with a KMS-signed decryption.</p>
        </div>
        <div className="mt-4 font-mono text-xs text-[var(--chm-dim)]">
          Treasury <a className="underline" href={addrUrl(TREASURY)} target="_blank" rel="noreferrer">{short(TREASURY)}</a> · Raid <a className="underline" href={addrUrl(RAID)} target="_blank" rel="noreferrer">{short(RAID)}</a>
        </div>
      </Panel>
    </div>
  )
}

function KeeperBudget() {
  const { account } = useWallet()
  const balance = useBalance(account)
  return (
    <section className="chm-panel p-4 sm:p-6" aria-labelledby="keeper-budget">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="keeper-budget" className="font-display text-2xl">Your next upgrade</h2>
        {account && <span className="font-mono text-sm font-bold">Purse · {balance.value != null ? `${fmtZama(balance.value)} cZAMA` : balance.error ? 'unavailable' : balance.keyReady ? 'reading…' : 'sealed'}</span>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <BudgetChoice route="expeditions" title="Earn supplies" color="#b8f5d8">
          A wild hunt grants XP without a cZAMA entry fee. An expedition also earns XP and a private payout from the Treasury.
        </BudgetChoice>
        <BudgetChoice route="training" title="Train your champion" color="#ffcf85">
          Level 1 costs {xpToNext(0)} XP and {trainFee(0)} cZAMA. Training adds private power that counts in every Colosseum round.
        </BudgetChoice>
        <BudgetChoice route="breed" title="Start a new line" color="#f4d9ff">
          Two first-time parents cost {BREED_FEES[0] * 2} cZAMA. Sequence a gene first to learn what a parent can pass down.
        </BudgetChoice>
      </div>
    </section>
  )
}

function Circulation() {
  const { account } = useWallet()
  const lineage = useLineageEconomy(account)
  return <Panel className="p-4">
    <div className="flex items-center gap-2 font-display text-xl"><Flame size={20} /> The lineage cycle</div>
    <div className="my-4 flex items-center justify-around gap-2 text-center text-xs font-bold">
      <span><Swords className="mx-auto mb-1" />Play</span><ArrowRight size={16} />
      <span><HeartHandshake className="mx-auto mb-1" />Breed</span><ArrowRight size={16} />
      <span><Flame className="mx-auto mb-1" />Offer a spare</span>
    </div>
    {lineage.isError ? <p role="alert">Could not verify this world’s lineage rules.</p> : lineage.data?.version === 2 ? <>
      <p className="text-sm">Keep both parents. After one introductory egg, each new egg needs a lineage charge from one permanent, voluntary offering. Unpaid eggs return the charge.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-y-2 border-[#111] py-3 font-mono text-xs">
        <span>Population<br /><b>{lineage.data.population.toString()} / {lineage.data.limit.toString()}</b></span>
        <span>Your charges<br /><b>{account ? lineage.data.charges.toString() : 'Sign in'}</b></span>
      </div>
    </> : lineage.data ? <p className="text-sm">This world uses breeding fees, cooldowns and seven slots per parent. Parents survive. Ascension permanently retires spare creatures for hero XP; lineage charges are not active here.</p> : <p className="text-sm" role="status">Reading this world’s rules…</p>}
    <p className="mt-3 text-xs text-[var(--chm-dim)]">cZAMA fees circulate into reward pools. They are not token burns. The Sepolia Wishing Well supplies test tokens, not earned game revenue.</p>
  </Panel>
}

function BudgetChoice({ route, title, color, children }: { route: string; title: string; color: string; children: ReactNode }) {
  return (
    <Link to={route} className="block border-[3px] border-[#111] bg-[var(--chm-gray)] hover:shadow-[3px_3px_0_#111]">
      <span className="flex items-center justify-between gap-2 border-b-2 border-[#111] px-3 py-2 font-bold" style={{ background: color }}>{title}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
      <span className="block px-3 py-3 text-sm leading-relaxed">{children}</span>
    </Link>
  )
}

const SEED = 300_000n * 1_000_000n
const TIERS = [
  { min: 50, factor: '1×', label: 'Healthy', color: '#3DDC97', text: 'Full loot tables.' },
  { min: 25, factor: '¾×', label: 'Tight', color: '#FFDD00', text: 'Expedition loot shrinks to about three quarters.' },
  { min: 0, factor: '½×', label: 'Drained', color: '#FF7020', text: 'Expedition loot is halved until fees refill the Treasury.' },
]

/** Treasury health: the reserve against its seed, and the public rule that scales expedition loot. */
function Health({ reserve }: { reserve?: bigint | null }) {
  const zones = useZones()
  const budget = useRewardBudget()
  const now = useNow(1000)
  const current = budget.data?.version === 2 && budget.data.day === Math.floor(now / 86400)
  const pct = reserve != null ? Number((reserve * 1000n) / SEED) / 10 : null
  const tier = pct == null ? null : TIERS.find((t) => pct >= t.min)!
  const NAMES = ['Ashen Dunes', 'Spore Hollows', 'Abyssal Trench']
  return (
    <Panel className="grid gap-6 p-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <Label>
          <Activity className="mr-1 inline h-3.5 w-3.5" /> Treasury health
        </Label>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display text-5xl">{pct == null ? '…' : `${pct.toFixed(1)}%`}</span>
          <span className="font-mono text-sm text-[var(--chm-dim)]">of the 300,000 cZAMA seed</span>
          {tier && (
            <span className="border-2 border-[#111] px-1.5 font-mono text-[11px] font-black" style={{ background: tier.color }}>
              {tier.label.toUpperCase()} · TARGET {tier.factor}
            </span>
          )}
        </div>
        <div className="relative mt-4 h-6 border-[3px] border-[#111] bg-white">
          <div className="absolute inset-y-0 left-0 bg-[#FF7020]" style={{ width: '25%' }} />
          <div className="absolute inset-y-0 left-[25%] bg-[var(--chm-yellow)]" style={{ width: '25%' }} />
          <div className="absolute inset-y-0 left-[50%] bg-[#3DDC97]" style={{ width: '50%' }} />
          {pct != null && <div className="absolute -top-2 bottom-[-8px] w-[4px] bg-[#111]" style={{ left: `calc(${Math.min(100, pct)}% - 2px)` }} />}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--chm-dim)]">
          <span>0</span>
          <span>25%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        <p className="mt-4 text-sm text-[var(--chm-dim)]">The reserve is a published snapshot, not a promise of future rewards.</p>
        {budget.isError ? <p role="alert">Could not verify the reward budget.</p> : budget.data?.version === 2 ? <DailyBudgetNotice current={current} opening={budget.opening} remaining={budget.remaining} reserve={reserve} failed={budget.valuesError} /> : budget.data ? <p className="mt-3 text-sm">This world has no automatic daily Treasury budget. Loot tables are configured manually. The reserve tiers below are planning targets.</p> : <p role="status">Reading reward policy…</p>}
      </div>
      <div className="space-y-3">
        {TIERS.map((t) => (
          <div key={t.label} className={`flex items-center gap-3 border-[3px] border-[#111] p-2.5 text-sm ${tier?.label === t.label ? 'shadow-[4px_4px_0_#111]' : 'opacity-60'}`} style={{ background: tier?.label === t.label ? t.color : '#fff' }}>
            <span className="w-16 font-mono text-xs font-black">{t.min === 50 ? '≥ 50%' : t.min === 25 ? '25–50%' : '< 25%'}</span>
            <span className="font-bold">Loot {t.factor}</span>
            <span className="text-[var(--chm-dim)]">{t.text}</span>
          </div>
        ))}
        <div className="border-t-2 border-dashed border-[#111] pt-3">
          <div className="font-mono text-[10px] font-black uppercase tracking-widest">Live loot tables (onchain)</div>
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {(zones.data ?? []).map((z) => (
              <li key={z.id} className="flex justify-between">
                <span>{NAMES[z.id]}</span>
                <span>
                  {fmtZama(z.lootBase)}–{fmtZama(z.lootBase + z.lootRoll - 1n)} · fail {fmtZama(z.consolation)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

function Live({ k, v, unit, bg }: { k: string; v: string; unit?: string; bg: string }) {
  return (
    <div className="px-4 py-4" style={{ background: bg }}>
      <Label>{k}</Label>
      <div className="mt-1 font-display text-2xl text-[#111]">
        {v} {unit && <span className="font-mono text-xs">{unit}</span>}
      </div>
    </div>
  )
}

function Column({ title, children, color }: { title: string; children: ReactNode; color: string }) {
  return (
    <div className="border-[3px] border-[#111] p-3 shadow-[6px_6px_0_#111]" style={{ background: color }}>
      <div className="mb-3 bg-[#111] px-2 py-1 font-mono text-xs font-bold uppercase text-[var(--chm-yellow)]">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Node({ icon, t, d, tags = [], dark }: { icon: ReactNode; t: string; d: string; tags?: [string, string][]; dark?: boolean }) {
  return (
    <div className={`border-[3px] border-[#111] p-3 ${dark ? 'bg-[#111] text-white' : 'bg-[var(--chm-gray)]'}`}>
      <div className="flex items-center gap-2 font-display text-lg">
        {icon} {t}
      </div>
      <p className={`mt-1 text-sm ${dark ? 'text-[#d9d6cc]' : 'text-[var(--chm-dim)]'}`}>{d}</p>
      {!!tags.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map(([x, c]) => (
            <span key={x} className="border-2 border-[#111] px-1.5 py-px font-mono text-[11px] font-bold text-[#111]" style={{ background: c }}>
              {x}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex items-center justify-center py-1">
      <ArrowRight className="hidden h-8 w-8 lg:block" strokeWidth={3} />
      <ArrowDown className="h-8 w-8 lg:hidden" strokeWidth={3} />
    </div>
  )
}

function Rule({ icon, t, color, children }: { icon: ReactNode; t: string; color: string; children: ReactNode }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2">
        <span className="border-[3px] border-[#111] p-1.5" style={{ background: color }}>
          {icon}
        </span>
        <span className="font-display text-xl">{t}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--chm-dim)]">{children}</p>
    </Panel>
  )
}
