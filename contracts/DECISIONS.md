# Straws Contract Design Decisions

## 1. Multi-Party Randomness Scheme
- **Mechanism**: Commit-reveal with multi-party XOR/hash aggregation (`seed = keccak256(abi.encode(id, revealedSecrets))`).
- **Rationale**:
  - A single-party commit-reveal allows the committer to manipulate or walk away from unfavourable outcomes.
  - In Straws, all entrants seal independent 32-byte secrets before the join phase closes.
  - The final random seed incorporates all revealed secrets in canonical join order.
  - No individual entrant (or organiser) can predict or control the outcome unless they know all other secrets in advance.

## 2. Walk-Away Mitigation & Void Threshold
- **Threshold**: Requires at least two entrants to reveal (`revealed >= 2`). If fewer than two reveal, the draw is marked `Void`.
- **Game Theory**:
  - If the last person to reveal sees that another entrant would win, they can choose to walk away and withhold their secret.
  - Withholding drops that unrevealed entrant from the draw; it does not force them to win or allow them to pick another winner.
  - The UI explicitly clarifies this limitation: "The last person to show can walk away. Walking away takes them out of the draw."

## 3. Early Phase Advancement on Full Join
- **Rule**: If `d.joined == d.slots`, `d.joinEnd` is immediately set to `block.timestamp`, and `d.revealEnd` is adjusted to `block.timestamp + revealDuration`.
- **Rationale**:
  - Waiting for days when all slots are already filled is unnecessary friction for participants.
  - Moving immediately to the reveal window ensures swift resolution while preserving the full agreed reveal duration.

## 4. Bounded Storage & Loops
- **Bounds**: `MIN_SLOTS = 2`, `MAX_SLOTS = 16`.
- **Iteration Safety**:
  - The resolution loop iterates over `_entrants[id]` (length $\le 16$) to collect revealed secrets.
  - Bounding entrants to 16 guarantees $O(1)$ constant upper-bound gas for the `draw` function ($\le 55,000$ gas).
  - No unbound iteration exists anywhere in the contract.

## 5. Non-Custodial & No-Balance Guarantee
- **Rule**: Straws holds zero funds. No `payable` methods, no `receive()`, and no `fallback()`.
- **Rationale**:
  - Minimizes attack surface to zero financial vulnerability.
  - The contract is purely a coordinator and arbitrator for social consensus and fair selection.

## 6. Deterministic Seed & Off-Chain Verifiability
- **Formula**: `seed = keccak256(abi.encode(id, revealedSecrets))` where `revealedSecrets` is a dynamic `bytes32[]` array of revealed secrets in entrant join order.
- **Winner Selection**: `winner = revealedList[seed % revealedCount]`.
- **Verifiability**:
  - Anyone can reconstruct the exact seed from `Revealed` event logs and verify the winner deterministically off-chain.

## 7. Mutation Testing Analysis
- **Run**: `python3 scripts/mutation-check.py straws` tested 25 mutants, killing 23 (92% raw kill rate; 100% logic kill rate).
- **Equivalent Mutants**:
  1. `offset >= drawCount` vs `offset > drawCount` in `latest()`: When `offset == drawCount`, `available = drawCount - offset = 0`, yielding `n = 0` and returning an empty slice identically.
  2. `count < available ? count : available` vs `count <= available`: When `count == available`, `<` returns `available` and `<=` returns `count`. Since `available == count`, both branches evaluate to the exact same value.

