import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Footprints, Mountain, Route, Undo2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Button } from '../ui'
import { Px } from './art'
import { SABLE, SABLE_PAL } from './map-art'

type Trail = 'tracks' | 'stones'
type Passage = 'road' | 'ridge'

export function BeaconScout({ onFound }: { onFound: () => void }) {
  const [trail, setTrail] = useState<Trail>()
  const [result, setResult] = useState<'searching' | 'lost' | 'offline'>()
  const request = useRef<AbortController>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function scout(passage: Passage) {
    if (!trail || request.current) return
    const controller = new AbortController()
    request.current = controller
    setResult('searching')
    try {
      const response = await fetch(api('beacon/scout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: [trail, passage] }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Scout request failed')
      const { found } = await response.json()
      if (controller.signal.aborted) return
      if (found === true) onFound()
      else setResult('lost')
    } catch {
      if (!controller.signal.aborted) setResult('offline')
    } finally {
      request.current = null
    }
  }

  function retrace() {
    setTrail(undefined)
    setResult(undefined)
  }

  return <div className="chm-beacon-relay">
    <div className="chm-beacon-scout-heading">
      <span aria-hidden="true"><Px rows={SABLE} pal={SABLE_PAL} /></span>
      <h3>Scout Ashen Dunes</h3>
    </div>
    {result === 'lost' ? <>
      <p role="status">The trail vanishes under the sand. Sable guides you back before the wind picks up.</p>
      <Button variant="ghost" onClick={retrace}><Undo2 size={16} aria-hidden="true" />Try another route</Button>
    </> : !trail ? <>
      <p><b>Sable</b> “The stones have been here for years. See those fresh prints? Something passed after last night’s storm.”</p>
      <div className="chm-beacon-options">
        <button type="button" onClick={() => setTrail('tracks')}><Footprints size={20} aria-hidden="true" /><b>Follow the pawprints</b><ArrowRight size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => setTrail('stones')}><Route size={20} aria-hidden="true" /><b>Follow the stone markers</b><ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </> : <>
      <p><b>Sable</b> “Sand has swallowed the low road. From the ridge we might still see where the trail ends.”</p>
      {result === 'searching' && <p role="status">Sable is checking the trail…</p>}
      {result === 'offline' && <p role="alert">Sable’s report couldn’t reach the camp. Try the route again.</p>}
      <div className="chm-beacon-options">
        <button type="button" disabled={result === 'searching'} onClick={() => void scout('road')}><Route size={20} aria-hidden="true" /><b>Take the low road</b><ArrowRight size={17} aria-hidden="true" /></button>
        <button type="button" disabled={result === 'searching'} onClick={() => void scout('ridge')}><Mountain size={20} aria-hidden="true" /><b>Climb to the ridge</b><ArrowRight size={17} aria-hidden="true" /></button>
      </div>
      <Button variant="ghost" disabled={result === 'searching'} onClick={retrace}><Undo2 size={16} aria-hidden="true" />Retrace your steps</Button>
    </>}
  </div>
}
