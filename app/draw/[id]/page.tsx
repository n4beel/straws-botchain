"use client";

import { use, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { type Address, type Hex } from "viem";
import { strawsAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import {
  phaseAt,
  commitmentFor,
  newSecret,
  secretStore,
  isStorageAvailable,
  formatShortAddress,
  type DrawData,
  type DrawPhase,
} from "@/lib/straws";
import { describeContractError } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Fan from "@/components/straws/Fan";
import StepStrip from "@/components/straws/StepStrip";
import LimitsBanner from "@/components/straws/LimitsBanner";
import SeedRecipe from "@/components/straws/SeedRecipe";
import { useToast } from "@/components/ui/Toast";

export default function DrawPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = use(paramsPromise);
  const drawId = BigInt(params.id);

  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result: wagmi memoises the client per config
  const { show: toast } = useToast();

  const deployment = getDeployment(activeBotChain.id);
  const deployed = isDeployed(activeBotChain.id);

  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [submitting, setSubmitting] = useState(false);
  const [manualSecret, setManualSecret] = useState<string>("");
  const [showManualSecret, setShowManualSecret] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadOfferSecret, setDownloadOfferSecret] = useState<Hex | null>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Read drawOf(drawId)
  const {
    data: rawDraw,
    refetch: refetchDraw,
    isLoading: isDrawLoading,
  } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "drawOf",
    args: [drawId],
    query: {
      enabled: deployed && drawId > 0n,
      refetchInterval: 4_000,
    },
  });

  // 2. Read entrantsOf(drawId)
  const { data: rawEntrants, refetch: refetchEntrants } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "entrantsOf",
    args: [drawId],
    query: {
      enabled: deployed && drawId > 0n,
      refetchInterval: 4_000,
    },
  });

  // 3. Read winnerOf(drawId)
  const { data: rawWinner, refetch: refetchWinner } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "winnerOf",
    args: [drawId],
    query: {
      enabled: deployed && drawId > 0n,
      refetchInterval: 4_000,
    },
  });

  const { writeContractAsync } = useWriteContract();

  const drawData: DrawData | null = useMemo(() => {
    if (!rawDraw) return null;
    return {
      id: drawId,
      creator: rawDraw.creator,
      joinEnd: rawDraw.joinEnd,
      revealEnd: rawDraw.revealEnd,
      slots: rawDraw.slots,
      joined: rawDraw.joined,
      revealed: rawDraw.revealed,
      drawn: rawDraw.drawn,
      winnerIndex: rawDraw.winnerIndex,
      title: rawDraw.title,
    };
  }, [rawDraw, drawId]);

  const entrants: readonly Address[] = useMemo(() => {
    return rawEntrants ?? [];
  }, [rawEntrants]);

  const phase: DrawPhase = useMemo(() => {
    if (!drawData) return "joining";
    return phaseAt(drawData, now);
  }, [drawData, now]);

  const isWinnerDrawn = rawWinner ? rawWinner[0] : false;
  const winnerAddress: Address | undefined = rawWinner ? rawWinner[1] : undefined;
  const isVoid = drawData?.drawn && (!winnerAddress || winnerAddress === "0x0000000000000000000000000000000000000000");

  // Check user participation
  const isUserEntrant = useMemo(() => {
    if (!userAddress || entrants.length === 0) return false;
    return entrants.some((e) => e.toLowerCase() === userAddress.toLowerCase());
  }, [userAddress, entrants]);

  // Read whether user has revealed
  const { data: userHasRevealed, refetch: refetchHasRevealed } = useReadContract({
    address: deployment.address,
    abi: strawsAbi,
    functionName: "hasRevealed",
    args: userAddress ? [drawId, userAddress] : undefined,
    query: {
      enabled: deployed && Boolean(userAddress) && isUserEntrant,
      refetchInterval: 4_000,
    },
  });

  // Fetch secrets of all entrants for off-chain verification and SeedRecipe
  const [revealedSecretsList, setRevealedSecretsList] = useState<Hex[]>([]);
  const [revealedEntrantsList, setRevealedEntrantsList] = useState<Address[]>([]);

  useEffect(() => {
    if (!publicClient || !deployed || !drawData || entrants.length === 0) return;

    let cancelled = false;
    async function loadRevealed() {
      const secrets: Hex[] = [];
      const revealedEnts: Address[] = [];

      for (const ent of entrants) {
        try {
          const sec = await publicClient!.readContract({
            address: deployment.address,
            abi: strawsAbi,
            functionName: "secretOf",
            args: [drawId, ent],
          });
          if (sec && sec !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            secrets.push(sec);
            revealedEnts.push(ent);
          }
        } catch {}
      }

      if (!cancelled) {
        setRevealedSecretsList(secrets);
        setRevealedEntrantsList(revealedEnts);
      }
    }

    loadRevealed();
    return () => {
      cancelled = true;
    };
  }, [publicClient, deployed, drawData, entrants, drawId, drawData?.revealed]);

  // Stored secret for this draw if available
  const storedSecret = useMemo(() => {
    if (!userAddress) return null;
    return secretStore.getSecret(drawId, userAddress);
  }, [drawId, userAddress]);

  // Download backup handler
  const handleDownloadSecret = (sec: Hex) => {
    const backupData = {
      drawId: String(drawId),
      drawTitle: drawData?.title ?? "",
      entrant: userAddress,
      secret: sec,
      exportedAt: new Date().toISOString(),
      network: activeBotChain.name,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `straws-secret-draw-${drawId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Secret Downloaded",
      description: "Keep this file safe until the reveal phase.",
    });
  };

  // Join Action
  const handleJoin = async () => {
    if (!deployed || !userAddress) return;
    setErrorMsg(null);

    // 1. Check storage availability
    if (!isStorageAvailable()) {
      setErrorMsg(
        "LocalStorage is disabled or unavailable. A sealed secret must be saved locally before taking a straw so you can reveal it later.",
      );
      toast({
        title: "Storage Unavailable",
        description: "Cannot take a straw without local storage enabled.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // 2. Generate new random 32 bytes secret
      const sec = newSecret();
      setDownloadOfferSecret(sec);

      // 3. Compute commitment
      const commit = commitmentFor(drawId, userAddress, sec);

      // 4. Save to secret store
      secretStore.saveSecret(drawId, userAddress, sec);

      toast({
        title: "Sealing Straw...",
        description: "Please confirm the transaction in your wallet.",
      });

      // 5. Send transaction
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: strawsAbi,
        functionName: "join",
        args: [drawId, commit],
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast({
        title: "Straw Taken!",
        description: "Your sealed straw has been joined to the draw.",
      });

      refetchDraw();
      refetchEntrants();
    } catch (err: any) {
      const desc = describeContractError(err);
      setErrorMsg(desc);
      toast({
        title: "Could Not Join",
        description: desc,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Reveal Action
  const handleReveal = async (secToReveal: Hex) => {
    if (!deployed || !userAddress) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      toast({
        title: "Revealing Straw...",
        description: "Confirm the transaction in your wallet.",
      });

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: strawsAbi,
        functionName: "reveal",
        args: [drawId, secToReveal],
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast({
        title: "Straw Revealed!",
        description: "Your secret has been published on-chain.",
      });

      refetchDraw();
      refetchHasRevealed();
    } catch (err: any) {
      const desc = describeContractError(err);
      setErrorMsg(desc);
      toast({
        title: "Reveal Failed",
        description: desc,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Draw Action
  const handleDraw = async () => {
    if (!deployed) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      toast({
        title: "Pulling Straws...",
        description: "Calling draw on-chain to determine the outcome...",
      });

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: strawsAbi,
        functionName: "draw",
        args: [drawId],
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast({
        title: "Draw Concluded!",
        description: "The straws have been drawn.",
      });

      refetchDraw();
      refetchWinner();
    } catch (err: any) {
      const desc = describeContractError(err);
      setErrorMsg(desc);
      toast({
        title: "Draw Execution Failed",
        description: desc,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!deployed) {
    return (
      <Panel variant="parchment" className="max-w-lg mx-auto text-center py-10">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Contract Not Deployed</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Straws is not currently configured on this network ({activeBotChain.name}).
        </p>
      </Panel>
    );
  }

  if (isDrawLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-[var(--text-muted)]">Loading draw #{String(drawId)}...</p>
      </div>
    );
  }

  if (!drawData) {
    return (
      <Panel variant="parchment" className="max-w-lg mx-auto text-center py-12">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">No Such Draw</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Draw #{String(drawId)} does not exist.
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="secondary">Back to all draws</Button>
        </Link>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/"
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              ← All draws
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-xs font-mono text-[var(--accent)] font-semibold">
              Draw #{String(drawId)}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {drawData.title}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
            Organised by {formatShortAddress(drawData.creator)} · {drawData.slots} slots
          </p>
        </div>

        {/* Phase Pill */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={[
              "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border",
              phase === "joining"
                ? "bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]"
                : phase === "full" || phase === "reveal"
                ? "bg-[var(--bg-surface)] text-[var(--warning)] border-[var(--warning)]"
                : phase === "awaiting-draw"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)]"
                : isVoid
                ? "bg-[var(--bg-surface)] text-[var(--danger)] border-[var(--danger)]"
                : "bg-[var(--bg-surface)] text-[var(--success)] border-[var(--success)]",
            ].join(" ")}
          >
            {isVoid ? "Void" : phase === "drawn" ? "Concluded" : phase}
          </span>
        </div>
      </div>

      {/* Step Strip */}
      <StepStrip phase={phase} />

      {/* Primary Visual: THE FAN */}
      <Panel variant="parchment" className="flex flex-col items-center py-6 sm:py-8">
        <div className="w-full flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-2 px-2">
          <span>
            {drawData.joined}/{drawData.slots} STRAWS TAKEN
          </span>
          <span>
            {drawData.revealed}/{drawData.joined} SHOWN
          </span>
        </div>

        <Fan
          slots={drawData.slots}
          joined={drawData.joined}
          entrants={entrants}
          revealedAddresses={revealedEntrantsList}
          winnerIndex={drawData.winnerIndex}
          drawn={drawData.drawn && !isVoid}
          size="lg"
          interactive={phase === "joining"}
        />

        {/* Void notice */}
        {isVoid && (
          <div className="mt-6 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--danger)] text-center max-w-md">
            <div className="text-sm font-bold text-[var(--danger)]">
              Fewer than two straws were shown. No winner.
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              At least two entrants must reveal their secrets to produce multi-party randomness.
            </p>
          </div>
        )}

        {/* Winner Announcement Banner */}
        {isWinnerDrawn && winnerAddress && !isVoid && (
          <div className="mt-6 p-5 rounded-xl bg-[var(--bg-elevated)] border-2 border-[var(--accent)] text-center max-w-lg shadow-md">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              ★ Winner Selected ★
            </span>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[var(--text-primary)] mt-1 break-all">
              {formatShortAddress(winnerAddress)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1 font-mono break-all">
              {winnerAddress}
            </div>
          </div>
        )}
      </Panel>

      {/* Interaction Stage based on Phase */}
      <Panel variant="elevated">
        {/* Joining Phase */}
        {phase === "joining" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Step 1: Take a straw
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Joining window closes in{" "}
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {Math.max(0, Number(drawData.joinEnd) - now)}s
                  </span>{" "}
                  (or immediately when all {drawData.slots} slots fill).
                </p>
              </div>

              {!isConnected ? (
                <div className="text-xs text-[var(--text-muted)] italic">
                  Connect wallet above to take a straw
                </div>
              ) : isUserEntrant ? (
                <div className="text-xs font-semibold text-[var(--success)] bg-[var(--bg-base)] px-3 py-1.5 rounded-lg border border-[var(--border-default)]">
                  ✓ You have taken a straw
                </div>
              ) : (
                <Button
                  onClick={handleJoin}
                  loading={submitting}
                  size="md"
                  variant="primary"
                >
                  Take a straw
                </Button>
              )}
            </div>

            {/* Offer backup download if secret generated */}
            {downloadOfferSecret && (
              <div className="p-3.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">Secret saved locally.</span>{" "}
                  <span className="text-[var(--text-muted)]">Download a backup copy to be safe.</span>
                </div>
                <Button
                  onClick={() => handleDownloadSecret(downloadOfferSecret)}
                  size="sm"
                  variant="secondary"
                >
                  Download Secret (.json)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Reveal Phase */}
        {(phase === "full" || phase === "reveal") && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Step 2: Show your straw
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Reveal phase closes in{" "}
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {Math.max(0, Number(drawData.revealEnd) - now)}s
                  </span>
                  .
                </p>
              </div>

              {isUserEntrant ? (
                userHasRevealed ? (
                  <div className="text-xs font-semibold text-[var(--success)] bg-[var(--bg-base)] px-3 py-1.5 rounded-lg border border-[var(--border-default)]">
                    ✓ You have shown your straw
                  </div>
                ) : storedSecret ? (
                  <Button
                    onClick={() => handleReveal(storedSecret)}
                    loading={submitting}
                    size="md"
                    variant="primary"
                  >
                    Show your straw
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowManualSecret(!showManualSecret)}
                    size="sm"
                    variant="secondary"
                  >
                    Enter Secret Manually
                  </Button>
                )
              ) : (
                <div className="text-xs text-[var(--text-muted)] italic">
                  You are not an entrant in this draw.
                </div>
              )}
            </div>

            {/* Stored secret info */}
            {isUserEntrant && !userHasRevealed && storedSecret && (
              <div className="p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs font-mono">
                <span className="text-[var(--text-muted)] truncate">
                  Saved Secret: <span className="text-[var(--text-primary)]">{storedSecret.slice(0, 18)}...</span>
                </span>
                <button
                  onClick={() => handleDownloadSecret(storedSecret)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline"
                >
                  Download backup
                </button>
              </div>
            )}

            {/* Manual Secret Input if secret missing from storage */}
            {isUserEntrant && !userHasRevealed && (!storedSecret || showManualSecret) && (
              <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] space-y-3">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Paste your sealed 32-byte secret (0x...):
                </div>
                <input
                  type="text"
                  placeholder="0x..."
                  value={manualSecret}
                  onChange={(e) => setManualSecret(e.target.value.trim())}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Missing secret? Unrevealed entrants are dropped from the draw.
                  </p>
                  <Button
                    onClick={() => handleReveal(manualSecret as Hex)}
                    disabled={!manualSecret.startsWith("0x") || manualSecret.length !== 66}
                    loading={submitting}
                    size="sm"
                    variant="primary"
                  >
                    Reveal
                  </Button>
                </div>
              </div>
            )}

            {/* Walk-away warning */}
            <div className="text-xs text-[var(--text-muted)] leading-relaxed italic border-t border-[var(--border-subtle)] pt-2">
              The last person to show can walk away. Walking away takes them out of the draw.
            </div>
          </div>
        )}

        {/* Awaiting Draw Phase */}
        {phase === "awaiting-draw" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Step 3: Pull the straws
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                All entrants revealed (or window expired). Anyone can execute the pull to finalize the winner.
              </p>
            </div>
            <Button
              onClick={handleDraw}
              loading={submitting}
              size="lg"
              variant="primary"
              className="px-8 font-bold text-base"
            >
              Pull
            </Button>
          </div>
        )}

        {/* Concluded / Void Phase */}
        {(phase === "drawn" || isVoid) && (
          <div className="text-xs text-[var(--text-muted)]">
            Draw concluded. The winner was determined deterministically from on-chain secrets.
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--danger)] text-xs text-[var(--danger)]">
            {errorMsg}
          </div>
        )}
      </Panel>

      {/* Seed Recipe (off-chain verifiable randomness) */}
      {(phase === "drawn" || phase === "awaiting-draw" || isVoid || revealedSecretsList.length > 0) && (
        <SeedRecipe
          drawId={drawId}
          revealedEntrants={revealedEntrantsList}
          revealedSecrets={revealedSecretsList}
          winnerAddress={winnerAddress}
        />
      )}

      {/* Limitations Banner (Required by Spec §3.4 & §8) */}
      <LimitsBanner />
    </div>
  );
}
