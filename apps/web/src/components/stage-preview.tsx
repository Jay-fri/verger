// A scaled-down mimic of the actual Stage output's "content" mode (see
// app/stage/[serviceId]/stage-display.tsx) — same centered/balanced text
// and gold reference label, just boxed to fit beside a form instead of
// filling the screen. Purely visual; never touches live_state.
export function StagePreview({ text, label }: { text: string; label?: string | null }) {
  const trimmed = text.trim();

  return (
    <div className="border-border bg-background flex aspect-video flex-col items-center justify-center rounded-xl border px-6 text-center">
      {trimmed ? (
        <>
          <p className="text-text-primary text-sm leading-snug text-balance sm:text-base">{trimmed}</p>
          {label && <p className="text-accent-gold mt-3 text-xs font-medium">{label}</p>}
        </>
      ) : (
        <p className="text-text-secondary/40 text-[10px] font-medium tracking-[0.3em] uppercase">Preview</p>
      )}
    </div>
  );
}
