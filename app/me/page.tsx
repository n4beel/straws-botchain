"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { type Hex } from "viem";
import { secretStore, formatShortAddress, type StoredSecret } from "@/lib/straws";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";

export default function MySecretsPage() {
  const { address: userAddress, isConnected } = useAccount();
  const { show: toast } = useToast();

  const [secrets, setSecrets] = useState<StoredSecret[]>([]);
  const [unmasked, setUnmasked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const loadSecrets = () => {
    const list = secretStore.listSecrets();
    setSecrets(list);
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const handleCopy = (secret: Hex, key: string) => {
    navigator.clipboard.writeText(secret);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleMask = (key: string) => {
    setUnmasked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExportBackup = () => {
    const json = secretStore.exportBackupJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `straws-secrets-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Secrets Exported",
      description: "Downloaded backup file with your sealed secrets.",
    });
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const count = secretStore.importBackupJson(content);
        loadSecrets();
        toast({
          title: "Secrets Imported",
          description: `Successfully restored ${count} secret(s).`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearSecrets = () => {
    if (window.confirm("Are you sure you want to clear your locally stored secrets?")) {
      secretStore.clear();
      loadSecrets();
      toast({
        title: "Secrets Cleared",
        description: "Local secret store was emptied.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            My Sealed Secrets
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Secrets are saved only in your browser's localStorage. They are never sent over the network until you reveal them.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleExportBackup} size="sm" variant="secondary">
            Export Backup (.json)
          </Button>
          <label className="cursor-pointer inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-medium rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">
            Import Backup
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {secrets.length === 0 ? (
        <Panel variant="parchment" className="py-12 text-center">
          <div className="text-base font-semibold text-[var(--text-primary)]">
            No secrets saved yet
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            When you take a straw in any draw, a secret is generated and stored here automatically.
          </p>
          <Link href="/" className="mt-5 inline-block">
            <Button variant="primary" size="sm">
              Explore Draws
            </Button>
          </Link>
        </Panel>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
            <span>{secrets.length} SAVED SECRET(S)</span>
            <button
              onClick={handleClearSecrets}
              className="text-[var(--danger)] hover:underline font-semibold"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-3">
            {secrets.map((item, idx) => {
              const key = `${item.drawId}-${item.entrant}`;
              const isMine =
                userAddress &&
                item.entrant.toLowerCase() === userAddress.toLowerCase();
              const isUnmasked = unmasked[key];

              return (
                <Panel key={key} variant="elevated" className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--accent)] font-mono">
                        Draw #{item.drawId}
                      </span>
                      <span>·</span>
                      <span className="font-mono text-[var(--text-primary)]">
                        {formatShortAddress(item.entrant)}
                      </span>
                      {isMine && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-base)] text-[var(--accent)] font-semibold border border-[var(--border-subtle)]">
                          Connected Wallet
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/draw/${item.drawId}`}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline self-start sm:self-auto"
                    >
                      Open Draw →
                    </Link>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs font-mono bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <span className="truncate text-[var(--text-primary)]">
                      {isUnmasked ? item.secret : `${item.secret.slice(0, 10)}••••••••••••••••••••••••••••••••${item.secret.slice(-8)}`}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleMask(key)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                      >
                        {isUnmasked ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => handleCopy(item.secret, key)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                      >
                        {copied === key ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {item.savedAt && (
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Saved {new Date(item.savedAt).toLocaleString()}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
