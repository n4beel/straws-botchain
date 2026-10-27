"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { fanGeometry, formatShortAddress } from "@/lib/straws";

export interface FanProps {
  slots: number;
  joined: number;
  entrants?: readonly Address[] | Address[];
  revealedAddresses?: readonly Address[] | Address[];
  winnerIndex?: number;
  drawn?: boolean;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onSlotClick?: (slotIndex: number) => void;
  className?: string;
}

export default function Fan({
  slots,
  joined,
  entrants = [],
  revealedAddresses = [],
  winnerIndex,
  drawn = false,
  size = "lg",
  interactive = false,
  onSlotClick,
  className = "",
}: FanProps) {
  const geometries = useMemo(() => {
    return fanGeometry(slots, joined, drawn ? winnerIndex : undefined);
  }, [slots, joined, drawn, winnerIndex]);

  const revealedSet = useMemo(() => {
    return new Set((revealedAddresses || []).map((a) => a.toLowerCase()));
  }, [revealedAddresses]);

  const sizeClasses = {
    sm: "w-[180px] max-w-full h-auto",
    md: "w-[280px] sm:w-[320px] max-w-full h-auto",
    lg: "w-full max-w-[460px] h-auto",
  }[size];

  // Pinch origin point in 400x240 viewBox
  const cx = 200;
  const cy = 222;

  return (
    <div className={["flex flex-col items-center justify-center relative select-none", className].join(" ")}>
      <svg
        viewBox="0 0 400 240"
        className={[sizeClasses, "overflow-visible drop-shadow-sm"].join(" ")}
        role="img"
        aria-label={`Straws fan with ${joined} of ${slots} straws taken`}
      >
        <defs>
          <filter id="strawShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.1" floodColor="#2B2118" />
          </filter>
        </defs>

        {/* Straws fan */}
        {geometries.map((g) => {
          const entrant = entrants[g.index];
          const isRevealed = entrant ? revealedSet.has(entrant.toLowerCase()) : false;
          const isWinner = g.isWinner;
          const isJoined = g.isJoined;

          // Rotation around pinch point
          const transform = `rotate(${g.angle} ${cx} ${cy})`;
          const strawWidth = slots > 10 ? 7 : 9;
          const halfWidth = strawWidth / 2;

          // Straw path going up from cy along negative Y
          const length = isWinner ? g.length + 32 : g.length;
          const pullOffset = isWinner ? -36 : 0;
          const strawTopY = cy - length + pullOffset;

          return (
            <g
              key={g.index}
              transform={transform}
              className={[
                "transition-all duration-200",
                interactive && !isJoined ? "cursor-pointer hover:opacity-80" : "",
                isWinner ? "straw-pull-active" : "",
              ].join(" ")}
              onClick={() => {
                if (interactive && onSlotClick) onSlotClick(g.index);
              }}
            >
              {/* The Straw Bar */}
              {isJoined ? (
                <rect
                  x={cx - halfWidth}
                  y={strawTopY}
                  width={strawWidth}
                  height={length}
                  rx={halfWidth}
                  fill={isWinner ? "var(--accent)" : "var(--straw-joined)"}
                  stroke={isWinner ? "var(--accent-hover)" : "var(--border-strong)"}
                  strokeWidth="1"
                  filter="url(#strawShadow)"
                />
              ) : (
                <rect
                  x={cx - halfWidth}
                  y={strawTopY}
                  width={strawWidth}
                  height={length}
                  rx={halfWidth}
                  fill="transparent"
                  stroke="var(--straw-hollow)"
                  strokeWidth="1.75"
                  strokeDasharray="4 3"
                />
              )}

              {/* Paper Tag for joined entrant */}
              {isJoined && size !== "sm" && (
                <g
                  transform={`translate(${cx}, ${strawTopY + 28})`}
                  className="pointer-events-none"
                >
                  {/* Paper tag rectangle */}
                  <rect
                    x={g.angle < 0 ? -70 : 8}
                    y={-10}
                    width={62}
                    height={20}
                    rx={3}
                    fill={isWinner ? "var(--accent)" : "var(--straw-tag)"}
                    stroke={isWinner ? "var(--accent)" : "var(--border-default)"}
                    strokeWidth="1"
                    filter="url(#strawShadow)"
                  />
                  {/* Tag pin/string */}
                  <circle
                    cx={g.angle < 0 ? -12 : 12}
                    cy={0}
                    r={1.8}
                    fill="var(--border-strong)"
                  />
                  {/* Text on tag */}
                  <text
                    x={g.angle < 0 ? -40 : 38}
                    y={3.5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-semibold tracking-tighter"
                    fill={isWinner ? "var(--accent-ink)" : "var(--text-primary)"}
                  >
                    {isWinner
                      ? "WINNER"
                      : isRevealed
                      ? "SHOWN"
                      : entrant
                      ? formatShortAddress(entrant).slice(0, 7)
                      : `#${g.index + 1}`}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Pinch clasp band holding straws together at bottom */}
        <g className="pointer-events-none">
          <path
            d={`M ${cx - 24} ${cy - 4} Q ${cx} ${cy - 8} ${cx + 24} ${cy - 4} L ${cx + 20} ${cy + 12} Q ${cx} ${cy + 10} ${cx - 20} ${cy + 12} Z`}
            fill="var(--bg-surface)"
            stroke="var(--border-default)"
            strokeWidth="1.5"
            filter="url(#strawShadow)"
          />
          <circle cx={cx} cy={cy + 3} r={2.5} fill="var(--border-strong)" />
        </g>
      </svg>
    </div>
  );
}
