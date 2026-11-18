import { useId, useState } from 'react'
import { Flame } from 'lucide-react'
import { Button } from '../ui'
import { LIVING_ITEMS, livingCraftRecipes, type LivingState } from './living-world'

type Props = {
  data: LivingState
  busy: boolean
  crafting: boolean
  onCraft: (recipe: string) => void
}
export default function LivingCraft({ data, busy, crafting, onCraft }: Props) {
  const group = useId()
  const [pick, setPick] = useState('')
  const recipes = livingCraftRecipes(data.inventory, data.crafting)
  const selected = recipes.find(r => r.id === pick) ?? recipes.find(r => r.ready) ?? recipes[0]
  if (data.inventory.some(i => i.item === 3 && i.quantity > 0) || !selected) return null
  const missing = selected.cost.filter(c => c.missing > 0)
  return <section className="living-craft" aria-labelledby={`${group}-title`}>
    <div className="living-craft-heading">
      <Flame size={20} aria-hidden="true" />
      <div><h3 id={`${group}-title`}>A light for the road</h3><p>Your first Trail lantern · cosmetic</p></div>
    </div>
    <fieldset className="living-recipes" disabled={busy}>
      <legend>Choose your materials</legend>
      {recipes.map(recipe => <label key={recipe.id} className={`living-recipe ${selected.id === recipe.id ? 'living-recipe-selected' : ''}`}>
        <input type="radio" name={group} value={recipe.id} checked={selected.id === recipe.id} onChange={() => setPick(recipe.id)} />
        <span className="living-recipe-cost">
          {recipe.cost.map(cost => <span key={cost.item}>
            <span><b>{Math.min(cost.have, cost.quantity)} / {cost.quantity}</b> {LIVING_ITEMS[cost.item]?.name}</span>
            <progress aria-label={LIVING_ITEMS[cost.item]?.name} max={cost.quantity} value={Math.min(cost.have, cost.quantity)} />
          </span>)}
        </span>
        {recipe.ready && <span className="living-recipe-ready">Ready</span>}
      </label>)}
    </fieldset>
    <p className="living-craft-progress" role="status">{selected.ready ? 'Ready to craft. No gas or signature.' : `${missing.map(c => `${c.missing} ${LIVING_ITEMS[c.item]?.name}`).join(' + ')} to go. Materials come from daily victories.`}</p>
    <Button variant="primary" busy={crafting} disabled={busy || !selected.ready} onClick={() => onCraft(selected.id)}>Craft Trail lantern</Button>
  </section>
}
