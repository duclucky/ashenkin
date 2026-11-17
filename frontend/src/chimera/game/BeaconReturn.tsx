import { ArrowLeft } from 'lucide-react'
import { CHAIN_ID, LAB } from '../chain'
import { Link } from '../ui'
import { beaconScope, loadBeacon, type BeaconLead } from './beacon'
import './beacon-chapter.css'

export function BeaconReturn({ account, lead }: { account: string | null; lead: BeaconLead }) {
  if (!account) return null
  const record = loadBeacon(beaconScope(CHAIN_ID, LAB, account))
  if (record?.lead !== lead || record.ending) return null
  return <Link to="journal" className="chm-beacon-return"><ArrowLeft size={16} aria-hidden="true" />Return to the beacon</Link>
}
