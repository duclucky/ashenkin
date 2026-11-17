import { expect, test } from 'bun:test'
import { BaseError, ContractFunctionRevertedError, parseAbi } from 'viem'
import { detectEconomyVersion } from '../src/chimera/economy-version'

test('only a verified version or absent old-world selector determines the active economy', async () => {
  expect(await detectEconomyVersion(async () => 2)).toBe(2)
  const absent = new ContractFunctionRevertedError({ abi: parseAbi(['function economyVersion() view returns (uint8)']), functionName: 'economyVersion', data: '0x' })
  expect(await detectEconomyVersion(async () => { throw new BaseError('Contract read failed', { cause: absent }) })).toBe(1)
  await expect(detectEconomyVersion(async () => 3)).rejects.toThrow('Unsupported economy version')
  await expect(detectEconomyVersion(async () => { throw new Error('RPC timeout') })).rejects.toThrow('RPC timeout')
})
