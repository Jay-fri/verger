"use client";

import { useActionState } from "react";
import { CHURCH_ROLES } from "@verger/shared-types";
import { inviteMemberAction, type InviteMemberState } from "@/lib/invites/actions";
import { Field, SubmitButton, ErrorMessage, InfoMessage } from "@/components/ui";

const initialState: InviteMemberState = { error: null, inviteUrl: null };

export function InviteMemberForm() {
  const [state, formAction] = useActionState(inviteMemberAction, initialState);

  return (
    <div className="mt-4 space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Field label="Email" name="email" type="email" required />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">Role</span>
          <select
            name="role"
            defaultValue="operator"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
          >
            {CHURCH_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton pendingChildren="Sending…">Invite</SubmitButton>
      </form>

      <ErrorMessage>{state.error}</ErrorMessage>

      {state.inviteUrl && (
        <InfoMessage>
          Invite link (email sending isn&apos;t wired up yet — share this manually):
          <br />
          <a href={state.inviteUrl} className="text-accent-gold break-all underline">
            {state.inviteUrl}
          </a>
        </InfoMessage>
      )}
    </div>
  );
}
