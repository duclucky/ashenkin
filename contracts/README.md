# Ashenkin contracts

Solidity contracts for Ashenkin's Sepolia creature collection, confidential combat,
economy and sponsored offline encounters. This directory started from the
[Zama FHEVM Hardhat template](https://github.com/zama-ai/fhevm-hardhat-template);
Ashenkin's game code is maintained in [duclucky/ashenkin](https://github.com/duclucky/ashenkin).
The upstream [BSD-3-Clause-Clear notice](LICENSE) is retained.

This project is not audited, endorsed or operated by Zama. Use at your own risk.

## Compile and test without a funded wallet

Node.js 22+ and npm are required. From this directory:

```sh
npm ci
npm run compile
npm test
```

Hardhat uses chain 31337 and the FHEVM mock for these tests. No real wallet or
Sepolia ETH is needed. `npm test` compiles as necessary. The standard Hardhat
mnemonic is a public test fixture, never a funded production signer.

| Entry point | Responsibility |
| --- | --- |
| [ChimeraLab](contracts/ChimeraLab.sol) | NFT genesis, encrypted alleles, breeding and explicit genome disclosure |
| [ChimeraColosseum](contracts/ChimeraColosseum.sol) / [ChimeraCombat](contracts/ChimeraCombat.sol) | Sealed three-move plans, FHE scoring, random rolls and proof settlement |
| [AshenkinEncounters](contracts/AshenkinEncounters.sol) | One encrypted daily challenge per eligible NFT; public outcome proof |
| [ChimeraTraining](contracts/ChimeraTraining.sol) | Earned XP, confidential payment and encrypted random power bonus |
| [ChimeraMarket](contracts/ChimeraMarket.sol) | NFT escrow and confidential ERC-7984 payment |
| [SeasonOfMasks test](test/SeasonOfMasks.ts) | Genesis, breeding, combat, sale and why a leaked defender plan matters |
| [Encounter tests](test/AshenkinEncounters.ts) | Daily snapshot, difficulty, forged proof rejection and backend exactly-once credit |

The internal `Chimera*` Solidity identifiers predate the public Ashenkin name.
They are retained to preserve deployment and ABI compatibility. The current public
collection is Ashenkin (ASHEN), not a new user-facing version of an older game.

## Current Sepolia deployment

The [root README](../README.md#sepolia-deployment) links the public contracts.
[Deployment receipts](deployments-ashenkin/sepolia.json) record the release;
[frontend addresses and ABIs](../frontend/src/chimera/contracts.ashenkin.json)
select that release. Legacy deployment files are compatibility/history, not the
current judge entry point. [Privacy design](../docs/confidentiality.md) explains
ACLs, operator trust, randomness and proof boundaries.

## New deployments and verification

Running deployment scripts spends test ETH and creates/changes contracts. It is
not required to run the app against its existing public Sepolia deployment.
Copy [.env.example](.env.example) to `.env` only for an intentionally authorized
new deployment. Keep its signer outside Git. `hardhat.config.ts` reads
`DEPLOYER_PRIVATE_KEY` and optional `SEPOLIA_RPC_URL`; it falls back to the public
Hardhat mnemonic if no private key is configured. **Never fund that fallback on a
public network.** Set the explorer API key with `npx hardhat vars set ETHERSCAN_API_KEY`.

`deploy/deploy.ts` deploys the original core modules. The scripts under `scripts/`
add later modules and links; they are not a single command that recreates the
entire hosted release. Do not overwrite committed addresses with a partial export.
For an already deployed contract, source verification uses its actual constructor
arguments and `npm run verify:sepolia -- <address> <constructor arguments...>`.
A passing bytecode comparison is not the same as a verified explorer listing or
an independent security audit.

[Configuration](../docs/configuration.md) · [Test and Sepolia evidence](../docs/verification.md)
