"use client";

import { useActionState, useRef, useState } from "react";
import { updateChurchLogoAction, removeChurchLogoAction } from "@/lib/settings/actions";
import { ErrorMessage, SubmitButton } from "@/components/ui";

// Matches the server-side check in updateChurchLogoAction — rejected here
// first so the operator gets immediate feedback instead of waiting on a
// round trip, but the server enforces its own cap regardless.
const MAX_FILE_BYTES = 500_000;

export function LogoUploadForm({ currentLogoDataUrl }: { currentLogoDataUrl: string | null }) {
  const [state, formAction] = useActionState(updateChurchLogoAction, { error: null });
  const [preview, setPreview] = useState<string | null>(currentLogoDataUrl);
  const [pickError, setPickError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickError(null);

    if (!file.type.startsWith("image/")) {
      setPickError("Choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPickError(`That image is ${Math.round(file.size / 1000)}KB — please use something under 500KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      if (hiddenInputRef.current) hiddenInputRef.current.value = dataUrl;
      formRef.current?.requestSubmit();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {preview ? (
            // A data: URL / freshly-picked local file, not a remote asset.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Church logo preview" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-text-secondary">No logo</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <form ref={formRef} action={formAction}>
            <input ref={hiddenInputRef} type="hidden" name="logoDataUrl" />
            <label className="inline-block cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background">
              Choose image…
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          </form>
          {currentLogoDataUrl && (
            <form action={removeChurchLogoAction}>
              <SubmitButton variant="secondary" pendingChildren="Removing…">
                Remove logo
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
      <p className="text-xs text-text-secondary">Used by the Stage output&apos;s Logo panic button. Under 500KB.</p>
      <ErrorMessage>{pickError ?? state.error}</ErrorMessage>
    </div>
  );
}
