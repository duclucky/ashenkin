import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { encodeAbiParameters, encodeEventTopics, type Address, type Log } from 'viem'
import * as chain from '../src/chimera/chain'
import * as season from '../src/chimera/season'

const keeper: Address = '0x1111111111111111111111111111111111111111'
const rival: Address = '0x2222222222222222222222222222222222222222'
const handle = `0x${'11'.repeat(32)}` as const
const handles = [handle, handle, handle] as const

function start(id: number, challenger: Address, kind = 0, opponentId = 4) {
  return {
    topics: encodeEventTopics({ abi: chain.colosseumAbi, eventName: 'BattleStarted', args: { battleId: BigInt(id), challenger } }),
    data: encodeAbiParameters([{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32[3]' }], [kind, 3n, BigInt(opponentId), handles]),
  } as Log
}

function registered(creatureId: number) {
  return {
    topics: encodeEventTopics({ abi: chain.colosseumAbi, eventName: 'DefenderRegistered', args: { creatureId: BigInt(creatureId), keeper } }),
    data: '0x',
  } as Log
}

afterEach(() => mock.restore())

test('finds a keeper’s old pending hunt and defender duel after more than 30 unrelated starts', async () => {
  spyOn(chain, 'scanLogs').mockResolvedValue([
    registered(17), start(1, keeper), start(2, rival, 1, 17), start(3, rival, 1, 17),
    ...Array.from({ length: 35 }, (_, i) => start(i + 4, rival)),
  ])
  let huntSettled = false
  const read = spyOn(chain, 'read').mockImplementation(async (_address, _abi, _method, args) => {
    const id = Number(args?.[0])
    const status = id === 3 || (id === 1 && huntSettled) ? 2 : 1
    return [{ kind: id === 1 ? 0 : 1, status, challenger: id === 1 ? keeper : rival,
      opponent: id === 2 ? keeper : rival, challengerId: 3n, opponentId: 17n, startedAt: 5n, rounds: 0 }, handles] as any
  })

  expect(typeof season.fetchKeeperBattles).toBe('function')
  const battles = await season.fetchKeeperBattles(keeper)
  expect(battles.map(battle => [battle.id, battle.status])).toEqual([[2, 1], [1, 1]])
  expect(read.mock.calls.map(call => Number(call[3]?.[0]))).toEqual([1, 2, 3])

  huntSettled = true
  const afterSettlement = await season.fetchKeeperBattles(keeper)
  expect(afterSettlement.filter(battle => battle.status === 1).map(battle => battle.id)).toEqual([2])
  expect(afterSettlement.find(battle => battle.id === 1)?.status).toBe(2)
})
