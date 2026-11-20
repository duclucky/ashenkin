# Run and configure Ashenkin

## Minimal public demo (no service secrets)

Use Node.js 22+ and Bun 1.4.0. From the repository root:

```sh
bun install --cwd frontend --frozen-lockfile
bun install --cwd backend --frozen-lockfile
npm --prefix frontend run build
npm --prefix backend run demo
```

Open http://127.0.0.1:4173. The existing Sepolia contracts, public RPC and Zama
relayer are used; this does not deploy a new chain. Public verification and NFT
metadata work without a server wallet key. A standalone user can connect an
external Sepolia wallet. Circle login, funded faucet and Living inventory are
optional server services and are disabled without configuration.

Copy [backend/.env.example](../backend/.env.example) to `backend/.env` only if
customizing. `npm --prefix backend run demo` loads `backend/.env`; do not place
server secrets in the frontend or any `VITE_*` variable. Locally leave
`PUBLIC_ORIGIN` unset so metadata uses localhost. For hosting use the exact HTTPS
origin. Paths in backend configuration resolve relative to `backend/`, unless
absolute. Runtime database files belong in ignored `backend/db/`.

For separate development servers, use `npm --prefix backend run dev` and
`npm --prefix frontend run dev`. Vite listens on 127.0.0.1:5173 and proxies `/api`
to backend port 3001. The production demo serves assets and API from one origin.

## Optional hosted identity-linked wallets

Configure all three `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` and
`CIRCLE_WALLET_SET_ID` using Circle TEST credentials and an ETH-SEPOLIA wallet set.
The entity secret must already be registered with Circle. Set
`ASHENKIN_AUTH_SECRET` to an independently generated secret of at least 32 bytes
and `ASHENKIN_AUTH_ORIGIN` to the browser-visible origin. Do not reuse production
secrets in a test deployment. Persist `ASHENKIN_KEEPER_DB_FILE` and back it up with
SQLite's online backup mechanism, including during WAL operation.

Wallet login verifies SIWE challenges. Email login additionally requires
`ASHENKIN_SMTP_URL` and `ASHENKIN_EMAIL_FROM`; the SMTP URL is a secret and its
credentials must be URL-encoded. Mailbox delivery/domain configuration is supplied
by the operator. The API links an authenticated identity to a stable game wallet;
it does not assume an unlinked browser key identifies the owner.
[Custody and decryption boundaries](confidentiality.md#hosted-wallet-custody-and-operator-powers).

## Optional funding services

These settings authorize real Sepolia transactions when the server runs. Enable
them only after intentionally provisioning the signer, limits and test ETH.

| Service | Required configuration / behavior |
| --- | --- |
| Daily faucet | `ASHENKIN_GAS_FAUCET_ENABLED=true`, `ASHENKIN_GAS_FAUCET_KEY_FILE`, optional expected address; one grant per account per rolling 24h, default `ASHENKIN_GAS_FAUCET_AMOUNT=0.002` ETH. Key JSON uses the property `privateKey`. The faucet must be a separate wallet from the settlement signer. |
| Legacy / offline sponsor | `CHIMERA_SETTLEMENT_KEY_FILE`, optional `CHIMERA_SETTLEMENT_EXPECTED_ADDRESS`, `CHIMERA_SETTLEMENT_MAX_GWEI` (default 3). Key JSON uses `pk`. Legacy `CHIMERA_SETTLEMENT_PRIVATE_KEY` is also supported; prefer a mounted secret file. |
| Interactive public-result sponsor | `ASHENKIN_INTERACTIVE_KEY_FILE` and required `ASHENKIN_INTERACTIVE_EXPECTED_ADDRESS`; key JSON uses `pk`. Use a distinct wallet from the legacy/offline signer and faucet. Uses the settlement fee ceiling above. Without this key, public settlement falls back to the conservative shared signer. |
| Living encounters | Requires hosted keeper configuration and `ASHENKIN_ENCOUNTERS_ADDRESS`. Set `ASHENKIN_LIFE_WORKER=true` plus the settlement signer to submit draws. `ASHENKIN_LIFE_DAILY_ETH` defaults to 0.005; `ASHENKIN_LIFE_MAX_GWEI` defaults to 0.1. Worker false allows viewing available data without submitting new draws. |
| Legacy starter sponsorship | Off unless both `ASHENKIN_CIRCLE_STARTER_ETH` and positive `ASHENKIN_STARTER_MINT_LIMIT` are set, with a settlement signer. The public daily faucet is the documented onboarding route. |

The interactive sponsor persists nonce, calldata, signed bytes and hash in
`backend/db/settlements.sqlite` before broadcasting. Persist this database and
its SQLite WAL state together with the signer configuration; back it up using
SQLite's online backup API. Do not delete the journal while its signer has pending
transactions or use that signer from external scripts. Up to eight sends may be
pending; the journal finalizes a receipt after its block plus two more blocks.
Recovery rebroadcasts identical bytes and checks the recorded sender, nonce and
call. `GET /api/settlement` reports a known job hash/state without signing; unknown
status is not evidence that it is safe to send a new transaction.

Key files should live outside Git, for example in a read-only mounted
`/run/secrets/` directory. Restrict file permissions to the service account, and
never commit a real key JSON. The key formats differ (`privateKey` versus
`pk`); do not copy the faucet file into the settlement slot. Circle signing uses
its own credentials rather than the local sponsor keys.

Circle fee admission reads wallet-scoped transaction history with pagination and
reserves the estimated gas of provider-pending outgoing calls, including calls
already mined but not yet released by Circle. Missing reservation data refuses
before signing; no provider payload or credential is logged. `CIRCLE_GAS_RESERVED`
is a bounded wait for that wallet, not a request to refill it or a global queue.
Keeper SQLite also stores client intent IDs, their request binding and cancelled
IDs for lost-acknowledgement recovery. Include these tables in online backups;
deleting them removes protection against delayed duplicate requests.

## Tests and repeatable read checks

```sh
npm --prefix frontend run lint
npm --prefix frontend run type-check
bun test --isolate --cwd frontend tests
npm --prefix frontend run build
node scripts/check-doc-links.js
node --test backend/lib/*.test.js
npm --prefix contracts ci
npm --prefix contracts test
node backend/scripts/check-demo-v2.js --release https://ashenkin.xyz 1 --require-uri
```

The last command reads public APIs/RPC and validates assets, metadata, SVG and
`tokenURI`; it does not sign or submit a transaction. Browser public proof checking
is separate. Solidity tests run with the Hardhat FHEVM mock on chain 31337.
[Contract-specific setup](../contracts/README.md) · [Verification record](verification.md).

## Container hosting

After building the frontend, build from the repository root:

```sh
docker build -f deploy/Dockerfile -t ashenkin:release .
docker run --rm -p 127.0.0.1:4173:4173 ashenkin:release
```

Pass optional secrets using `--env-file` and mount a persistent volume at
`/app/backend/db`; mount signer files separately. The runtime image runs as the
non-root `node` user. `deploy/compose.yaml` is the project's HTTPS/Cloudflare
hosting template: it expects a prebuilt image and separately provisioned tunnel
configuration. A plain clone does not include tunnel credentials and cannot use
that template without configuring its tunnel. No production credentials are
required for the minimal `docker run` command above.
