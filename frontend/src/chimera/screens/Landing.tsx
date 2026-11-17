import CreatureArt from '../CreatureArt'
import { DEPLOYED } from '../chain'
import { Location, LocationNotes } from '../game/Location'
import { Link } from '../ui'

const specimens = [
  { traits: [3, 2, 5, 1, 2, 3, 1], seed: 11, label: 'Common' },
  { traits: [9, 10, 10, 8, 9, 6, 9], seed: 23, label: 'Uncommon' },
  { traits: [14, 12, 12, 14, 13, 15, 13], seed: 7, label: 'Rare' },
]

export default function Landing() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <Location place="about" actions={<Link to={DEPLOYED ? 'map' : 'journal'} className="chm-btn chm-btn-primary">{DEPLOYED ? 'Enter the Arkhive' : 'Open the journal'}</Link>} />
      <section aria-labelledby="archive-specimens" className="chm-panel p-4 sm:p-5">
        <h2 id="archive-specimens" className="font-display text-xl">Archived Xenos</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
          {specimens.map(({ traits, seed, label }) => (
            <figure key={seed} className="chm-practice-ring grid min-w-0 place-items-center border-2 border-[#111] p-2">
              <CreatureArt traits={traits} seed={seed} size={168} className="h-auto max-w-full" />
              <figcaption className="bg-[#111] px-2 py-1 text-xs font-bold text-white">{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <LocationNotes title="About Ashenkin">
        <p>Hatch, breed and battle Xenos on Sepolia. Zama FHEVM keeps recessive alleles, combat plans and cZAMA balances encrypted. In the Colosseum, the contract verifies a proof for the three round results.</p>
        <Link to="fairness" className="mt-2 inline-flex min-h-11 items-center font-bold underline">Open Proof Center</Link>
      </LocationNotes>
    </div>
  )
}
