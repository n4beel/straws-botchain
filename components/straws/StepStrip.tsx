import { DrawPhase } from "@/lib/straws";

export interface StepStripProps {
  phase: DrawPhase;
  className?: string;
}

export default function StepStrip({ phase, className = "" }: StepStripProps) {
  // Determine step status
  // Step 1: Take a straw (active during joining, completed once full or reveal)
  // Step 2: Show it (active during full / reveal, completed once awaiting-draw or drawn)
  // Step 3: Pull (active during awaiting-draw, completed once drawn or void)
  const isStep1Done = phase !== "joining";
  const isStep1Active = phase === "joining";

  const isStep2Done = phase === "awaiting-draw" || phase === "drawn" || phase === "void";
  const isStep2Active = phase === "full" || phase === "reveal";

  const isStep3Done = phase === "drawn" || phase === "void";
  const isStep3Active = phase === "awaiting-draw";

  const steps = [
    { num: "1", title: "Take a straw", active: isStep1Active, done: isStep1Done },
    { num: "2", title: "Show it", active: isStep2Active, done: isStep2Done },
    { num: "3", title: "Pull", active: isStep3Active, done: isStep3Done },
  ];

  return (
    <nav
      aria-label="Draw lifecycle steps"
      className={[
        "flex items-center justify-center gap-2 sm:gap-4 py-2 px-3 sm:px-4 rounded-xl",
        "bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-xs select-none",
        className,
      ].join(" ")}
    >
      {steps.map((s, idx) => (
        <div key={s.num} className="flex items-center gap-2 sm:gap-4">
          <div
            className={[
              "flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-lg transition-colors text-xs sm:text-sm",
              s.active
                ? "bg-[var(--bg-base)] text-[var(--accent)] font-bold border border-[var(--accent)] shadow-xs"
                : s.done
                ? "text-[var(--text-primary)] font-medium"
                : "text-[var(--text-muted)] opacity-60",
            ].join(" ")}
          >
            <span
              className={[
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono",
                s.active
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : s.done
                  ? "bg-[var(--border-strong)] text-[var(--bg-base)]"
                  : "bg-[var(--border-subtle)] text-[var(--text-muted)]",
              ].join(" ")}
            >
              {s.done ? "✓" : s.num}
            </span>
            <span>{s.title}</span>
          </div>

          {idx < steps.length - 1 && (
            <span className="text-[var(--border-strong)] text-xs select-none" aria-hidden="true">
              ·
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
