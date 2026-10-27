# Straws

Draw straws without a referee.

Straws is a neutral way for a group of 2–16 participants to pick one person fairly on BOT Chain. The organiser creates a draw with a title ("Who buys lunch", "Sprint lead") and slots. Entrants seal random 32-byte secrets upon joining; once joining closes or fills, entrants reveal their secrets. The winner is selected deterministically by hashing all revealed secrets in canonical join order. No single party, including the organiser, can predict or control the outcome.

## What it does
- **Commit-Reveal Multi-Party Randomness:** Each entrant commits `keccak256(abi.encode(id, entrant, secret))` before joining ends.
- **Organic Early Reveal:** If all slots fill before `joinEnd`, the reveal phase opens immediately.
- **Deterministic Outcome:** `seed = keccak256(abi.encode(id, revealedSecrets))`, `winner = revealed[seed % revealedCount]`.
- **Archetype V · Fan Visual:** Slots radiate as straws fanned across 120° with paper tags for joined entrants and pulled winner animation.
- **Zero Custody:** Holds no funds; no `payable` functions, no `receive()`, and no admin keys.

## What it cannot do
- **Walk-Away Limitation:** The last person to reveal can see everyone else's secrets and choose not to reveal. Anyone who does not reveal is dropped from the draw. If fewer than two reveal, the draw is void.
- **Wallet vs Person:** Proves a fair pick between wallets, not between people. One person can join with multiple wallets.
- **Off-chain Enforcement:** Nothing on-chain can force anyone to perform the duty decided by the draw (the lunch still has to be bought).

## Gas Profile
Measured with Solc 0.8.23 via Foundry:

| Operation | Gas Used | Cost (BOT at 20 gwei) |
|---|---|---|
| `create(title, slots, joinSecs, revealSecs)` | ~171,000 | ~0.0034 BOT |
| `join(id, commitment)` | ~67,000 | ~0.0013 BOT |
| `reveal(id, secret)` | ~45,000 | ~0.0009 BOT |
| `draw(id)` (resolution & winner selection) | ~53,000 | ~0.0011 BOT |
| `drawOf`, `entrantsOf`, `winnerOf`, `latest` | View calls | Free |

## Development & Local Stack

Run the local stack with seeded draws (chain id 968 on port 8717):
```bash
node scripts/local-stack.mjs
npm run dev
```

Run tests:
```bash
# Contract unit, fuzz (256 runs), and invariant suites
cd contracts && forge test --gas-report

# Frontend unit tests and typecheck
npm run test:unit
npm run typecheck

# Full integration test suite on live anvil node
npm run test:integration
```

## Contract Deployments
- **Mainnet (Chain ID 677):** `TBD`
- **Bohr Testnet (Chain ID 968):** `TBD`

Explorer: [https://scan.botchain.ai](https://scan.botchain.ai)
