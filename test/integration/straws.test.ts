import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { strawsAbi } from "@/lib/botchain/abi";
import {
  commitmentFor,
  seedFor,
  winnerFrom,
  MIN_SLOTS,
  MAX_SLOTS,
  MIN_JOIN,
  MAX_JOIN,
  MIN_REVEAL,
  MAX_REVEAL,
  MAX_TITLE,
} from "@/lib/straws";
import { getLogsChunked } from "@/lib/logs";

const PORT = 8617;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const KEY_ALICE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_BOB = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_CHARLIE = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const KEY_DAVE = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

const accountAlice = privateKeyToAccount(KEY_ALICE);
const accountBob = privateKeyToAccount(KEY_BOB);
const accountCharlie = privateKeyToAccount(KEY_CHARLIE);
const accountDave = privateKeyToAccount(KEY_DAVE);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let walletAlice: WalletClient;
let walletBob: WalletClient;
let walletCharlie: WalletClient;
let walletDave: WalletClient;
let address: Address;
let deployBlock: bigint;

function revertDetails(err: unknown): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName),
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  try {
    execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
  } catch {}

  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  publicClient = createPublicClient({ chain: local, transport: http(), cacheTime: 0 }) as PublicClient;
  walletAlice = createWalletClient({ account: accountAlice, chain: local, transport: http() });
  walletBob = createWalletClient({ account: accountBob, chain: local, transport: http() });
  walletCharlie = createWalletClient({ account: accountCharlie, chain: local, transport: http() });
  walletDave = createWalletClient({ account: accountDave, chain: local, transport: http() });

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const artifact = JSON.parse(
    readFileSync(
      new URL("../../contracts/out/Straws.sol/Straws.json", import.meta.url),
      "utf8",
    ),
  ) as { bytecode: { object: Hex }; abi: any };

  const hash = await walletAlice.deployContract({
    abi: strawsAbi,
    bytecode: artifact.bytecode.object,
    account: accountAlice,
    chain: local,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  address = receipt.contractAddress!;
  deployBlock = receipt.blockNumber;
});

afterAll(() => {
  if (node && !node.killed) {
    node.kill();
  }
});

async function warpTime(seconds: number) {
  await publicClient.request({ method: "evm_increaseTime" as any, params: [seconds] as any });
  await publicClient.request({ method: "evm_mine" as any, params: [] as any });
}

