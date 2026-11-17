import { expect, mock, test } from 'bun:test'
import { HuntPlanPreparation, type HuntPlan, type HuntProof } from '../src/chimera/game/hunt-plan'

const plan: HuntPlan = { chainId: 11155111, colosseum: '0x00000000000000000000000000000000000000aa', account: '0x0000000000000000000000000000000000000001', moves: 36 }
const first: HuntProof = { handle: '0x01', proof: '0x02' }
const second: HuntProof = { handle: '0x03', proof: '0x04' }

test('the click joins matching background work and consumes the proof once', async () => {
  let finish!: (proof: HuntProof) => void
  const encrypt = mock((): Promise<HuntProof> => new Promise(resolve => { finish = resolve }))
  const prep = new HuntPlanPreparation(encrypt)
  prep.warm(plan)
  prep.warm(plan)
  await Promise.resolve()
  expect(encrypt).toHaveBeenCalledTimes(1)
  const pending = prep.take(plan)
  finish(first)
  expect(await pending).toEqual(first)
  expect(encrypt).toHaveBeenCalledTimes(1)
  encrypt.mockResolvedValueOnce(second)
  expect(await prep.take(plan)).toEqual(second)
  expect(encrypt).toHaveBeenCalledTimes(2)
})

test('new moves, wallet, network or Colosseum cannot use the old proof', async () => {
  for (const next of [
    { ...plan, moves: 17 }, { ...plan, chainId: 1 },
    { ...plan, account: '0x0000000000000000000000000000000000000002' as const },
    { ...plan, colosseum: '0x00000000000000000000000000000000000000bb' as const },
  ]) {
    const encrypt = mock(async (_plan: HuntPlan, _signal?: AbortSignal) => second).mockResolvedValueOnce(first)
    const prep = new HuntPlanPreparation(encrypt)
    prep.warm(plan)
    await Promise.resolve()
    expect(await prep.take(next)).toEqual(second)
    expect(encrypt.mock.calls[0][1]?.aborted).toBe(true)
    expect(encrypt.mock.calls[1][0]).toEqual(next)
  }
})

test('a background failure retries on click and leaving only cancels unclaimed work', async () => {
  const encrypt = mock(async (_plan: HuntPlan, _signal?: AbortSignal) => first).mockRejectedValueOnce(new Error('Relayer unavailable'))
  const prep = new HuntPlanPreparation(encrypt)
  prep.warm(plan)
  expect(await prep.take(plan)).toEqual(first)
  expect(encrypt).toHaveBeenCalledTimes(2)

  prep.warm(plan)
  await Promise.resolve()
  prep.clear()
  expect(encrypt.mock.calls.at(-1)?.[1]?.aborted).toBe(true)
  prep.warm(plan)
  const claimed = prep.take(plan)
  prep.clear()
  expect(await claimed).toEqual(first)
  expect(encrypt.mock.calls.at(-1)?.[1]?.aborted).toBe(false)
})
