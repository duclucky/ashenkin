# Dedicated Sepolia gas faucet

Approved: 0.002 ETH per account per rolling 24 hours. No server-wide daily cap.
Dedicated address: `0xafe838E5242bcB102853a31DA40886C3c6f71565`.
The user funds this wallet; the deployer and living-world sponsor are not used.

Authenticated same-origin POST sends only to the account's server-bound Circle
wallet. No arbitrary recipient or amount. A database reservation survives browser
closure and restart; signed bytes/hash are committed before broadcast. Pending
requests block duplicates. A confirmed receipt begins the 24-hour cooldown; a
reverted transfer may be retried. No gas is debited from the recipient.

One global worker lease serializes this dedicated wallet's nonce. Empty funding
wallets pause requests; no automatic transfer from another wallet. No NFT gate,
so a newly signed-in account can obtain gas for its first mint.

VPS-only build/test/deploy. Private key is generated and stored on the VPS in the
existing persistent volume with mode 600; no key is sent to the browser or chat.

## VPS release verification

- Image: `ashenkin:faucet-20261118-0910`.
- Image ID: `sha256:eec0d9b348fa632dcfb98c6e7bb9fb408787b275e40cbfb2f01b17cd10fa256a`.
- Backend: 56 tests passed, including 24-hour cooldown, simultaneous duplicate
  requests, ambiguous broadcast recovery, independent accounts and auth isolation.
- Frontend: 105 tests passed, type-check, new component lint and production build.
- Faucet is available in the wallet panel and the first-mint screen.
- Starter mint now checks estimated fees before trying another sponsorship slot,
  so a daily-faucet-funded wallet is not blocked by the old starter quota.
- Existing Living NFT worker remains active with its separate deployer sponsor.
- Key backup and DB/env rollback files remain private on the VPS.

## Live acceptance

A real browser on the VPS requested the faucet for isolated QA account 2. The
dedicated wallet sent exactly 0.002 ETH on Sepolia with no player signature.
Repeated pending requests reused the same claim; the post-confirmation retry
returned HTTP 429. Rolling 24h cooldown and receipt link are visible on mobile
390×844 and desktop 1440×900, without overflow or page errors.

Transaction: `0xd950f7d606786eb9dd863487e1f6883a0b987c86c80b044a8ed25fed751ab554`.
Gas used: 21,000. Actual fee: 378,000 wei.
Funding received: 1.8 ETH. Verified remaining balance after this one test:
`1.797999999999622` ETH Sepolia. No server-wide daily cap is configured.

Private key and backups stay on the VPS. Temporary copied browser QA cookies
are removed after verification. Existing NFT living-world sponsorship remains
separate and active.
