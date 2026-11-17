import './beacon-chapter.css'

export function BeaconTower({ className = '' }: { className?: string }) {
  return <div className={`chm-beacon-tower ${className}`} aria-hidden="true"><i /><b /><span /></div>
}
