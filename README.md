# Ashenkin

Ashenkin is a creature-collecting game on Ethereum Sepolia. Hatch Xenos, breed new bloodlines, and take a three-move battle plan into the Colosseum. Zama FHEVM lets the contract score encrypted moves, training power, elements, and rolls. A public proof reveals who won each round.

This project is not audited, endorsed or operated by Zama. Use at your own risk.

[Play Ashenkin](https://ashenkin.xyz/) · [Judge mode](https://ashenkin.xyz/#/judge) · [Verify Wild Hunt #1](https://ashenkin.xyz/#/arena/log/1)

## Play and verify

1. Open [How to play](https://ashenkin.xyz/#/guide) and try the Colosseum practice mode. Practice needs no wallet.
2. Connect a Sepolia wallet with test ETH. Hatch a Xeno in the Lab, select it in the Colosseum, and enter a Wild Hunt. If you reload after the opening transaction confirms, recover the pending fight in **Battle log**.
3. Open [Wild Hunt #1](https://ashenkin.xyz/#/arena/log/1) in a guest browser. Select **Verify the rounds**, then **Verify all three rounds**. The verifier obtains the three public KMS results and checks them against the settled record on Sepolia. [Guest proof screenshot](docs/proof-center.png)

The public demo was used to open and settle Wild Hunt #1 with a test wallet. Keliakor won rounds 1 and 2 and lost round 3. [Open transaction](https://sepolia.etherscan.io/tx/0xdd102d9b3391f71ee5539ab71d9d0324823e5e3c9ccd1446ae05d8440f1aeddd) · [Settlement transaction](https://sepolia.etherscan.io/tx/0xab52e10d32f2b05bd0b3b4dc09fd58bd72a47bc869b1f02cddcc90b13c4e9d1e)

## What the protocol protects

| Game system | Encrypted state and public result |
| --- | --- |
| Colosseum | Players seal their plans before scoring. If a defender's plan were public, a challenger could pick a counter for each move. Zama generates the wild plan and a fresh encrypted 0–31 roll per side in each round. Settlement checks the KMS proof and records three winner bits. Plans, rolls, and power stay hidden during scoring. |
| Lab and Nursery | The Lab generates traits with Zama randomness and breeds from encrypted alleles. Ownership, appearance, and parent IDs are public. The keeper controls genome disclosure. |
| Market | Listed prices are public. cZAMA uses ERC-7984, and sale finalization checks the encrypted payment outcome. |

See the scoring and settlement in [Colosseum](contracts/contracts/ChimeraColosseum.sol), hatching and breeding in [Lab](contracts/contracts/ChimeraLab.sol), and the guest verification flow in [ProofDrawer](frontend/src/chimera/game/ProofDrawer.tsx).

## Sepolia deployment

| Component | Address |
| --- | --- |
| Ashenkin NFT (ASHEN) | [0x233d680fc473C36B0d1c6C32Dc8B23eaEcaC8aF2](https://sepolia.etherscan.io/address/0x233d680fc473C36B0d1c6C32Dc8B23eaEcaC8aF2) |
| Colosseum | [0xa6fa68c5E4d9dAeF079c197c1f3d45ef7D21B59a](https://sepolia.etherscan.io/address/0xa6fa68c5E4d9dAeF079c197c1f3d45ef7D21B59a) |
| Treasury | [0x2132C2e0f76382DC58414fBbff7068619009d906](https://sepolia.etherscan.io/address/0x2132C2e0f76382DC58414fBbff7068619009d906) |
| cZAMA, test ERC-7984 | [0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB](https://sepolia.etherscan.io/address/0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB) |

[All addresses and ABIs](frontend/src/chimera/contracts.ashenkin.json) · [Deployment receipts](contracts/deployments-ashenkin/sepolia.json) · [NFT #1 metadata](https://ashenkin.xyz/api/ashenkin-nft/1)

## Run from a clone

Install Node.js 22 or later, npm, and Bun. Run from the repository root.

```sh
bun install --cwd frontend --frozen-lockfile
bun install --cwd backend --frozen-lockfile
npm --prefix frontend run build
npm --prefix backend run demo
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173/). Express serves the built app, NFT API, and FHE WebAssembly files. The app reads Sepolia over public RPC and uses the Zama testnet relayer. A wallet is required to submit a transaction. The guest proof check uses public reads.

For development, run `npm --prefix backend run dev` and `npm --prefix frontend run dev` in separate terminals. Vite serves the game at [http://127.0.0.1:5173](http://127.0.0.1:5173/) and proxies the API to port 3001.

## Test

```sh
npm --prefix frontend run type-check
bun test --cwd frontend tests
node --test backend/lib/nft-metadata.test.js backend/lib/settlement.test.js backend/lib/beacon-scout.test.js
npm --prefix contracts ci
npm --prefix contracts test
```

The Solidity suite uses the Hardhat FHEVM mock. The [Season of Masks test](contracts/test/SeasonOfMasks.ts) exercises hatching, breeding, battle settlement, and a sale. To check the live deployment and NFT URI from the command line, run:

```sh
node backend/scripts/check-demo-v2.js --release https://ashenkin.xyz 1 --require-uri
```
