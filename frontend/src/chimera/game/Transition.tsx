import type { ReactNode } from 'react'
import { go, Link } from '../ui'
import { sfx, unlockAudio } from './sfx'

export function travel(path: string) {
  unlockAudio()
  sfx.door()
  go(path)
}

export function SpecimenLink({ id, children, className, destination = 'creature' }: { id: number; children: ReactNode; className?: string; destination?: 'creature' | 'verify' }) {
  return <Link to={`${destination}/${id}`} className={className}>{children}</Link>
}
