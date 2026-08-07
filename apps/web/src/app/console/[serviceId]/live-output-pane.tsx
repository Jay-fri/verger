import { CueTypeBadge } from "@/components/cue-type-badge";
import type { CueItem, LiveItem } from "./types";

const SOURCE_LABEL: Record<LiveItem["source"], string> = {
  cue: "Order of service",
  detection: "AI detected",
  search: "Manual search",
};

export function LiveOutputPane({
  current,
  next,
}: {
  current: LiveItem | null;
  next: CueItem | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Live output
        </h2>
        {current && (
          <span className="bg-live/15 text-live flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
            <span className="bg-live h-1.5 w-1.5 rounded-full" />
            On air
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-background p-8 text-center">
          {current ? (
            <>
              <div className="flex items-center justify-center gap-2">
                <CueTypeBadge type={current.type} />
                <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
                  {SOURCE_LABEL[current.source]}
                </p>
              </div>
              <p className="mt-3 text-xl leading-relaxed text-text-primary sm:text-2xl">
                &ldquo;{current.text}&rdquo;
              </p>
              <p className="mt-4 text-sm font-medium text-accent-gold">{current.label}</p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">Nothing live yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">Next</p>
            {next && <CueTypeBadge type={next.type} />}
          </div>
          {next ? (
            <>
              <p className="mt-1 line-clamp-1 text-sm text-text-primary">{next.text}</p>
              <p className="mt-0.5 text-xs text-accent-gold">{next.label}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">End of outline.</p>
          )}
        </div>
      </div>
    </div>
  );
}
