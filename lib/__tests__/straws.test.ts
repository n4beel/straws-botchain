import { describe, it, expect, beforeEach } from "vitest";
import {
  commitmentFor,
  newSecret,
  seedFor,
  winnerFrom,
  phaseAt,
  fanGeometry,
  secretStore,
  formatShortAddress,
} from "../straws";
import type { Address, Hex } from "viem";

describe("Straws Library", () => {
  const alice: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const bob: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const charlie: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  const secret1: Hex = "0x0000000000000000000000000000000000000000000000000000000000001111";
  const secret2: Hex = "0x0000000000000000000000000000000000000000000000000000000000002222";
  const secret3: Hex = "0x0000000000000000000000000000000000000000000000000000000000003333";

  describe("commitmentFor", () => {
    it("generates deterministic 32-byte hex commitment matching ABI encoding", () => {
      const commit = commitmentFor(1, alice, secret1);
      expect(commit).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(commitmentFor(1, alice, secret1)).toBe(commit);
    });

    it("changes when id, entrant, or secret changes", () => {
      const c1 = commitmentFor(1, alice, secret1);
      const c2 = commitmentFor(2, alice, secret1);
      const c3 = commitmentFor(1, bob, secret1);
      const c4 = commitmentFor(1, alice, secret2);

      expect(c1).not.toBe(c2);
      expect(c1).not.toBe(c3);
      expect(c1).not.toBe(c4);
    });
  });

  describe("newSecret", () => {
    it("generates 32-byte hex string with high entropy", () => {
      const s1 = newSecret();
      const s2 = newSecret();
      expect(s1).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(s2).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(s1).not.toBe(s2);
    });
  });

  describe("seedFor & winnerFrom", () => {
    it("derives deterministic seed for revealed secrets array", () => {
      const seed = seedFor(1, [secret1, secret2, secret3]);
      expect(seed).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(seedFor(1, [secret1, secret2, secret3])).toBe(seed);
    });

    it("is order-dependent matching on-chain join order", () => {
      const seedA = seedFor(1, [secret1, secret2]);
      const seedB = seedFor(1, [secret2, secret1]);
      expect(seedA).not.toBe(seedB);
    });

    it("selects winner deterministically from revealed addresses", () => {
      const revealed = [alice, bob, charlie];
      const seed = seedFor(1, [secret1, secret2, secret3]);
      const winner = winnerFrom(seed, revealed);
      expect(revealed).toContain(winner);

      const expectedIndex = Number(BigInt(seed) % 3n);
      expect(winner).toBe(revealed[expectedIndex]);
    });

    it("returns null if no revealed addresses provided", () => {
      expect(winnerFrom(secret1, [])).toBeNull();
    });
  });

  describe("phaseAt", () => {
    const base = {
      joinEnd: 1000n,
      revealEnd: 2000n,
      slots: 4,
      joined: 2,
      revealed: 0,
      drawn: false,
    };

    it("returns joining when within join window and not full", () => {
      expect(phaseAt(base, 500)).toBe("joining");
    });

    it("returns reveal when join window expires", () => {
      expect(phaseAt(base, 1000)).toBe("reveal");
      expect(phaseAt(base, 1500)).toBe("reveal");
    });

    it("returns reveal early when full even before joinEnd", () => {
      expect(phaseAt({ ...base, joined: 4 }, 500)).toBe("reveal");
    });

    it("returns awaiting-draw when revealEnd passes", () => {
      expect(phaseAt(base, 2000)).toBe("awaiting-draw");
      expect(phaseAt(base, 2500)).toBe("awaiting-draw");
    });

    it("returns awaiting-draw early if all joined entrants revealed", () => {
      expect(phaseAt({ ...base, joined: 3, revealed: 3 }, 1200)).toBe("awaiting-draw");
    });

    it("returns drawn when drawn is true with >= 2 reveals", () => {
      expect(phaseAt({ ...base, revealed: 2, drawn: true }, 2500)).toBe("drawn");
    });

    it("returns void when drawn is true with < 2 reveals", () => {
      expect(phaseAt({ ...base, revealed: 1, drawn: true }, 2500)).toBe("void");
      expect(phaseAt({ ...base, revealed: 0, drawn: true }, 2500)).toBe("void");
    });
  });

  describe("fanGeometry", () => {
    it("computes 120-degree fan centered at 0 degrees", () => {
      const geo = fanGeometry(3, 2);
      expect(geo).toHaveLength(3);
      expect(geo[0].angle).toBe(-60);
      expect(geo[1].angle).toBe(0);
      expect(geo[2].angle).toBe(60);

      expect(geo[0].isJoined).toBe(true);
      expect(geo[1].isJoined).toBe(true);
      expect(geo[2].isJoined).toBe(false);
    });

    it("clamps slots between 2 and 16", () => {
      expect(fanGeometry(1, 0)).toHaveLength(2);
      expect(fanGeometry(20, 0)).toHaveLength(16);
    });

    it("highlights winning straw", () => {
      const geo = fanGeometry(4, 4, 2);
      expect(geo[2].isWinner).toBe(true);
      expect(geo[0].isWinner).toBe(false);
      expect(geo[1].isWinner).toBe(false);
      expect(geo[3].isWinner).toBe(false);
    });
  });

  describe("secretStore", () => {
    beforeEach(() => {
      secretStore.clear();
    });

    it("saves and retrieves entrant secrets", () => {
      const ok = secretStore.saveSecret(1, alice, secret1);
      expect(ok).toBe(true);
      expect(secretStore.hasSecret(1, alice)).toBe(true);
      expect(secretStore.getSecret(1, alice)).toBe(secret1);
      expect(secretStore.getSecret(1, bob)).toBeNull();
    });

    it("exports and imports backup JSON correctly", () => {
      secretStore.saveSecret(1, alice, secret1);
      secretStore.saveSecret(2, bob, secret2);

      const json = secretStore.exportBackupJson();
      expect(json).toContain(alice);
      expect(json).toContain(bob);

      // Clear and re-import
      secretStore.clear();
      expect(secretStore.hasSecret(1, alice)).toBe(false);

      const count = secretStore.importBackupJson(json);
      expect(count).toBe(2);
      expect(secretStore.getSecret(1, alice)).toBe(secret1);
      expect(secretStore.getSecret(2, bob)).toBe(secret2);
    });
  });

  describe("formatShortAddress", () => {
    it("formats valid addresses", () => {
      expect(formatShortAddress(alice)).toBe("0xf39F…2266");
    });

    it("handles invalid inputs safely", () => {
      expect(formatShortAddress(undefined)).toBe("—");
      expect(formatShortAddress("not-an-address")).toBe("—");
    });
  });
});
