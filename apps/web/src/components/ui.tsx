"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-8">
      <main className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        {children}
      </main>
    </div>
  );
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium tracking-wide text-accent-gold uppercase">{children}</p>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h1 className="mt-1 text-2xl font-semibold text-text-primary">{children}</h1>;
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-text-secondary">{children}</p>;
}

export function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement> & LabelHTMLAttributes<never>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text-primary">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:outline-none focus:ring-1 focus:ring-accent-gold"
      />
    </label>
  );
}

export function SubmitButton({
  children,
  pendingChildren,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  pendingChildren?: ReactNode;
  variant?: "primary" | "secondary";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();

  const styles =
    variant === "primary"
      ? "bg-accent-gold text-background hover:opacity-90"
      : "border border-border bg-transparent text-text-primary hover:bg-background";

  return (
    <button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      className={`flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {pending ? (pendingChildren ?? children) : children}
    </button>
  );
}

// Genuine problem/error state (form validation, connection lost) — shares
// danger's red hue, but only ever as a thin border/tint/text treatment,
// never the solid filled block the panic buttons use. That's what keeps
// panic buttons "recognizable without reading the label": filled-solid-red
// is unique to them; a bordered red message is the universal, expected
// "something's wrong" convention everywhere else.
export function ErrorMessage({ children }: { children: ReactNode | null }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function InfoMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-secondary">
      {children}
    </p>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operator: "Operator",
  volunteer: "Volunteer",
};

// Confident/needs-review green/orange are reserved for the AI Detected
// queue only (see globals.css) — role badges stay in the neutral/accent
// vocabulary instead: admin gets the one "special" tier (accent gold),
// operator/volunteer are both plain neutral, differentiated by weight only.
const ROLE_COLOR: Record<string, string> = {
  admin: "bg-accent-gold/15 text-accent-gold",
  operator: "bg-text-primary/10 text-text-primary",
  volunteer: "bg-text-secondary/15 text-text-secondary",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[role] ?? "bg-text-secondary/15 text-text-secondary"}`}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}
