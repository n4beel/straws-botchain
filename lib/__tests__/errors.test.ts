import { describe, it, expect } from "vitest";
import { describeError, REVERT_MESSAGES } from "../errors";

describe("Straws Errors Translation", () => {
  it("translates every contract revert correctly", () => {
    for (const [code, expected] of Object.entries(REVERT_MESSAGES)) {
      const err = new Error(`Contract execution reverted with reason: ${code}()`);
      expect(describeError(err)).toBe(expected);
    }
  });

  it("translates user rejection error", () => {
    const err = new Error("User rejected the request.");
    expect(describeError(err)).toBe("Transaction was cancelled in your wallet.");
  });

  it("translates insufficient funds error", () => {
    const err = new Error("insufficient funds for gas * price + value");
    expect(describeError(err)).toBe("Insufficient BOT balance for transaction gas.");
  });

  it("handles empty or unknown errors safely", () => {
    expect(describeError(null)).toBe("An unexpected error occurred.");
    expect(describeError("Network glitch")).toBe("Network glitch");
  });
});
