# Straws Handover Report

## 1. What Was Built
Straws is a neutral multi-party randomness coordinator on BOT Chain (Bohr testnet chain ID 968). It allows groups of 2–16 participants to fairly pick one of them without a referee ("Who buys lunch", "Who goes first", "Who gets the spare ticket").

Key components:
- **Smart Contract (`contracts/src/Straws.sol`)**:
  - Multi-party commit-reveal: `commitment = keccak256(abi.encode(id, entrant, secret))`.
  - Organic early reveal phase opening when all slots fill before `joinEnd`.
  - Deterministic seed derivation: `seed = keccak256(abi.encode(id, revealedSecrets))` in canonical join order.
  - Winner selection: `winner = revealed[seed % revealedCount]`.
  - Strict bounded storage & loops (bounded to 16 slots, constant gas $\le 55,000$).
  - Non-custodial: zero balance, no `payable` methods, no `receive()`, and no admin keys.
  - Reverts with 13 custom errors: `TitleTooLong`, `BadSlots`, `BadWindow`, `Closed`, `AlreadyJoined`, `ZeroCommitment`, `NotRevealPhase`, `NotEntrant`, `AlreadyRevealed`, `BadReveal`, `TooEarly`, `AlreadyDrawn`, `NoSuchDraw`.
- **Contract Decisions (`contracts/DECISIONS.md`)**:
  - Detailed architecture, game-theoretic walk-away analysis, and mutation testing results.
- **Frontend Architecture (Archetype V · Fan)**:
  - Warm sand ground (`--bg-base: #EBD9B4`), ink (`--text-primary: #2B2118`), and rose accent (`--accent: #D1495B`, `--accent-ink: #FFFFFF`).
  - Typography: Gabarito for headings/UI and Martian Mono for secrets, hashes, countdowns.
  - Signature Fan SVG visual: 120° radiating straws, filled rounded bars with paper tags showing entrant addresses, hollow outlines for empty slots, and pulled winner animation (disabled under `prefers-reduced-motion`).
  - No lists and no tables: the fan is the primary visual across `/`, `/new`, and `/draw/[id]`.
  - Three-step strip: "1 Take a straw · 2 Show it · 3 Pull".
  - Dedicated routes:
    - `/`: Gallery of recent public fans and your draws.
    - `/new`: Draw creation with live interactive fan preview, slots slider (2–16), join/reveal windows, and live consequence sentence.
    - `/draw/[id]`: Centered hero fan over the 3-step strip, timeline, participation buttons, seed recipe, and limits banner.
    - `/me`: Local secret manager with JSON backup export and import.
    - `not-found.tsx`: 404 page in Straws voice.
  - Secret safety: 32 random bytes generated client-side on join, saved to `localStorage`, offered for backup download before wallet signing, and never transmitted before the reveal phase. Blocks joining if storage is disabled.
  - Complete compliance with UI contract: 3 footer links on every route (`BuiltOnBotChain`, `botchain.ai`, `scan.botchain.ai`), opaque wallet dropdown menu with verified AAA contrast tokens.

---

## 2. Verification Results

### Forge Tests
```bash
$ forge test --gas-report
Compiler run successful!

Ran 22 tests for test/Straws.t.sol:StrawsTest
[PASS] testFuzz_WinnerUniformEnough() (gas: 4348906)
[PASS] test_BadRevealReverts() (gas: 245437)
[PASS] test_CreateValidationReverts() (gas: 171615)
[PASS] test_DoubleJoinReverts() (gas: 183136)
[PASS] test_DrawAtExactRevealEndSucceeds() (gas: 272684)
[PASS] test_DrawOnce() (gas: 298352)
[PASS] test_DrawTooEarlyReverts() (gas: 264324)
[PASS] test_EntrantsOfReturnsAllEntrants() (gas: 238377)
[PASS] test_ExactBoundaryDurationsSucceed() (gas: 173199)
[PASS] test_FillingOpensRevealEarly() (gas: 271957)
[PASS] test_JoinAfterFullReverts() (gas: 241776)
[PASS] test_JoinAtExactJoinEndReverts() (gas: 117056)
[PASS] test_LatestPagination() (gas: 435188)
[PASS] test_NoBalance_NoReceive() (gas: 12392)
[PASS] test_NoSuchDrawReverts() (gas: 24354)
[PASS] test_RevealAtExactRevealEndReverts() (gas: 242987)
[PASS] test_RevealBeforeJoinEndReverts() (gas: 182900)
[PASS] test_SeedMatchesOffChainVector() (gas: 375644)
[PASS] test_UnrevealedNeverWin(uint8) (runs: 256, μ: 429234, ~: 418945)
[PASS] test_VoidWhenFewerThanTwoReveal() (gas: 268370)
[PASS] test_WinnerIsARevealedEntrant() (gas: 383555)
[PASS] test_ZeroCommitmentReverts() (gas: 111635)
Suite result: ok. 22 passed; 0 failed; 0 skipped; finished in 5.80s

Ran 3 tests for test/StrawsInvariant.t.sol:StrawsInvariantTest
[PASS] invariant_ContractBalanceZero() (runs: 256, calls: 32768, reverts: 94)
[PASS] invariant_RevealedBoundedByJoined() (runs: 256, calls: 32768, reverts: 93)
[PASS] invariant_WinnerIsRevealedEntrant() (runs: 256, calls: 32768, reverts: 92)
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 12.16s

Ran 2 test suites: 25 tests passed, 0 failed, 0 skipped (25 total tests)
```

