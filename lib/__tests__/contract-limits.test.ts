import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as limits from "../straws";

const SRC = join(__dirname, "..", "..", "contracts", "src");

function solidityConstants(): Map<string, bigint> {
  const found = new Map<string, bigint>();
  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".sol"))) {
    const src = readFileSync(join(SRC, file), "utf8");
    for (const m of src.matchAll(/constant\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;/g)) {
      found.set(m[1], BigInt(m[2]));
    }
  }
  return found;
}

describe("the contract's limits and this app's copy of them", () => {
  const onChain = solidityConstants();

  it("found constants in the contract to check against", () => {
    expect(onChain.size).toBeGreaterThan(0);
  });

  it("agrees on every limit both sides declare", () => {
    const declared = limits as unknown as Record<string, number>;
    const shared = [...onChain.keys()].filter((name) => typeof declared[name] === "number");

    expect(
      shared.length,
      "no shared constant names — has one side been renamed?",
    ).toBeGreaterThan(0);

    const disagreements = shared
      .filter((name) => BigInt(declared[name]) !== onChain.get(name))
      .map(
        (name) =>
          name + ": contract says " + onChain.get(name) + ", this app says " + declared[name],
      );

    expect(disagreements.join("\n")).toBe("");
  });
});
