import { expect, test } from 'bun:test'
import { beaconScope, beaconStep, fieldEvidence, resolveBeacon, type BeaconEvidence } from '../src/chimera/game/beacon'

const evidence: BeaconEvidence = { ownsSpecimen: true, fight: true, genome: false, field: 'home' }
const archive = { lead: 'archive' } as const
const field = { lead: 'field' } as const
const relay = ['paw', 'lantern', 'crest'] as const

test('the investigation opens after a settled fight, without requiring a win', () => {
  expect(beaconStep({ ...evidence, fight: null }, archive)).toBe('locked')
  expect(beaconStep({ ...evidence, fight: false }, null)).toBe('locked')
  expect(beaconStep(evidence, null)).toBe('choose-lead')
})

test('an owner can reach the ending after practice and a scout without an on-chain fight', () => {
  const keeper = { ownsSpecimen: true, fight: null, practiced: true, genome: null, field: 'unread' } as const
  expect(beaconStep({ ...keeper, ownsSpecimen: false }, null)).toBe('locked')
  expect(beaconStep(keeper, null)).toBe('choose-lead')
  expect(resolveBeacon(keeper, field, relay, 'wayfinding')).toBeNull()
  const scouted = { ...field, scouted: true }
  expect(beaconStep(keeper, scouted)).toBe('relay')
  expect(resolveBeacon({ ...keeper, ownsSpecimen: false }, scouted, relay, 'wayfinding')).toBeNull()
  expect(resolveBeacon(keeper, scouted, relay, 'wayfinding')).toEqual({ ...scouted, ending: 'wayfinding' })
  expect(beaconStep({ ...keeper, practiced: false }, { ...scouted, ending: 'wayfinding' })).toBe('finished')
})

test('each route needs evidence from its own activity', () => {
  expect(beaconStep({ ...evidence, field: 'returned' }, archive)).toBe('archive')
  expect(beaconStep({ ...evidence, genome: true, field: 'away' }, field)).toBe('field')
  expect(beaconStep({ ...evidence, genome: true }, archive)).toBe('relay')
  expect(beaconStep({ ...evidence, field: 'returned' }, field)).toBe('relay')
  expect(fieldEvidence()).toBe('unread')
  expect(fieldEvidence([{ zone: 1, claimed: true }])).toBe('home')
  expect(fieldEvidence([{ zone: 0, claimed: false }])).toBe('away')
  expect(fieldEvidence([{ zone: 0, claimed: true }, { zone: 0, claimed: false }])).toBe('returned')
})

test('the ending requires evidence and a tuned relay and cannot overwrite an ending', () => {
  const returning = { ...evidence, field: 'returned' } as const
  expect(resolveBeacon(evidence, field, relay, 'shelter')).toBeNull()
  expect(resolveBeacon(returning, field, ['lantern', 'paw', 'crest'], 'shelter')).toBeNull()
  expect(resolveBeacon(returning, field, relay, 'wayfinding')).toEqual({ lead: 'field', ending: 'wayfinding' })
  expect(resolveBeacon({ ...evidence, genome: true }, archive, relay, 'shelter')).toEqual({ lead: 'archive', ending: 'shelter' })
  expect(resolveBeacon(returning, { ...field, ending: 'shelter' }, relay, 'wayfinding')).toBeNull()
})

test('story records are scoped by wallet and deployment', () => {
  expect(beaconScope(1, '0xAB', '0xCD')).toBe(beaconScope(1, '0xab', '0xcd'))
  expect(beaconScope(1, '0xab', '0xcd')).not.toBe(beaconScope(1, '0xab'))
  expect(beaconScope(1, '0xab', '0xcd')).not.toBe(beaconScope(1, '0xac', '0xcd'))
})
