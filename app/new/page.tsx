"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract, waitSuccess } from "@/lib/useChainWrite";
import { strawsAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import {
  MIN_SLOTS,
  MAX_SLOTS,
  MIN_JOIN,
  MAX_JOIN,
  MIN_REVEAL,
  MAX_REVEAL,
  MAX_TITLE,
} from "@/lib/straws";
import { describeContractError } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Fan from "@/components/straws/Fan";
import { useToast } from "@/components/ui/Toast";

const JOIN_DURATIONS = [
  { label: "5 minutes", seconds: 300 },
  { label: "15 minutes", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
];

const REVEAL_DURATIONS = [
  { label: "5 minutes", seconds: 300 },
  { label: "15 minutes", seconds: 900 },
  { label: "30 minutes", seconds: 1800 },
  { label: "2 hours", seconds: 7200 },
  { label: "1 day", seconds: 86400 },
];

export default function NewDrawPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { show: toast } = useToast();

  const deployment = getDeployment(activeBotChain.id);
  const deployed = isDeployed(activeBotChain.id);

  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState<number>(4);
  const [joinSecs, setJoinSecs] = useState<number>(3600);
  const [revealSecs, setRevealSecs] = useState<number>(1800);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const titleBytes = new TextEncoder().encode(title).length;
  const isTitleValid = title.trim().length > 0 && titleBytes <= MAX_TITLE;

  const joinDurationLabel =
    JOIN_DURATIONS.find((d) => d.seconds === joinSecs)?.label ?? `${joinSecs}s`;
  const revealDurationLabel =
    REVEAL_DURATIONS.find((d) => d.seconds === revealSecs)?.label ?? `${revealSecs}s`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployed) {
      setErrorMsg("Contract is not deployed on this network.");
      return;
    }
    if (!isTitleValid) {
      setErrorMsg(`Title must be between 1 and ${MAX_TITLE} bytes.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: strawsAbi,
        functionName: "create",
        args: [title.trim(), slots, BigInt(joinSecs), BigInt(revealSecs)],
      });

      toast({
        title: "Transaction Sent",
        description: "Waiting for confirmation on BOT Chain...",
      });

      if (publicClient) {
        const receipt = await waitSuccess(publicClient, hash);
        // Find Created event from logs
        let createdId: bigint | undefined;
        for (const log of receipt.logs) {
          try {
            if ((log as any).topics?.[1]) {
              createdId = BigInt((log as any).topics[1]);
              break;
            }
          } catch {}
        }

        toast({
          title: "Draw Created!",
          description: createdId ? `Draw #${createdId} is ready.` : "Draw created successfully.",
        });

        if (createdId) {
          router.push(`/draw/${createdId}`);
        } else {
          router.push("/");
        }
      } else {
        router.push("/");
      }
    } catch (err: any) {
      const described = describeContractError(err);
      setErrorMsg(described);
      toast({
        title: "Could Not Create Draw",
        description: described,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto">
      <div>
        <Link
          href="/"
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2 inline-flex items-center gap-1"
        >
          ← Back to draws
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          New Straws Draw
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Pick one person fairly. You do not automatically join this draw as organiser.
        </p>
      </div>

      {/* Live Fan Preview */}
      <Panel variant="parchment" className="flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-3 text-xs font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-2">
          <span>FAN PREVIEW</span>
          <span>{slots} SLOTS EMPTY</span>
        </div>
        <Fan slots={slots} joined={0} size="md" />
        <p className="text-xs text-[var(--text-muted)] mt-2 italic text-center">
          {slots} straws will radiate across a 120° arc. Each person seals a straw upon joining.
        </p>
      </Panel>

      {/* Creation Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Panel variant="elevated" className="space-y-5">
          {/* Title */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Draw Title / Question
              </label>
              <span
                className={[
                  "text-[11px] font-mono",
                  titleBytes > MAX_TITLE ? "text-[var(--danger)] font-bold" : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                {titleBytes}/{MAX_TITLE} bytes
              </span>
            </div>
            <input
              id="title"
              type="text"
              required
              maxLength={MAX_TITLE}
              placeholder='e.g. "Who buys team lunch" or "Sprint lead"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-medium text-sm"
            />
          </div>

          {/* Slots Slider */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="slots" className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Slots (Entrants)
              </label>
              <span className="text-sm font-mono font-bold text-[var(--accent)] bg-[var(--bg-base)] px-2.5 py-0.5 rounded border border-[var(--border-default)]">
                {slots} straws
              </span>
            </div>
            <input
              id="slots"
              type="range"
              min={MIN_SLOTS}
              max={MAX_SLOTS}
              step={1}
              value={slots}
              onChange={(e) => setSlots(Number(e.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono mt-1">
              <span>{MIN_SLOTS} slots min</span>
              <span>16 slots max</span>
            </div>
          </div>

          {/* Join Duration */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
              Joining Window
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {JOIN_DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setJoinSecs(d.seconds)}
                  className={[
                    "py-1.5 px-2 text-xs font-medium rounded-md border text-center transition-colors",
                    joinSecs === d.seconds
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] font-semibold shadow-xs"
                      : "bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:border-[var(--border-default)]",
                  ].join(" ")}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reveal Duration */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
              Reveal Window
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {REVEAL_DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setRevealSecs(d.seconds)}
                  className={[
                    "py-1.5 px-2 text-xs font-medium rounded-md border text-center transition-colors",
                    revealSecs === d.seconds
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] font-semibold shadow-xs"
                      : "bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:border-[var(--border-default)]",
                  ].join(" ")}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Consequence Sentence */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">Consequence:</strong> This draw accepts up to{" "}
            <span className="font-semibold text-[var(--text-primary)]">{slots} entrants</span>. Joining closes in{" "}
            <span className="font-semibold text-[var(--text-primary)]">{joinDurationLabel}</span> (or immediately if full). Entrants then have{" "}
            <span className="font-semibold text-[var(--text-primary)]">{revealDurationLabel}</span> to show their straws. If fewer than 2 straws are shown, the draw becomes void.
          </div>
        </Panel>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--danger)] text-xs text-[var(--danger)]">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Link href="/">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!isTitleValid || !deployed || !isConnected}
          >
            {!isConnected ? "Connect Wallet to Create" : "Create Draw"}
          </Button>
        </div>
      </form>
    </div>
  );
}
