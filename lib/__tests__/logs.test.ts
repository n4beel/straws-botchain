import { describe, expect, it } from "vitest";
import { getLogsChunked, getLogsAtBlock, type LogClient } from "../logs";
import type { AbiEvent, Address } from "viem";

const dummyEvent: AbiEvent = {
  type: "event",
  name: "Revealed",
  inputs: [],
  anonymous: false,
};
const dummyAddress: Address = "0x1234567890123456789012345678901234567890";

describe("lib/logs", () => {
  it("getLogsChunked fetches logs in chunks", async () => {
    let callCount = 0;
    const client: LogClient = {
      getBlockNumber: async () => 50_000n,
      getLogs: async (params: any) => {
        callCount++;
        return [{ blockNumber: params.fromBlock, transactionHash: "0x1" }];
      },
    };

    const res = await getLogsChunked({
      client,
      address: dummyAddress,
      event: dummyEvent,
      fromBlock: 0n,
      toBlock: 40_000n,
      chunk: 20_000n,
    });

    expect(res.complete).toBe(true);
    expect(res.logs.length).toBe(3);
    expect(callCount).toBe(3);
  });

  it("halves chunk size on error and retries", async () => {
    let callCount = 0;
    const client: LogClient = {
      getBlockNumber: async () => 20_000n,
      getLogs: async (params: any) => {
        callCount++;
        if (BigInt(params.toBlock) - BigInt(params.fromBlock) + 1n > 10_000n) {
          throw new Error("range too large");
        }
        return [];
      },
    };

    const res = await getLogsChunked({
      client,
      address: dummyAddress,
      event: dummyEvent,
      fromBlock: 0n,
      toBlock: 20_000n,
      chunk: 20_000n,
    });

    expect(res.complete).toBe(true);
    expect(callCount).toBeGreaterThan(1);
  });

  it("getLogsAtBlock fetches logs from single block", async () => {
    const client = {
      getLogs: async (params: any) => {
        expect(params.fromBlock).toBe(12345n);
        expect(params.toBlock).toBe(12345n);
        return [{ blockNumber: 12345n }];
      },
    };

    const logs = await getLogsAtBlock(client, dummyAddress, dummyEvent, undefined, 12345n);
    expect(logs.length).toBe(1);
  });
});
