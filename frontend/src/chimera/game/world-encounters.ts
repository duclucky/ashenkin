const BOSS_NAMES = ['Cinder Tyrant', 'Rot Mother', 'Abyss Warden']

export function bossTraits(level: number, element: number) {
  return [12 + (level % 4), (level * 5) % 16, [11, 8, 14][element], 9 + (level % 7), 13 + (level % 3), 10 + (level % 6), 15]
}

export const bossName = ({ level, element }: { level: number; element: number }) => `${BOSS_NAMES[element]} · Lv ${level}`

export const ZONE_META = [
  { name: 'Ashen Dunes', tier: 'Easy', blurb: 'Glass-sand flats where cinder beetles nest.', sky: '#dcc08b', ground: '#a57c57', deep: '#7a5c4a' },
  { name: 'Spore Hollows', tier: 'Medium', blurb: 'A breathing forest of fungus. Spores muddle the weak; strong lines find caches.', sky: '#bbd1ba', ground: '#638976', deep: '#3d5e51' },
  { name: 'Abyssal Trench', tier: 'Hard', blurb: 'Pressure-black water and drowned relics. Only the toughest come back rich.', sky: '#93b7bc', ground: '#4a7680', deep: '#2c4c5b' },
] as const
