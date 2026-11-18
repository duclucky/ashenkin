import { StarterGate } from './StarterGate'

const objective = {
  lab: 'Your first embryo is waiting in the lab.',
  breed: 'Bring two specimens to breed an egg.',
  training: 'Train a specimen with XP and cZAMA.',
  quests: 'Check in and claim your daily rewards.',
  arena: 'Bring a specimen NFT to enter the arena.',
  relics: 'Hatch a specimen before opening a cache.',
  raffle: 'Hatch a specimen before entering the raffle.',
  depths: 'Bring a specimen and a lantern into the Depths.',
  oracle: 'Hatch a specimen before consulting the Oracle.',
  expeditions: 'Send a specimen through the gate to earn loot.',
  raid: 'Bring a specimen to join the raid.',
} as const

export function GuestGate({ place }: { place: keyof typeof objective }) {
  return <StarterGate lab={place === 'lab'}>{objective[place]}</StarterGate>
}
