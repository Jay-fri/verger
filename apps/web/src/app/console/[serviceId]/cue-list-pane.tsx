import { CueTypeBadge } from "@/components/cue-type-badge";
import type { CueItem } from "./types";

export function CueListPane({
  cueItems,
  activeCueId,
  onSelect,
}: {
  cueItems: CueItem[];
  activeCueId: string | null;
  onSelect: (item: CueItem) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Order of service
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {cueItems.length === 0 ? (
          <p className="p-3 text-sm text-text-secondary">No cue items in this outline.</p>
        ) : (
          <ol className="space-y-1.5">
            {cueItems.map((item) => {
              const isActive = item.id === activeCueId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isActive
                        ? "border-accent-gold bg-accent-gold/10"
                        : "border-border bg-background hover:border-accent-gold/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CueTypeBadge type={item.type} />
                      <p
                        className={`truncate text-sm font-medium ${isActive ? "text-accent-gold" : "text-text-primary"}`}
                      >
                        {item.label}
                      </p>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{item.text}</p>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
