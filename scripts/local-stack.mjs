/**
 * Local stack runner and seeder for Straws.
 *
 * Spawns anvil on port 8717 with chain id 968, deploys Straws, and seeds:
 * - Draw 1: Joining (3 of 6 slots)
 * - Draw 2: Full, reveals open (2 of 4 revealed)
 * - Draw 3: Awaiting draw (3 of 3 revealed, ready to pull)
 * - Draw 4: Drawn with a winner (2 of 2 revealed, drawn)
 * - Draw 5: Void (only 1 revealed, past revealEnd, drawn -> Void)
 *
 * Usage:
 *   node scripts/local-stack.mjs
 *   npm run dev
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8717;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // (0) Organiser
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // (1) Entrant A
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // (2) Entrant B
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // (3) Entrant C
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // (4) Entrant D
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // (5) Outsider
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--block-time",
    "1",
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Straws.sol/Straws.json", import.meta.url), "utf8"),
);

const deployerWallet = createWalletClient({
  account: accounts[0],
  chain: local,
  transport: http(),
});

const deployHash = await deployerWallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = deployed.contractAddress;
const startBlock = deployed.blockNumber > 1n ? deployed.blockNumber - 1n : 1n;

console.log(`Deployed Straws to ${contractAddress} at block ${deployed.blockNumber}`);

function commitmentFor(id, entrant, secret) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }],
      [BigInt(id), entrant, secret],
    ),
  );
}

const SECRETS = {
  A: "0x1111111111111111111111111111111111111111111111111111111111111111",
  B: "0x2222222222222222222222222222222222222222222222222222222222222222",
  C: "0x3333333333333333333333333333333333333333333333333333333333333333",
  D: "0x4444444444444444444444444444444444444444444444444444444444444444",
};

async function createDraw(creatorAccount, title, slots, joinSecs, revealSecs) {
  const w = createWalletClient({ account: creatorAccount, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "create",
    args: [title, slots, BigInt(joinSecs), BigInt(revealSecs)],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function joinDraw(entrantAccount, id, secret) {
  const commit = commitmentFor(id, entrantAccount.address, secret);
  const w = createWalletClient({ account: entrantAccount, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "join",
    args: [BigInt(id), commit],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function revealDraw(entrantAccount, id, secret) {
  const w = createWalletClient({ account: entrantAccount, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "reveal",
    args: [BigInt(id), secret],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function callDraw(callerAccount, id) {
  const w = createWalletClient({ account: callerAccount, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "draw",
    args: [BigInt(id)],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function increaseTime(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [seconds] });
  await pub.request({ method: "evm_mine", params: [] });
}

console.log("Seeding states...");

// 1. Draw 1: Joining (3 of 6 slots)
console.log("Seeding Draw 1: Joining (3/6 slots)...");
await createDraw(accounts[0], "Who pays for team lunch", 6, 3600, 1800);
await joinDraw(accounts[1], 1, SECRETS.A);
await joinDraw(accounts[2], 1, SECRETS.B);
await joinDraw(accounts[3], 1, SECRETS.C);

// 2. Draw 2: Full, reveals open (2 of 4 revealed)
console.log("Seeding Draw 2: Full, reveals open (2/4 revealed)...");
await createDraw(accounts[0], "Pick the offsite sprint lead", 4, 3600, 1800);
await joinDraw(accounts[1], 2, SECRETS.A);
await joinDraw(accounts[2], 2, SECRETS.B);
await joinDraw(accounts[3], 2, SECRETS.C);
await joinDraw(accounts[4], 2, SECRETS.D); // fills draw -> reveals open immediately
await revealDraw(accounts[1], 2, SECRETS.A);
await revealDraw(accounts[2], 2, SECRETS.B);

// 3. Draw 3: Awaiting draw (3 of 3 revealed)
console.log("Seeding Draw 3: Awaiting draw (3/3 revealed)...");
await createDraw(accounts[0], "Who gets the spare hardware wallet", 3, 3600, 1800);
await joinDraw(accounts[1], 3, SECRETS.A);
await joinDraw(accounts[2], 3, SECRETS.B);
await joinDraw(accounts[3], 3, SECRETS.C); // fills draw
await revealDraw(accounts[1], 3, SECRETS.A);
await revealDraw(accounts[2], 3, SECRETS.B);
await revealDraw(accounts[3], 3, SECRETS.C); // all revealed -> awaiting draw

// 4. Draw 4: Drawn with a winner (2 of 2 revealed and drawn)
console.log("Seeding Draw 4: Drawn with a winner (2/2 revealed, drawn)...");
await createDraw(accounts[0], "First talk at the meetup", 2, 3600, 1800);
await joinDraw(accounts[1], 4, SECRETS.A);
await joinDraw(accounts[2], 4, SECRETS.B); // fills draw
await revealDraw(accounts[1], 4, SECRETS.A);
await revealDraw(accounts[2], 4, SECRETS.B);
await callDraw(accounts[5], 4); // outsider triggers draw

// 5. Draw 5: Void (2 joined, 1 revealed, expired reveal window -> Void)
console.log("Seeding Draw 5: Void...");
await createDraw(accounts[0], "Volunteer for weekend monitoring", 3, 300, 300);
await joinDraw(accounts[1], 5, SECRETS.A);
await joinDraw(accounts[2], 5, SECRETS.B);
// Advance past joinEnd
await increaseTime(305);
// Entrant A reveals, Entrant B does not reveal
await revealDraw(accounts[1], 5, SECRETS.A);
// Advance past revealEnd
await increaseTime(305);
// Outsider calls draw -> revealed < 2 -> Void
await callDraw(accounts[5], 5);

console.log("\n--- Straws Local Stack Ready ---");
console.log(`Contract: ${contractAddress}`);
console.log(`RPC: ${RPC} (chain ${CHAIN_ID})\n`);

console.log("Account Role Table for Manual Verification:");
console.log("----------------------------------------------------------------------------------------");
console.log("| Role       | Acc # | Address                                    | Private Key          |");
console.log("----------------------------------------------------------------------------------------");
console.log(`| Organiser  | 0     | ${accounts[0].address} | ${KEYS[0].slice(0, 10)}... |`);
console.log(`| Entrant A  | 1     | ${accounts[1].address} | ${KEYS[1].slice(0, 10)}... |`);
console.log(`| Entrant B  | 2     | ${accounts[2].address} | ${KEYS[2].slice(0, 10)}... |`);
console.log(`| Entrant C  | 3     | ${accounts[3].address} | ${KEYS[3].slice(0, 10)}... |`);
console.log(`| Entrant D  | 4     | ${accounts[4].address} | ${KEYS[4].slice(0, 10)}... |`);
console.log(`| Outsider   | 5     | ${accounts[5].address} | ${KEYS[5].slice(0, 10)}... |`);
console.log("----------------------------------------------------------------------------------------\n");

console.log("Seeded Draws Table:");
console.log("----------------------------------------------------------------------------------------");
console.log("| ID | Title                             | Slots | Joined | Revealed | State           |");
console.log("----------------------------------------------------------------------------------------");
console.log("| 1  | Who pays for team lunch           | 6     | 3      | 0        | Joining (open)  |");
console.log("| 2  | Pick the offsite sprint lead      | 4     | 4      | 2        | Reveals open    |");
console.log("| 3  | Who gets the spare hardware wallet| 3     | 3      | 3        | Awaiting draw   |");
console.log("| 4  | First talk at the meetup          | 2     | 2      | 2        | Drawn (won)     |");
console.log("| 5  | Volunteer for weekend monitoring  | 3     | 2      | 1        | Void            |");
console.log("----------------------------------------------------------------------------------------\n");

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${startBlock}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local");