describe("Straws Integration Suite", () => {
  it("deploys cleanly with 0 draws and matching limits", async () => {
    const drawCount = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "drawCount",
    });
    expect(drawCount).toBe(0n);

    const minSlots = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MIN_SLOTS",
    });
    expect(minSlots).toBe(MIN_SLOTS);

    const maxSlots = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MAX_SLOTS",
    });
    expect(maxSlots).toBe(MAX_SLOTS);

    const minJoin = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MIN_JOIN",
    });
    expect(minJoin).toBe(BigInt(MIN_JOIN));

    const maxJoin = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MAX_JOIN",
    });
    expect(maxJoin).toBe(BigInt(MAX_JOIN));

    const minReveal = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MIN_REVEAL",
    });
    expect(minReveal).toBe(BigInt(MIN_REVEAL));

    const maxReveal = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MAX_REVEAL",
    });
    expect(maxReveal).toBe(BigInt(MAX_REVEAL));

    const maxTitle = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "MAX_TITLE",
    });
    expect(maxTitle).toBe(BigInt(MAX_TITLE));
  });

  it("happy path: full lifecycle with off-chain seed verification", async () => {
    // 1. Alice creates a draw with 3 slots
    const createHash = await walletAlice.writeContract({
      address,
      abi: strawsAbi,
      functionName: "create",
      args: ["Who buys coffee", 3, 3600n, 1800n],
      chain: local,
      account: accountAlice,
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    const drawId = 1n;
    const drawData = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "drawOf",
      args: [drawId],
    });
    expect(drawData.creator.toLowerCase()).toBe(accountAlice.address.toLowerCase());
    expect(drawData.title).toBe("Who buys coffee");
    expect(drawData.slots).toBe(3);
    expect(drawData.joined).toBe(0);

    // 2. Bob, Charlie, Alice join with commitments
    const secretBob: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const secretCharlie: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const secretAlice: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";

    const commitBob = commitmentFor(drawId, accountBob.address, secretBob);
    const commitCharlie = commitmentFor(drawId, accountCharlie.address, secretCharlie);
    const commitAlice = commitmentFor(drawId, accountAlice.address, secretAlice);

    const hashBob = await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [drawId, commitBob],
      chain: local,
      account: accountBob,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashBob });

    const hashCharlie = await walletCharlie.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [drawId, commitCharlie],
      chain: local,
      account: accountCharlie,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashCharlie });

    const hashAlice = await walletAlice.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [drawId, commitAlice],
      chain: local,
      account: accountAlice,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashAlice });

    // 3. Draw is full -> reveals open immediately
    const entrants = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "entrantsOf",
      args: [drawId],
    });
    expect(entrants.length).toBe(3);
    expect(entrants[0].toLowerCase()).toBe(accountBob.address.toLowerCase());
    expect(entrants[1].toLowerCase()).toBe(accountCharlie.address.toLowerCase());
    expect(entrants[2].toLowerCase()).toBe(accountAlice.address.toLowerCase());

    // 4. Entrants reveal
    const revBob = await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [drawId, secretBob],
      chain: local,
      account: accountBob,
    });
    await publicClient.waitForTransactionReceipt({ hash: revBob });

    const revCharlie = await walletCharlie.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [drawId, secretCharlie],
      chain: local,
      account: accountCharlie,
    });
    await publicClient.waitForTransactionReceipt({ hash: revCharlie });

    const revAlice = await walletAlice.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [drawId, secretAlice],
      chain: local,
      account: accountAlice,
    });
    await publicClient.waitForTransactionReceipt({ hash: revAlice });

    // Verify off-chain prediction
    const expectedSeed = seedFor(drawId, [secretBob, secretCharlie, secretAlice]);
    const expectedWinner = winnerFrom(expectedSeed, entrants);

    // 5. Outsider (Dave) calls draw
    const drawTx = await walletDave.writeContract({
      address,
      abi: strawsAbi,
      functionName: "draw",
      args: [drawId],
      chain: local,
      account: accountDave,
    });
    const drawReceipt = await publicClient.waitForTransactionReceipt({ hash: drawTx });
    expect(drawReceipt.status).toBe("success");

    const [isDrawn, winner] = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "winnerOf",
      args: [drawId],
    });
    expect(isDrawn).toBe(true);
    expect(expectedWinner).not.toBeNull();
    expect(winner.toLowerCase()).toBe(expectedWinner!.toLowerCase());
  });

  it("reverts on all 13 contract errors", async () => {
    // 1. TitleTooLong
    const longTitle = "a".repeat(65);
    try {
      await walletAlice.writeContract({
        address,
        abi: strawsAbi,
        functionName: "create",
        args: [longTitle, 4, 3600n, 1800n],
        chain: local,
        account: accountAlice,
      });
      expect.unreachable("expected TitleTooLong");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("TitleTooLong");
    }

    // 2. BadSlots (slots < 2 or slots > 16)
    try {
      await walletAlice.writeContract({
        address,
        abi: strawsAbi,
        functionName: "create",
        args: ["Too few slots", 1, 3600n, 1800n],
        chain: local,
        account: accountAlice,
      });
      expect.unreachable("expected BadSlots");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("BadSlots");
    }

    try {
      await walletAlice.writeContract({
        address,
        abi: strawsAbi,
        functionName: "create",
        args: ["Too many slots", 17, 3600n, 1800n],
        chain: local,
        account: accountAlice,
      });
      expect.unreachable("expected BadSlots");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("BadSlots");
    }

    // 3. BadWindow (joinSecs < 300)
    try {
      await walletAlice.writeContract({
        address,
        abi: strawsAbi,
        functionName: "create",
        args: ["Bad window", 4, 299n, 1800n],
        chain: local,
        account: accountAlice,
      });
      expect.unreachable("expected BadWindow");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("BadWindow");
    }

    // Create a new draw (id 2) for testing join/reveal/draw errors
    const cr2 = await walletAlice.writeContract({
      address,
      abi: strawsAbi,
      functionName: "create",
      args: ["Error testing draw", 2, 3600n, 1800n],
      chain: local,
      account: accountAlice,
    });
    await publicClient.waitForTransactionReceipt({ hash: cr2 });
    const id2 = 2n;

    // 6. ZeroCommitment
    try {
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "join",
        args: [id2, "0x0000000000000000000000000000000000000000000000000000000000000000"],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected ZeroCommitment");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("ZeroCommitment");
    }

    // Bob joins draw 2
    const secBob: Hex = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const commitBob = commitmentFor(id2, accountBob.address, secBob);
    const jb = await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [id2, commitBob],
      chain: local,
      account: accountBob,
    });
    await publicClient.waitForTransactionReceipt({ hash: jb });

    // 5. AlreadyJoined
    try {
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "join",
        args: [id2, commitBob],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected AlreadyJoined");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("AlreadyJoined");
    }

    // 7. NotRevealPhase (Bob tries to reveal while joining is still open and not full)
    try {
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "reveal",
        args: [id2, secBob],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected NotRevealPhase");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NotRevealPhase");
    }

    // Charlie joins draw 2 -> draw becomes full (2/2) -> reveals open
    const secCharlie: Hex = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const commitCharlie = commitmentFor(id2, accountCharlie.address, secCharlie);
    const jc = await walletCharlie.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [id2, commitCharlie],
      chain: local,
      account: accountCharlie,
    });
    await publicClient.waitForTransactionReceipt({ hash: jc });

    // 4. Closed (Dave tries to join now that draw 2 is full)
    try {
      const commitDave = commitmentFor(id2, accountDave.address, secBob);
      await walletDave.writeContract({
        address,
        abi: strawsAbi,
        functionName: "join",
        args: [id2, commitDave],
        chain: local,
        account: accountDave,
      });
      expect.unreachable("expected Closed");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("Closed");
    }

    // 8. NotEntrant (Dave never joined draw 2 and tries to reveal)
    try {
      await walletDave.writeContract({
        address,
        abi: strawsAbi,
        functionName: "reveal",
        args: [id2, secBob],
        chain: local,
        account: accountDave,
      });
      expect.unreachable("expected NotEntrant");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NotEntrant");
    }

    // 10. BadReveal (Bob reveals wrong secret)
    try {
      const wrongSecret: Hex = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "reveal",
        args: [id2, wrongSecret],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected BadReveal");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("BadReveal");
    }

    // Bob reveals correctly
    const rvb = await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [id2, secBob],
      chain: local,
      account: accountBob,
    });
    await publicClient.waitForTransactionReceipt({ hash: rvb });

    // 9. AlreadyRevealed (Bob reveals again)
    try {
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "reveal",
        args: [id2, secBob],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected AlreadyRevealed");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("AlreadyRevealed");
    }

    // 11. TooEarly (Bob revealed, but Charlie hasn't revealed and revealEnd is still in future)
    try {
      await walletDave.writeContract({
        address,
        abi: strawsAbi,
        functionName: "draw",
        args: [id2],
        chain: local,
        account: accountDave,
      });
      expect.unreachable("expected TooEarly");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("TooEarly");
    }

    // Charlie reveals
    const rvc = await walletCharlie.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [id2, secCharlie],
      chain: local,
      account: accountCharlie,
    });
    await publicClient.waitForTransactionReceipt({ hash: rvc });

    // Now all entrants revealed -> draw succeeds
    const dw = await walletDave.writeContract({
      address,
      abi: strawsAbi,
      functionName: "draw",
      args: [id2],
      chain: local,
      account: accountDave,
    });
    await publicClient.waitForTransactionReceipt({ hash: dw });

    // 12. AlreadyDrawn (Draw called again)
    try {
      await walletDave.writeContract({
        address,
        abi: strawsAbi,
        functionName: "draw",
        args: [id2],
        chain: local,
        account: accountDave,
      });
      expect.unreachable("expected AlreadyDrawn");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("AlreadyDrawn");
    }

    // 13. NoSuchDraw (operating on draw 0 or 999)
    try {
      await walletBob.writeContract({
        address,
        abi: strawsAbi,
        functionName: "join",
        args: [999n, commitBob],
        chain: local,
        account: accountBob,
      });
      expect.unreachable("expected NoSuchDraw");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NoSuchDraw");
    }
  });

  it("handles void draw when fewer than 2 reveal", async () => {
    // Create draw 3 with 3 slots, 300s join, 300s reveal
    const cr3 = await walletAlice.writeContract({
      address,
      abi: strawsAbi,
      functionName: "create",
      args: ["Void test draw", 3, 300n, 300n],
      chain: local,
      account: accountAlice,
    });
    await publicClient.waitForTransactionReceipt({ hash: cr3 });
    const id3 = 3n;

    // Bob and Charlie join
    const secBob: Hex = "0x1212121212121212121212121212121212121212121212121212121212121212";
    const secCharlie: Hex = "0x3434343434343434343434343434343434343434343434343434343434343434";
    await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [id3, commitmentFor(id3, accountBob.address, secBob)],
      chain: local,
      account: accountBob,
    });
    await walletCharlie.writeContract({
      address,
      abi: strawsAbi,
      functionName: "join",
      args: [id3, commitmentFor(id3, accountCharlie.address, secCharlie)],
      chain: local,
      account: accountCharlie,
    });

    // Warp past joinEnd
    await warpTime(310);

    // Only Bob reveals; Charlie withholds secret
    await walletBob.writeContract({
      address,
      abi: strawsAbi,
      functionName: "reveal",
      args: [id3, secBob],
      chain: local,
      account: accountBob,
    });

    // Warp past revealEnd
    await warpTime(310);

    // Outsider calls draw
    const tx = await walletDave.writeContract({
      address,
      abi: strawsAbi,
      functionName: "draw",
      args: [id3],
      chain: local,
      account: accountDave,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });

    // Check winnerOf
    const [drawn, winner] = await publicClient.readContract({
      address,
      abi: strawsAbi,
      functionName: "winnerOf",
      args: [id3],
    });
    expect(drawn).toBe(true);
    expect(winner).toBe("0x0000000000000000000000000000000000000000");

    // Check Void event
    const { logs } = await getLogsChunked({
      client: publicClient,
      address,
      event: {
        type: "event",
        name: "Void",
        inputs: [{ indexed: true, name: "id", type: "uint256" }],
      },
      fromBlock: deployBlock,
    });
    const voidLogs = (logs as any[]).filter((l) => l.args?.id === id3);
    expect(voidLogs.length).toBe(1);
  });
});
