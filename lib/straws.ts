import {
  type Address,
  type Hex,
  keccak256,
  encodeAbiParameters,
  bytesToHex,
  isAddress,
  getAddress,
} from "viem";

export const MIN_SLOTS = 2;
export const MAX_SLOTS = 16;
export const MAX_TITLE = 64;
export const MIN_JOIN = 300;
export const MAX_JOIN = 604800;
export const MIN_REVEAL = 300;
export const MAX_REVEAL = 259200;
export const MAX_PAGE = 50;

export interface DrawData {
  id: bigint;
  creator: Address;
  joinEnd: bigint;
  revealEnd: bigint;
  slots: number;
  joined: number;
  revealed: number;
  drawn: boolean;
  winnerIndex: number;
  title: string;
}

export type DrawPhase =
  | "joining"
  | "full"
  | "reveal"
  | "awaiting-draw"
  | "drawn"
  | "void";

/**
 * Derives the canonical commitment hash for taking a straw.
 * Matches Straws.sol: keccak256(abi.encode(id, entrant, secret))
 */
export function commitmentFor(
  id: bigint | number,
  entrant: Address,
  secret: Hex
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "id", type: "uint256" },
        { name: "entrant", type: "address" },
        { name: "secret", type: "bytes32" },
      ],
      [BigInt(id), entrant, secret]
    )
  );
}

/**
 * Generates 32 cryptographically secure random bytes as Hex.
 */
export function newSecret(): Hex {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  // Fallback for non-browser environments
  const { randomBytes } = require("crypto");
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

/**
 * Derives the final random seed from revealed secrets in canonical join order.
 * Matches Straws.sol: keccak256(abi.encode(id, revealedSecrets))
 */
export function seedFor(id: bigint | number, secrets: readonly Hex[] | Hex[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "id", type: "uint256" },
        { name: "secrets", type: "bytes32[]" },
      ],
      [BigInt(id), [...secrets]]
    )
  );
}

/**
 * Selects the winner from revealed addresses given a deterministic seed.
 * Matches Straws.sol: winningPos = seed % revealedCount
 */
export function winnerFrom(
  seed: Hex,
  revealedAddresses: readonly Address[] | Address[]
): Address | null {
  if (!revealedAddresses || revealedAddresses.length === 0) return null;
  const pos = Number(BigInt(seed) % BigInt(revealedAddresses.length));
  return revealedAddresses[pos];
}

/**
 * Determines the lifecycle phase of a draw at a given Unix timestamp in seconds.
 */
export function phaseAt(
  draw: {
    joinEnd: bigint | number;
    revealEnd: bigint | number;
    slots: number;
    joined: number;
    revealed: number;
    drawn: boolean;
  },
  nowSecs: number
): DrawPhase {
  if (draw.drawn) {
    return draw.revealed < 2 ? "void" : "drawn";
  }

  const jEnd = Number(draw.joinEnd);
  const rEnd = Number(draw.revealEnd);

  // If reveal window has expired or everyone joined has already revealed (at least 2)
  if (nowSecs >= rEnd || (draw.revealed === draw.joined && draw.joined >= 2)) {
    return "awaiting-draw";
  }

  // If join window closed or draw filled to capacity
  if (nowSecs >= jEnd || draw.joined >= draw.slots) {
    return "reveal";
  }

  if (draw.joined === draw.slots) {
    return "full";
  }

  return "joining";
}

export interface StrawGeometry {
  index: number;
  angle: number; // degrees from vertical
  length: number; // straw visual height in px
  isJoined: boolean;
  isWinner: boolean;
}

/**
 * Computes pure fan geometry for 2..16 slots across a 120-degree arc.
 * Center straw points straight up (0°).
 */
export function fanGeometry(
  slots: number,
  joined: number,
  winnerIndex?: number
): StrawGeometry[] {
  const boundedSlots = Math.max(2, Math.min(16, slots));
  const results: StrawGeometry[] = [];

  // Arc ranges from -60° to +60°
  const totalArc = 120;
  const startAngle = -60;
  const step = totalArc / (boundedSlots - 1);

  for (let i = 0; i < boundedSlots; i++) {
    const angle = startAngle + step * i;
    // Deterministic organic length variation: base 160px + slight variance
    const length = 160 + ((i * 7) % 15) - 7;
    const isJoined = i < joined;
    const isWinner = winnerIndex !== undefined && winnerIndex === i;

    results.push({
      index: i,
      angle: Number(angle.toFixed(2)),
      length,
      isJoined,
      isWinner,
    });
  }

  return results;
}

export interface StoredSecret {
  drawId: string;
  entrant: Address;
  secret: Hex;
  savedAt: number;
}

const STORAGE_KEY = "straws:saved_secrets";
let memoryStore: StoredSecret[] = [];

/**
 * LocalStorage manager for participant secrets with backup export/import.
 */
export const secretStore = {
  saveSecret(drawId: bigint | number, entrant: Address, secret: Hex): boolean {
    const normalizedEntrant = getAddress(entrant);
    const entry: StoredSecret = {
      drawId: String(drawId),
      entrant: normalizedEntrant,
      secret,
      savedAt: Date.now(),
    };

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const list = this.listSecrets();
        const existingIdx = list.findIndex(
          (s) =>
            s.drawId === String(drawId) &&
            getAddress(s.entrant) === normalizedEntrant
        );

        if (existingIdx >= 0) {
          list[existingIdx] = entry;
        } else {
          list.push(entry);
        }

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        return true;
      }
    } catch {
      // localStorage failed or disabled
    }

    const idx = memoryStore.findIndex(
      (s) => s.drawId === String(drawId) && getAddress(s.entrant) === normalizedEntrant
    );
    if (idx >= 0) memoryStore[idx] = entry;
    else memoryStore.push(entry);
    return true;
  },

  getSecret(drawId: bigint | number, entrant: Address): Hex | null {
    const normalizedEntrant = getAddress(entrant);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const list = this.listSecrets();
        const found = list.find(
          (s) =>
            s.drawId === String(drawId) &&
            getAddress(s.entrant) === normalizedEntrant
        );
        if (found) return found.secret;
      }
    } catch {
      // fallback to memory
    }
    const memFound = memoryStore.find(
      (s) => s.drawId === String(drawId) && getAddress(s.entrant) === normalizedEntrant
    );
    return memFound ? memFound.secret : null;
  },

  hasSecret(drawId: bigint | number, entrant: Address): boolean {
    return this.getSecret(drawId, entrant) !== null;
  },

  listSecrets(): StoredSecret[] {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.filter((item) => item.drawId && item.entrant && item.secret);
          }
        }
      }
    } catch {
      // fallback to memory
    }
    return [...memoryStore];
  },

  clear(): void {
    memoryStore = [];
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  },

  exportBackupJson(): string {
    const secrets = this.listSecrets();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), secrets }, null, 2);
  },

  importBackupJson(jsonString: string): number {
    try {
      const parsed = JSON.parse(jsonString);
      const secrets = Array.isArray(parsed.secrets) ? parsed.secrets : parsed;
      if (!Array.isArray(secrets)) return 0;

      let imported = 0;
      for (const item of secrets) {
        if (item.drawId && isAddress(item.entrant) && item.secret) {
          if (this.saveSecret(item.drawId, item.entrant, item.secret)) {
            imported++;
          }
        }
      }
      return imported;
    } catch {
      return 0;
    }
  },
};

export function formatShortAddress(addr?: string): string {
  if (!addr || !isAddress(addr)) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
