import { useEffect, useState } from 'react'
import { Cells } from '@/components/textures/cells'
import './game-backdrop.css'

export function GameBackdrop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 431px)')
    const sync = () => setVisible(wide.matches)
    sync()
    wide.addEventListener('change', sync)
    return () => wide.removeEventListener('change', sync)
  }, [])

  if (!visible) return null

  return (
    <div className="chm-backdrop" aria-hidden="true" data-motion="ambient">
      <Cells motion="always" tokens={{ '--texture-ink': 'var(--chm-yellow, #FFD209)', '--texture-field': '#FFFFFF' }} />
    </div>
  )
}
