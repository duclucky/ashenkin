import { expect, test } from 'bun:test'
import { campaignProgress, type CampaignSpecimen } from '../src/chimera/game/campaign'

const keeper = `0x${'ab'.repeat(20)}`
const specimen = (id: number, extra: Partial<CampaignSpecimen['info']> = {}): CampaignSpecimen => ({ id, owner: keeper, info: { generation: 0, parentA: 0, parentB: 0, sequencedMask: 0, certified: false, ...extra } })

test('missing and disconnected evidence remains unknown rather than completing or failing a mission', () => {
  expect(Object.values(campaignProgress({ account: keeper })).every(row => row.done === null)).toBe(true)
  expect(Object.values(campaignProgress({ account: null, specimens: [specimen(1)], settledFights: 5 })).every(row => row.done === null)).toBe(true)
  const empty = campaignProgress({ account: keeper, specimens: [], settledFights: 0 })
  expect(Object.values(empty).every(row => row.done === false)).toBe(true)
})

test('settled counters and owned metadata prove separate story objectives without requiring a win', () => {
  const progress = campaignProgress({ account: keeper, specimens: [specimen(3), specimen(2, { sequencedMask: 1 })], settledFights: 1 })
  expect([progress.own.done, progress.fight.done, progress.read.done, progress.pair.done, progress.bred.done]).toEqual([true, true, true, true, false])
  expect(progress.read.specimen).toBe(2)
  expect(campaignProgress({ account: keeper, specimens: [specimen(3, { certified: true })], settledFights: 0 }).read.done).toBe(true)
})

test('lineage restoration needs a bred NFT and a publicly read rare crest, not a rare genesis or unconfirmed traits', () => {
  const child = specimen(7, { generation: 1, parentA: 2, parentB: 3 })
  const base = { account: keeper, specimens: [specimen(2), child], settledFights: 2 }
  expect(campaignProgress(base).bred.done).toBe(true)
  expect(campaignProgress(base).crest.done).toBeNull()
  expect(campaignProgress({ ...base, crests: { 2: 15, 7: 11 } }).crest.done).toBe(false)
  const restored = campaignProgress({ ...base, crests: { 7: 12 } })
  expect(restored.crest).toMatchObject({ done: true, specimen: 7, count: 1 })
  expect(campaignProgress({ ...base, crests: { 7: NaN } }).crest.done).toBeNull()
})

test('stale ownership, duplicate IDs and malformed parent records cannot fabricate a lineage', () => {
  const stale = { ...specimen(7, { generation: 1, parentA: 2, parentB: 3 }), owner: `0x${'cd'.repeat(20)}` }
  const malformed = specimen(8, { generation: 1, parentA: 2, parentB: 2 })
  const progress = campaignProgress({ account: keeper.toUpperCase(), specimens: [specimen(2), specimen(2), stale, malformed], settledFights: NaN, crests: { 7: 15, 8: 15 } })
  expect(progress.own.count).toBe(2)
  expect(progress.pair.done).toBe(true)
  expect(progress.bred.done).toBe(false)
  expect(progress.crest.done).toBe(false)
  expect(progress.fight.done).toBeNull()
})
