"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptInviteState } from "@/lib/invites/actions";
import { SubmitButton, ErrorMessage } from "@/components/ui";

const initialState: AcceptInviteState = { error: null };

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInviteAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      <ErrorMessage>{state.error}</ErrorMessage>
      <SubmitButton pendingChildren="Joining…">Accept invite</SubmitButton>
    </form>
  );
}
