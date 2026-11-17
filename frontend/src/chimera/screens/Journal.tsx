import { Location } from '../game/Location'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Shuffle } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { Label, Panel, TierChip, Button, Link } from '../ui'
import { CHAIN_ID, DEPLOYED, LAB, useWallet } from '../chain'
import { fetchCreature, useAccountStats, useExpeditions, useMyCreatures } from '../hooks'
import { LOCI, TIERS, tierOf, speciesName, rareCount } from '../genetics'
import { useTStats } from '../season'
import { publicValues } from '../fhe'
import { CampaignBoard } from '../game/CampaignBoard'
import { campaignProgress } from '../game/campaign'
import { BeaconChapter } from '../game/BeaconChapter'
import { beaconScope, fieldEvidence } from '../game/beacon'
import { hasPracticed } from '../game/keeper-story'

const CHAPTERS: { title: string; goal: string; text: string[] }[] = [
  {
    title: 'Prologue · The vault wakes',
    goal: 'Always open',
    text: [
      'The Arkhive was built to outlast us, and it did. When the last of the archivists died, the vault kept its promise: no one would ever again read a living genome and bend it to their will.',
      'So it encrypted everything. Every strand, every allele, every spark of what made a creature itself — sealed under a key held by no single hand.',
      'The machines still run. They still breed what is put before them, still mutate, still judge one creature against another. They simply never tell anyone what they saw. You are the first Keeper to answer the vault in a hundred years.',
    ],
  },
  {
    title: 'I · First breath',
    goal: 'Hatch an embryo',
    text: [
      'The egg is warm, and it is unreadable. The vault drew its genes from a randomness it computed in the dark — I could not have chosen them if I tried. Neither could anyone watching the chain.',
      'When it hatched I could see its shape and its colour. That is all the vault allows: the dominant half of each gene. The other half, the one it carries quietly, stays sealed — and so does its element. Only I can unlock that, and only with my own key.',
    ],
  },
  {
    title: 'II · Reading the dark',
    goal: 'Sequence a gene',
    text: [
      'Sequencing costs the lab something every time, and the vault rations it. I chose carefully. One locus, both alleles, readable to me alone.',
      'There it was: a recessive fifteen hiding behind a common crest. Nobody looking at the creature would ever guess. That is the whole game, I think — knowing a little more than everyone else, and paying for every scrap of it.',
    ],
  },
  {
    title: 'III · Blood of two lines',
    goal: 'Breed a second-generation creature',
    text: [
      'The splice happens where no one can see. The vault takes one allele from each parent by a coin it flips in ciphertext, and once in a while it lets something new slip in — a mutation no ancestor carried.',
      'The odds on my screen were only as good as what I had sequenced. Where I knew both parents, I knew the dice. Where I did not, I was guessing like everyone else.',
    ],
  },
  {
    title: 'IV · The Colosseum',
    goal: 'Settle a Colosseum fight',
    text: [
      'Out past the vault walls, things the Arkhive never meant to release still roam. They are born there, wild, from the same sealed randomness — and they fight.',
      'The Colosseum fights in three rounds. Each side seals three moves before the gates open: Strike, Guard or Feint. It adds up what each creature truly is, the element edge, the move that wins the exchange and a roll no one can foresee, all under encryption. Then it tells the world three bits, one per round. That is all anyone will ever know about that fight.',
    ],
  },
  {
    title: 'V · Rare Lineage',
    goal: 'Verify a rare lineage',
    text: [
      'Five rare traits in one body. The vault had never produced one — or if it had, no one could prove it.',
      'I asked the network to decrypt its looks and sign the result. The contract checked the signatures, counted the rare traits, and wrote it down. The Arkhive has its first verified rare lineage.',
    ],
  },
]

