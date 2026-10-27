import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "danger"
          ? "btn-danger"
          : "btn-ghost";
  const sizeClass = size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm";
  return (
    <button
      ref={ref}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}