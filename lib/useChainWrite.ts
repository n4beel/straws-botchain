"use client";

import { useCallback } from "react";
import { useWriteContract as useWagmiWriteContract } from "wagmi";
import { activeBotChain } from "@/lib/botchain/chain";

/**
 * `useWriteContract` from wagmi, with every write pinned to the network THIS BUILD runs on.
 *
 * Without a `chainId`, wagmi sends the transaction on whatever network the wallet happens to be on.
 * BOT Chain has two networks (677 and 968) and a contract's address is the same text on both, so a
 * wallet left on the wrong one sends a real transaction to an address with no contract behind it:
 * it succeeds, does nothing, and costs gas. With the chain pinned, wagmi refuses before the wallet
 * even opens (ConnectorChainMismatchError) and `describeError` turns that into a sentence.
 *
 * Use this instead of importing `useWriteContract` from "wagmi" (scripts/check-ui-contract.py fails
 * a project that does).
 */
export function useWriteContract() {
  const w = useWagmiWriteContract();
  const { writeContract: rawWrite, writeContractAsync: rawWriteAsync } = w;
  const writeContract = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((vars: any, opts?: any) => rawWrite({ ...vars, chainId: activeBotChain.id }, opts)) as typeof rawWrite,
    [rawWrite],
  );
  const writeContractAsync = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((vars: any, opts?: any) => rawWriteAsync({ ...vars, chainId: activeBotChain.id }, opts)) as typeof rawWriteAsync,
    [rawWriteAsync],
  );
  return { ...w, writeContract, writeContractAsync };
}
