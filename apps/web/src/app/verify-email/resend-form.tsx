"use client";

import { useActionState } from "react";
import { resendVerificationEmailAction, type ResendActionState } from "@/lib/auth/actions";
import { SubmitButton, ErrorMessage, InfoMessage } from "@/components/ui";

const initialState: ResendActionState = { error: null, sent: false };

export function ResendForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendVerificationEmailAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="email" value={email} />
      <ErrorMessage>{state.error}</ErrorMessage>
      {state.sent && <InfoMessage>Sent — check your inbox.</InfoMessage>}
      <SubmitButton variant="secondary" pendingChildren="Resending…">
        Resend confirmation email
      </SubmitButton>
    </form>
  );
}
