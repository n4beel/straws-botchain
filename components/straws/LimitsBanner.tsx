export default function LimitsBanner({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "rounded-xl p-4 sm:p-5 border transition-colors",
        "bg-[var(--bg-surface)] border-[var(--border-default)]",
        className,
      ].join(" ")}
      style={{ boxShadow: "0 2px 8px var(--straw-shadow)" }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: "var(--warning)" }}
          aria-hidden="true"
        />
        <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
          What a draw can't promise
        </h3>
      </div>
      <ul className="space-y-1.5 text-xs sm:text-[13px] text-[var(--text-muted)] leading-relaxed list-disc list-inside">
        <li>
          <strong className="text-[var(--text-primary)]">The last person to show can walk away.</strong> Walking away takes them out of the draw.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Ten wallets can be one person.</strong> It proves a fair pick between wallets, not between people.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Nothing here makes anyone do what the draw decides.</strong> The lunch still has to be bought.
        </li>
      </ul>
    </div>
  );
}
