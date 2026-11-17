import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { CHIMERA_CSS } from '../../src/chimera/styles'
import { LineageNotice, DailyBudgetNotice } from '../../src/chimera/game/EconomyPolicy'
import { breedingAccess, type LineageRules } from '../../src/chimera/game/economy-rules'

const base = { version: 2 as const, charges: 0n, introUsed: false, population: 17n, limit: 10_000n, altarReady: true }
const cases: Record<string, Extract<LineageRules, { version: 2 }>> = {
  Intro: base,
  'Needs charge': { ...base, introUsed: true },
  'After offering': { ...base, introUsed: true, charges: 1n, population: 16n },
  'Population full': { ...base, introUsed: true, charges: 1n, population: 10_000n },
}
function Preview() {
  const [selected, select] = useState('Intro')
  const rules = cases[selected], access = breedingAccess(rules)
  return <div className="chm-root">
    <style>{CHIMERA_CSS}</style>
    <header className="border-b-2 border-[#111] bg-[var(--chm-yellow)] p-4 font-bold">Economy v2 · Local preview</header>
    <main className="space-y-4 overflow-auto p-4">
      <p className="text-sm">UI fixtures only. No wallet or transactions. New rules are not deployed to Sepolia.</p>
      <div role="group" aria-label="Preview scenario" className="flex flex-wrap gap-2">{Object.keys(cases).map(name => <button className="chm-btn chm-btn-ghost" key={name} aria-pressed={selected === name} onClick={() => select(name)}>{name}</button>)}</div>
      <h1 className="font-display text-2xl">Keep the parents. Renew the lineage.</h1>
      <LineageNotice rules={rules} blocker={access.blocker} trainingId={30} />
      <output className="block border-2 border-[#111] bg-white p-3 font-bold">{access.blocker ?? `Ready · 16 cZAMA${access.charge ? ' + 1 charge' : ' · introductory egg'}`}</output>
      <DailyBudgetNotice current opening={3_000_000_000n} remaining={2_200_000_000n} />
      <p className="text-sm">One offering leaves circulation permanently. One later egg consumes its charge. Parents remain; each spends one breeding slot.</p>
    </main>
  </div>
}
createRoot(document.getElementById('root')!).render(<Preview />)
