"use client";

import { useActionState } from "react";
import { signInAction, signInWithGoogleAction, type AuthActionState } from "@/lib/auth/actions";
import { Field, SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: AuthActionState = { error: null };

export function SignInForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, formAction] = useActionState(signInAction, initialState);
  const error = state.error ?? initialError ?? null;

  return (
    <div className="mt-6 space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <ErrorMessage>{error}</ErrorMessage>
        <SubmitButton pendingChildren="Signing in…">Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-secondary">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={next ?? ""} />
        <SubmitButton variant="secondary" pendingChildren="Redirecting…">
          Continue with Google
        </SubmitButton>
      </form>
    </div>
  );
}
