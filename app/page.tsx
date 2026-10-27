"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { type Address } from "viem";
import { strawsAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import {
  phaseAt,
  formatShortAddress,
  secretStore,
  type DrawData,
  type DrawPhase,
} from "@/lib/straws";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Fan from "@/components/straws/Fan";
import LimitsBanner from "@/components/straws/LimitsBanner";

export default function HomePage() {
  const { address: userAddress, isConnected } = useAccount();
  const deployment = getDeployment(activeBotChain.id);
  const deployed = isDeployed(activeBotChain.id);

  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [filter, setFilter] = useState<"all" | "mine">("all");

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // 1. Read drawCount
  const { data: rawDrawCount } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "drawCount",
    query: {
      enabled: deployed,
      refetchInterval: 6_000,
    },
  });

  // 2. Read latest draws (up to 24 draws)
  const { data: rawLatestDraws, isLoading: isLatestLoading } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "latest",
    args: [0n, 24n],
    query: {
      enabled: deployed,
      refetchInterval: 6_000,
    },
  });

  // Read local saved secrets to know which draws user joined locally
  const localSecretDrawIds = useMemo(() => {
    return new Set(secretStore.listSecrets().map((s) => s.drawId));
  }, []);

  const draws = useMemo(() => {
    if (!rawLatestDraws) return [];
    return rawLatestDraws.map((d: any) => ({
      id: d.id,
      creator: d.creator as Address,
      joinEnd: d.joinEnd,
      revealEnd: d.revealEnd,
      slots: d.slots,
      joined: d.joined,
      revealed: d.revealed,
      drawn: d.drawn,
      winnerIndex: d.winnerIndex,
      title: d.title,
      winner: d.winner as Address,
    }));
  }, [rawLatestDraws]);

  const userDraws = useMemo(() => {
    if (!userAddress) return [];
    return draws.filter(
      (d) =>
        d.creator.toLowerCase() === userAddress.toLowerCase() ||
        localSecretDrawIds.has(String(d.id)),
    );
  }, [draws, userAddress, localSecretDrawIds]);

  const displayedDraws = filter === "mine" ? userDraws : draws;

  return (
    <div className="flex flex-col gap-10 max-w-5xl mx-auto">
      {/* Hero */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-6 border-b border-[var(--border-subtle)]">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs font-semibold text-[var(--accent)] mb-3 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            Multi-Party Randomness on BOT Chain
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
            Draw straws without a referee.
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-muted)] mt-2 leading-relaxed">
            A neutral pick for friends, teams, and communities: who pays, who goes first, who gets the spare ticket. All entrants seal random secrets; the winner is derived mathematically from all revealed straws. No single person controls the result.
          </p>

          <div className="flex items-center gap-3 mt-6">
            <Link href="/new">
              <Button size="lg" variant="primary">
                New Draw
              </Button>
            </Link>
            <Link href="/me">
              <Button size="lg" variant="secondary">
                My Secrets
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero Visual: Decorative Balanced Fan */}
        <div className="hidden sm:flex flex-col items-center justify-center p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-xs">
          <Fan slots={6} joined={4} size="md" />
          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-2">
            radiating straws · 120° arc
          </div>
        </div>
      </section>

      {/* Main Limits / Honest Contract block on main screen */}
      <LimitsBanner />

      {/* Public Fans Gallery Section */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              Active & Recent Fans
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Each draw is represented as a fanned set of straws. Click any fan to participate or view results.
            </p>
          </div>

          {isConnected && (
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs">
              <button
                onClick={() => setFilter("all")}
                className={[
                  "px-3 py-1 rounded-md font-medium transition-colors",
                  filter === "all"
                    ? "bg-[var(--bg-base)] text-[var(--text-primary)] font-semibold shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                All Fans ({draws.length})
              </button>
              <button
                onClick={() => setFilter("mine")}
                className={[
                  "px-3 py-1 rounded-md font-medium transition-colors",
                  filter === "mine"
                    ? "bg-[var(--bg-base)] text-[var(--text-primary)] font-semibold shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                Your Fans ({userDraws.length})
              </button>
            </div>
          )}
        </div>

        {!deployed ? (
          <Panel variant="parchment" className="py-10 text-center">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Network Not Deployed
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Please connect to a supported BOT Chain testnet or local stack node.
            </p>
          </Panel>
        ) : isLatestLoading && draws.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
              />
            ))}
          </div>
        ) : displayedDraws.length === 0 ? (
          <Panel variant="parchment" className="py-12 text-center">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {filter === "mine" ? "No draws found for your address" : "No draws yet"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {filter === "mine"
                ? "You haven't created or joined any draws yet on this browser."
                : "Create the first draw to get the straws fanning."}
            </p>
            <Link href="/new" className="mt-5 inline-block">
              <Button variant="primary" size="md">
                Create First Draw
              </Button>
            </Link>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {displayedDraws.map((d) => {
              const phase: DrawPhase = phaseAt(d, now);
              const isVoid =
                d.drawn && (!d.winner || d.winner === "0x0000000000000000000000000000000000000000");

              return (
                <Link
                  key={String(d.id)}
                  href={`/draw/${d.id}`}
                  className="group block no-underline focus:outline-none"
                >
                  <Panel
                    variant="parchment"
                    className="flex flex-col items-center justify-between h-full transition-all group-hover:border-[var(--accent)] group-hover:shadow-md cursor-pointer"
                  >
                    <div className="w-full flex items-center justify-between text-xs font-mono mb-2">
                      <span className="text-[var(--text-muted)]">#{String(d.id)}</span>
                      <span
                        className={[
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          phase === "joining"
                            ? "bg-[var(--bg-base)] text-[var(--accent)] border border-[var(--accent)]"
                            : phase === "full" || phase === "reveal"
                            ? "bg-[var(--bg-base)] text-[var(--warning)] border border-[var(--warning)]"
                            : isVoid
                            ? "bg-[var(--bg-base)] text-[var(--danger)] border border-[var(--danger)]"
                            : phase === "drawn"
                            ? "bg-[var(--bg-base)] text-[var(--success)] border border-[var(--success)]"
                            : "bg-[var(--bg-base)] text-[var(--text-muted)]",
                        ].join(" ")}
                      >
                        {isVoid ? "Void" : phase}
                      </span>
                    </div>

                    <h3 className="w-full text-center text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate mb-1">
                      {d.title}
                    </h3>

                    {/* Small Fan Visual */}
                    <div className="py-2">
                      <Fan
                        slots={d.slots}
                        joined={d.joined}
                        winnerIndex={d.winnerIndex}
                        drawn={d.drawn && !isVoid}
                        size="sm"
                      />
                    </div>

                    <div className="w-full flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2.5 mt-2">
                      <span>{d.joined}/{d.slots} taken</span>
                      <span>
                        {d.drawn
                          ? isVoid
                            ? "Void"
                            : `Winner ${formatShortAddress(d.winner)}`
                          : phase === "joining"
                          ? `${Math.max(0, Number(d.joinEnd) - now)}s left`
                          : `${d.revealed}/${d.joined} shown`}
                      </span>
                    </div>
                  </Panel>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
