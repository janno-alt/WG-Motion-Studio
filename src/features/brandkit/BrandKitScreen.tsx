import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { commands } from "@/lib/tauri";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { defaultBrandKit } from "@/types";
import { BrandKitEditor } from "./BrandKitEditor";

export function BrandKitScreen() {
  const { id: selectedId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { brandKits, loading, load, upsert, remove } = useBrandKitsStore();

  useEffect(() => {
    void load();
  }, [load]);

  const createNew = async () => {
    const id = `bk-${nanoid(8)}`;
    const kit = defaultBrandKit(id, "New brand kit");
    try {
      const saved = await commands.saveBrandKit(kit);
      upsert(saved);
      navigate(`/brand-kits/${id}`);
    } catch (err) {
      toast.error(`Create failed: ${String(err)}`);
    }
  };

  const selected = selectedId
    ? brandKits.find((k) => k.id === selectedId) ?? null
    : brandKits[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Brand kits"
        actions={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Plus size={14} />}
            onClick={() => void createNew()}
          >
            New brand kit
          </Button>
        }
      />
      <div className="flex flex-1 min-h-0">
        <aside className="flex w-56 shrink-0 flex-col overflow-auto border-r border-border-subtle bg-surface-1">
          {loading && brandKits.length === 0 ? (
            <div className="p-3 text-2xs text-text-muted">Loading…</div>
          ) : brandKits.length === 0 ? (
            <div className="p-3 text-2xs text-text-muted">
              No brand kits yet. Create one to organise per-client colours, fonts, and logos.
            </div>
          ) : (
            <ul>
              {brandKits.map((kit) => (
                <li key={kit.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/brand-kits/${kit.id}`)}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
                      kit.id === selected?.id
                        ? "bg-surface-3 text-text-primary"
                        : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                    ].join(" ")}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border-subtle"
                      style={{ background: kit.colors?.primary ?? "#2A2A2A" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{kit.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <main className="flex-1 overflow-auto bg-surface-0">
          {selected ? (
            <BrandKitEditor
              key={selected.id}
              brandKit={selected}
              onSaved={(k) => upsert(k)}
              onDeleted={(id) => {
                remove(id);
                navigate("/brand-kits");
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-muted">
              Select or create a brand kit.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
