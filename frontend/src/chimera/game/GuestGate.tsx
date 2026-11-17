import { useState } from 'react'
import { connect, errorText, GAS_FAUCET } from '../chain'
import { Button, toast } from '../ui'
import { Px } from './art'
import { PROF, PROF_PAL } from './map-art'
import { hasPracticed, keeperGuideEnabled } from './keeper-story'

const objective = {
  lab: 'Your first embryo is waiting in the lab.',
  breed: 'Bring two specimens to breed an egg.',
  training: 'Train a specimen with XP and cZAMA.',
  quests: 'Check in and claim your daily rewards.',
  arena: 'Connect a wallet to enter an on-chain match.',
  relics: 'Connect a wallet to open a cache.',
  raffle: 'Connect a wallet to buy tickets or finish the draw.',
  depths: 'Bring a specimen and a lantern into the Depths.',
  oracle: 'Connect a wallet to submit a guess and read your hints.',
  expeditions: 'Send a specimen through the gate to earn loot.',
  raid: 'Connect a wallet and bring a specimen to join the raid.',
} as const

export function GuestGate({ place }: { place: keyof typeof objective }) {
  const [busy, setBusy] = useState(false)
  const followStarter = place === 'lab' && hasPracticed() && keeperGuideEnabled()

  async function enter() {
    setBusy(true)
    try {
      await connect()
    } catch (error) {
      toast({ kind: 'err', title: 'Could not connect', detail: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chm-briefing chm-guest">
      <div className="chm-lumen-portrait" aria-hidden="true"><Px rows={PROF} pal={PROF_PAL} /></div>
      <p className="chm-guest-copy"><span>Professor Lumen</span>{objective[place]}</p>
      <div className="chm-guest-actions">
        <Button busy={busy} className={followStarter ? 'chm-quest-target' : ''} onClick={enter}>Connect wallet</Button>
        {place === 'lab' && <a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-bold underline">Get Sepolia ETH</a>}
      </div>
    </div>
  )
}
