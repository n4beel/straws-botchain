import { HTMLAttributes, ReactNode } from "react";

export interface StrawsPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "parchment" | "elevated" | "hollow" | "paper";
  tag?: string;
  badge?: ReactNode;
  title?: string;
  subtitle?: string;
  noPadding?: boolean;
}

export default function Panel({
  variant = "parchment",
  tag,
  badge,
  title,
  subtitle,
  noPadding = false,
  children,
  className = "",
  style,
  ...props
}: StrawsPanelProps) {
  const bg =
    variant === "elevated"
      ? "var(--bg-elevated)"
      : variant === "hollow"
      ? "transparent"
      : variant === "paper"
      ? "var(--straw-tag)"
      : "var(--bg-surface)";

  return (
    <section
      className={[
        "relative rounded-2xl transition-shadow",
        noPadding ? "p-0" : "p-5 sm:p-7",
        className,
      ].join(" ")}
      style={{
        background: bg,
        border: "1px solid var(--border-default)",
        boxShadow: "0 2px 12px var(--straw-shadow)",
        ...style,
      }}
      {...props}
    >
      {(tag || title || badge) && (
        <header className="flex items-start justify-between gap-4 mb-5 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            {tag && (
              <span className="inline-block px-2.5 py-0.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider rounded bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                {tag}
              </span>
            )}
            {title && (
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {badge && <div className="flex-shrink-0">{badge}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
