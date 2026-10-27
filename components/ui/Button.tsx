"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef, ReactNode } from "react";

export type StrawButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "straw";
export type StrawButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: StrawButtonVariant;
  size?: StrawButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<StrawButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    border: "1px solid var(--accent)",
    boxShadow: "0 2px 8px rgba(209, 73, 91, 0.25)",
  },
  secondary: {
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    boxShadow: "0 1px 3px rgba(43, 33, 24, 0.05)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
  },
  danger: {
    background: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--danger)",
  },
  straw: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px dashed var(--border-default)",
    boxShadow: "0 2px 6px rgba(43, 33, 24, 0.04)",
  },
};

const sizeClasses: Record<StrawButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs font-medium rounded-md gap-1.5",
  md: "px-5 py-2.5 text-sm font-semibold rounded-lg gap-2",
  lg: "px-6 py-3.5 text-base font-semibold rounded-xl gap-2.5",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      icon,
      children,
      className = "",
      style,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center select-none",
          "transition-all duration-150 active:scale-[0.98]",
          "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          sizeClasses[size],
          className,
        ].join(" ")}
        style={{
          fontFamily: "var(--font-sans)",
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          <>
            {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
            <span>{children}</span>
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "StrawButton";
export default Button;
