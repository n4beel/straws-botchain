"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";
import { app } from "@/lib/app-config";

export interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  nav?: any;
}

export default function PageShell({ children }: PageShellProps) {
  const pathname = usePathname();
  const links = footerLinks();

  return (
    <div
      className="flex flex-col min-h-[100dvh] w-full"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Thin top rail: wordmark and connect control */}
      <header
        className="sticky top-0 z-40 w-full backdrop-blur-md transition-colors"
        style={{
          background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 group select-none no-underline"
              title="Straws homepage"
            >
              {/* Fan straw glyph icon */}
              <div
                className="w-6 h-6 flex items-end justify-center gap-[2.5px] pb-0.5 rounded-md"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
                aria-hidden="true"
              >
                <span className="w-1 h-3 rounded-full origin-bottom -rotate-12" style={{ background: "var(--straw-hollow)" }} />
                <span className="w-1 h-4 rounded-full origin-bottom" style={{ background: "var(--accent)" }} />
                <span className="w-1 h-2.5 rounded-full origin-bottom rotate-12" style={{ background: "var(--straw-joined)" }} />
              </div>
              <div className="flex flex-col">
                <span
                  className="text-base font-bold tracking-tight leading-none text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors"
                >
                  {app.name}
                </span>
                <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                  {app.tagline}
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/new"
                className={[
                  "text-xs sm:text-sm font-medium px-2.5 py-1 rounded-md transition-colors",
                  pathname === "/new"
                    ? "bg-[var(--bg-base)] text-[var(--text-primary)] font-semibold border border-[var(--border-default)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                New draw
              </Link>
              <Link
                href="/me"
                className={[
                  "text-xs sm:text-sm font-medium px-2.5 py-1 rounded-md transition-colors",
                  pathname === "/me"
                    ? "bg-[var(--bg-base)] text-[var(--text-primary)] font-semibold border border-[var(--border-default)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                My secrets
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main page content area */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      {/* Shared UI Contract: Footer with 3 required links */}
      <footer
        className="w-full mt-auto border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-6 text-xs text-[var(--text-muted)]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">Straws</span>
            <span>·</span>
            <span>Draw straws without a referee</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <BuiltOnBotChain
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors underline-offset-4 hover:underline"
            />
            <a
              href="https://scan.botchain.ai"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors underline-offset-4 hover:underline"
            >
              Explorer
            </a>
            <a
              href="https://botchain.ai"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors underline-offset-4 hover:underline"
            >
              botchain.ai
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