export default function Journal() {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const stats = useAccountStats(account)
  const tactics = useTStats(account)
  const expeditions = useExpeditions(account)
  const all = useQuery({
    queryKey: ['journal', account, mine.data?.join()],
    queryFn: () => Promise.all(mine.data!.map(fetchCreature)),
    enabled: DEPLOYED && !!mine.data?.length,
  })
  const cs = all.data ?? []
  const children = cs.filter(creature => creature.info.generation >= 1 && creature.info.parentA > 0 && creature.info.parentB > 0)
  const crests = useQuery({
    queryKey: ['campaign-crests', account, children.map(creature => `${creature.id}:${creature.pheno[4]}`).join()],
    queryFn: async () => {
      const values = await publicValues(children.map(creature => creature.pheno[4]))
      return Object.fromEntries(children.map(creature => [creature.id, Number(values[creature.pheno[4].toLowerCase()])]))
    },
    enabled: !!account && children.length > 0,
    staleTime: Infinity,
    retry: 2,
  })
  const campaign = campaignProgress({ account, specimens: mine.data?.length === 0 ? [] : all.isSuccess ? cs : undefined, settledFights: tactics.data ? tactics.data.wins + tactics.data.losses : undefined, crests: crests.data })
  const scope = beaconScope(CHAIN_ID, LAB, account)
  const genome = campaign.own.done === null ? null : cs.some(c => c.owner.toLowerCase() === account?.toLowerCase() && c.info.sequencedMask > 0)
  const unlocked = [
    true,
    (stats.data?.genesis ?? 0) > 0 || cs.length > 0,
    cs.some((c) => c.info.sequencedMask > 0),
    cs.some((c) => c.info.generation >= 1),
    (tactics.data?.wins ?? 0) + (tactics.data?.losses ?? 0) > 0 || (stats.data?.wins ?? 0) > 0 || (stats.data?.captures ?? 0) > 0,
    cs.some((c) => c.info.chimera),
  ]
  const [open, setOpen] = useState(0)

  return (
    <div className="space-y-5">
      <Location place="journal" actions={<Link to="lore" className="chm-btn chm-btn-ghost">Explore the Arkhive</Link>}>{account && <span>{unlocked.filter(Boolean).length}/{CHAPTERS.length} entries unlocked</span>}</Location>

      <BeaconChapter key={scope} scope={scope} guestScope={beaconScope(CHAIN_ID, LAB)} evidence={{ fight: campaign.fight.done, practiced: hasPracticed(), genome, field: fieldEvidence(expeditions.data?.list) }} specimen={campaign.own.specimen} connected={!!account} />
      <details className="chm-panel p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Bloodline campaign</summary><div className="mt-4"><CampaignBoard connected={!!account} progress={campaign} /></div></details>
      {(mine.isError || all.isError || tactics.isError || crests.isError || expeditions.isError) && <Panel className="p-4 text-sm"><p>Some campaign evidence could not be read. Unconfirmed objectives remain open for verification.</p><Button variant="ghost" onClick={() => { mine.refetch(); tactics.refetch(); expeditions.refetch(); if (mine.data?.length) all.refetch(); if (children.length) crests.refetch() }}>Retry campaign record</Button></Panel>}

      <details className="chm-panel p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Read the unlocked chronicle</summary><div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-1">
          {CHAPTERS.map((c, i) => (
            <button key={c.title} onClick={() => unlocked[i] && setOpen(i)} className={`flex w-full items-center justify-between border-2 px-3 py-2.5 text-left text-sm font-bold transition ${open === i ? 'border-[#111] bg-[var(--chm-yellow)] text-[#111] shadow-[3px_3px_0_#111]' : unlocked[i] ? 'border-transparent text-[var(--chm-ink)] hover:border-[#111] hover:bg-white' : 'cursor-not-allowed border-transparent text-[#999]'}`}>
              <span>{c.title}</span>
              {!unlocked[i] && <Lock className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <Panel className="p-8">
          {unlocked[open] ? (
            <article className="max-w-2xl">
              <Label>{CHAPTERS[open].goal}</Label>
              <h2 className="mt-2 font-display text-4xl">{CHAPTERS[open].title}</h2>
              {CHAPTERS[open].text.map((p, i) => (
                <p key={i} className="mt-4 font-mono text-[17px] leading-relaxed text-[#222]">
                  {p}
                </p>
              ))}
            </article>
          ) : null}
        </Panel>
      </div></details>

      <details className="chm-panel p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Open the specimen atlas</summary><div className="mt-4"><Atlas /></div></details>
    </div>
  )
}

/** Interactive guide: drag a trait and watch the creature change. Purely illustrative. */
function Atlas() {
  const [traits, setTraits] = useState([6, 9, 12, 4, 13, 10, 8])
  const [seed, setSeed] = useState(3)
  const rc = rareCount(traits)
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div><span className="chm-tag chm-tag-white">Specimen atlas</span></div>
          <h2 className="mt-4 font-display text-4xl">What each gene draws</h2>
          <p className="mt-1 text-sm text-[var(--chm-dim)]">An illustration tool. Move a trait to see how it is expressed. Values 0–7 are common, 8–11 uncommon, 12–14 rare and 15 is mythic.</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setTraits(traits.map(() => Math.floor(Math.random() * 16)))
            setSeed(Math.floor(Math.random() * 1000))
          }}
        >
          <Shuffle className="h-4 w-4" /> Random genome
        </Button>
      </div>
      <Panel className="grid min-w-0 grid-cols-1 gap-8 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col items-center justify-center">
          <CreatureArt traits={traits} seed={seed} size={340} className="h-auto w-full max-w-[340px]" />
          <div className="font-display text-3xl">{speciesName(traits)}</div>
          <div className="mt-1 font-mono text-xs" style={{ color: rc >= 5 ? TIERS[3].ink : 'var(--chm-dim)' }}>
            {rc} of 7 rare {rc >= 5 ? '· qualifies for rare lineage' : ''}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {LOCI.slice(0, 7).map((l, i) => (
            <div key={l.key}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {l.name} <span className="text-[var(--chm-dim)]">· {l.blurb}</span>
                </span>
                <span className="flex items-center gap-2 font-mono">
                  <TierChip v={traits[i]} />
                  <span className="w-5 text-right font-bold" style={{ color: TIERS[tierOf(traits[i])].ink }}>
                    {traits[i]}
                  </span>
                </span>
              </div>
              <input
                type="range"
                aria-label={`${l.name} illustration`}
                min={0}
                max={15}
                value={traits[i]}
                onChange={(e) => setTraits(traits.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                className="mt-1 w-full"
                style={{ accentColor: TIERS[tierOf(traits[i])].color }}
              />
            </div>
          ))}
        </div>
      </Panel>
    </section>
  )
}