### Mutation Testing
```bash
$ python3 scripts/mutation-check.py straws
straws: 54 possible mutants, testing 25
  killed 23 of 25; survivors: 2
```
- **Analysis**: 100% logic kill rate. The 2 surviving mutants are mathematically equivalent ternary branches in `latest()` pagination:
  1. `offset >= drawCount` vs `offset > drawCount`: when `offset == drawCount`, `available = 0`, so `n = 0` and an empty slice is returned in both cases.
  2. `count < available ? count : available` vs `count <= available`: when `count == available`, `<` and `<=` return identical values.

### Unit Tests
```bash
$ npm run test:unit
Test Files  11 passed (11)
Tests       68 passed (68)
Duration    3.92s
```

### Integration Tests
```bash
$ npm run test:integration
Test Files  2 passed (2)
Tests       8 passed (8)
Duration    1.12s
```
- Fully exercises deployment, full draw lifecycle, seed matching on-chain and off-chain, void state, all 13 revert errors, and chunked event log fetching.

### TypeScript & Production Build
```bash
$ npm run typecheck
tsc --noEmit (clean, 0 errors)

$ npm run build
✓ Generating static pages using 7 workers (5/5) in 485ms
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /draw/[id]
├ ○ /me
└ ○ /new
```

### Checker Scripts
```bash
$ python3 scripts/check-honesty.py straws
honesty: 0 finding(s) in 1 project(s)

$ python3 scripts/check-ui-contract.py straws
straws: ok

$ python3 scripts/check-tokens.py straws
0 project(s) with undefined tokens

$ python3 scripts/check-distinct.py straws
32 projects compared; 0 pair/file problem(s)
```

### Headless Chrome CDP Verification
Executed automated verification via `scripts/browser-walkthrough.mjs` against seeded local stack:
- Desktop 1280px: page title verified, 3 footer links verified, wallet menu opaque contrast tokens verified.
- Mobile 360px: `scrollWidth = 360`, `clientWidth = 360` (zero horizontal overflow).
- Screen walkthrough: `/`, `/new`, `/me`, and Seeded Draws 1–5:
  - Draw 1: Joining phase (3/6 slots), "Take a straw" button present, limits banner present.
  - Draw 2: Full / Reveals open (2/4 revealed), paper tags shown.
  - Draw 3: Awaiting draw (3/3 revealed), "Pull" button present.
  - Draw 4: Winner selected, `.straw-pull-active` animation, SeedRecipe displayed.
  - Draw 5: Void message present verbatim: `"Fewer than two straws were shown. No winner."`
- Real On-Chain Transaction: connected mock wallet as Outsider, executed `join(1, commitment)`, persisted secret to `localStorage`, and confirmed on-chain.
- Console Errors: 0 unhandled console errors / 0 hydration warnings.

---

## 3. Local Stack Instructions
```bash
# 1. Start local anvil node, deploy Straws, and seed draws 1-5:
node scripts/local-stack.mjs

# 2. Start the application:
npm run dev

# 3. Connect via browser with mock wallet or MetaMask:
# RPC: http://127.0.0.1:8717
# Chain ID: 968
```
