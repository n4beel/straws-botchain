"use client";

import { useState } from "react";
import { type Address, type Hex } from "viem";
import { formatShortAddress } from "@/lib/straws";

export interface SeedRecipeProps {
  drawId: bigint | number;
  revealedEntrants: readonly Address[] | Address[];
  revealedSecrets: readonly Hex[] | Hex[];
  derivedSeed?: Hex;
  winnerAddress?: Address;
  className?: string;
}

export default function SeedRecipe({
  drawId,
  revealedEntrants,
  revealedSecrets,
  derivedSeed,
  winnerAddress,
  className = "",
}: SeedRecipeProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const revealedCount = revealedEntrants.length;
  const winnerIndex =
    derivedSeed && revealedCount > 0
      ? Number(BigInt(derivedSeed) % BigInt(revealedCount))
      : undefined;

  return (
    <div
      className={[
        "rounded-xl p-4 sm:p-5 border bg-[var(--bg-surface)] border-[var(--border-default)]",
        className,
      ].join(" ")}
      style={{ boxShadow: "0 2px 8px var(--straw-shadow)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3 border-b border-[var(--border-subtle)] pb-2.5">
        <div>
          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Deterministic Randomness Recipe
          </h4>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Verified on-chain via multi-party commit-reveal
          </p>
        </div>
        {derivedSeed && (
          <button
            onClick={() => handleCopy(derivedSeed, "seed")}
            className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] underline"
          >
            {copied === "seed" ? "Copied!" : "Copy seed"}
          </button>
        )}
      </div>

      {/* Formulas */}
      <div className="space-y-2 mb-4 text-xs font-mono bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-subtle)]">
        <div className="text-[var(--text-muted)]">
          # 1. Seed formula
        </div>
        <div className="text-[var(--text-primary)] break-all">
          seed = keccak256(abi.encode(uint256({String(drawId)}), bytes32[] secrets))
        </div>
        {derivedSeed && (
          <div className="text-[var(--accent)] font-semibold break-all pt-1">
            = {derivedSeed}
          </div>
        )}

        <div className="text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
          # 2. Winner selection
        </div>
        <div className="text-[var(--text-primary)]">
          winningIndex = seed % revealedCount
          {winnerIndex !== undefined && (
            <span className="text-[var(--accent)] font-semibold">
              {" "}
              = {winnerIndex} ({formatShortAddress(revealedEntrants[winnerIndex])})
            </span>
          )}
        </div>
      </div>

      {/* Revealed Entrants and Secrets Table */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-[var(--text-primary)]">
          Revealed Inputs ({revealedCount} total in join order):
        </div>
        {revealedCount === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">
            No secrets revealed yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {revealedEntrants.map((entrant, idx) => {
              const secret = revealedSecrets[idx];
              const isWinner = winnerAddress && entrant.toLowerCase() === winnerAddress.toLowerCase();

              return (
                <div
                  key={`${entrant}-${idx}`}
                  className={[
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 p-2 rounded-md text-xs font-mono border",
                    isWinner
                      ? "bg-[var(--bg-elevated)] border-[var(--accent)] text-[var(--text-primary)] font-semibold"
                      : "bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-secondary)]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-[var(--text-muted)]">#{idx}</span>
                    <span className="text-[var(--text-primary)]">{formatShortAddress(entrant)}</span>
                    {isWinner && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--accent)] text-[var(--accent-ink)] font-sans uppercase">
                        Winner
                      </span>
                    )}
                  </div>
                  {secret && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] truncate max-w-full sm:max-w-[240px]">
                      <span className="truncate">{secret}</span>
                      <button
                        onClick={() => handleCopy(secret, `sec-${idx}`)}
                        className="text-[10px] hover:text-[var(--text-primary)]"
                        title="Copy secret"
                      >
                        {copied === `sec-${idx}` ? "✓" : "📋"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
