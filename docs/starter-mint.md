# Ashenkin sign-in and the first NFT

The release supports email sign-in by one-time code and external wallet sign-in by a single SIWE signature. A verified identity maps to one Circle Developer-Controlled EOA on Ethereum Sepolia. The wallet used to sign in is a credential. It does not receive the NFT or pay for game actions. Returning on another device with the same sign-in method recovers the same Circle address and NFT collection.

Email and external wallet credentials are separate identities. Using another credential creates a separate account. NFTs already held in external wallets stay at their existing addresses.

## Enable the backend

Use Node 22.13 or newer. Supply the following environment variables on the server, or in the optional `deploy/.env.keeper` for Docker Compose.

| Setting | Purpose |
| --- | --- |
| `CIRCLE_API_KEY` | Circle Wallets API key |
| `CIRCLE_ENTITY_SECRET` | Registered entity secret, stored only on the server |
| `CIRCLE_WALLET_SET_ID` | Wallet set to use for Sepolia player wallets |
| `ASHENKIN_AUTH_SECRET` | At least 32 bytes of random server-only secret for email verification |
| `ASHENKIN_AUTH_ORIGIN` | Exact website origin. Falls back to `PUBLIC_ORIGIN`. Use HTTPS outside localhost. |
| `ASHENKIN_SMTP_URL` | SMTP connection URL for email codes |
| `ASHENKIN_EMAIL_FROM` | Sender address verified with your mail provider |
| `ASHENKIN_KEEPER_DB_FILE` | Optional SQLite path. Defaults to `backend/db/keepers.sqlite`. |

Back up the SQLite data and the Circle entity recovery file. Docker Compose persists the default database in its `keeper-data` volume. The stored identity and wallet ID association is required to recover a player's account.

## Sponsor the starter mint

Configure `CHIMERA_SETTLEMENT_PRIVATE_KEY` or `CHIMERA_SETTLEMENT_KEY_FILE` for the existing Sepolia sponsor. Set `ASHENKIN_CIRCLE_STARTER_ETH` to the test ETH grant and `ASHENKIN_STARTER_MINT_LIMIT` to the maximum number of funded accounts. The server estimates gas for both the funding transfer and the Lab mint. Mint fees use EIP-1559 parameters bounded by `CHIMERA_SETTLEMENT_MAX_GWEI` and the game wallet's balance. The sponsor grants gas at most once to each account. A reverted funding transfer can be retried because it transferred no ETH. The Circle wallet submits the Lab mint itself. Gameplay gas beyond the starter depends on the Circle wallet's balance and the existing settlement sponsorship.

The existing Lab contract mints the NFT and uses Zama to generate its encrypted genome. Circle Developer Wallets are custodial. Ashenkin can sign for the game wallet and therefore has the ability to request wallet-authorized FHE decryption. Other players and public observers cannot read private FHE data without authorization.

Before opening this to players, verify both login methods on separate browser profiles, confirm the same method restores the same Circle address, and check the confirmed Lab `Hatched` event and NFT ownership on Sepolia.
