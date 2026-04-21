import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ThemeEditor } from "./components/ThemeEditor";
import { commands } from "@/lib/tauri";
import { useThemesStore } from "@/state/themesStore";
import type { Theme } from "@/types";

export function ThemesScreen() {
  const { themeId } = useParams();
  const navigate = useNavigate();
  const { themes, load, upsert, remove } = useThemesStore();

  const [confirmDelete, setConfirmDelete] = useState<Theme | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => themes.find((t) => t.id === themeId) ?? themes[0],
    [themes, themeId],
  );

  useEffect(() => {
    if (!themeId && selected) {
      navigate(`/themes/${selected.id}`, { replace: true });
    }
  }, [themeId, selected, navigate]);

  const createTheme = () => {
    const now = Date.now();
    const fresh: Theme = {
      id: `theme-${nanoid(8)}`,
      name: "Untitled theme",
      colors: {
        primary: "#C8FF00",
        secondary: "#141414",
        accent: "#F0F0F0",
        background: "#0A0A0A",
      },
      typography: { headlineFont: "Inter", bodyFont: "Inter" },
      iconStyle: {
        approach: "angular",
        strokeWeight: 2,
        fillStyle: "outline",
        referenceImages: [],
      },
      animationPersonality: { speed: 50, springiness: 50, entryStyle: "mixed" },
      preferredPresets: [],
      styleNotes: "",
      createdAt: now,
      updatedAt: now,
    };
    void commands.saveTheme(fresh).then((saved) => {
      upsert(saved);
      navigate(`/themes/${saved.id}`);
    });
  };

  const save = async (updated: Theme) => {
    try {
      const saved = await commands.saveTheme({ ...updated, updatedAt: Date.now() });
      upsert(saved);
      toast.success("Theme saved");
    } catch (err) {
      toast.error(`Save failed: ${String(err)}`);
    }
  };

  const deleteTheme = async (t: Theme) => {
    setConfirmDelete(null);
    try {
      await commands.deleteTheme(t.id);
      remove(t.id);
      const next = themes.find((x) => x.id !== t.id);
      navigate(next ? `/themes/${next.id}` : "/themes", { replace: true });
      toast.success("Theme deleted");
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Themes"
        actions={
          <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />} onClick={createTheme}>
            New theme
          </Button>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-auto border-r border-border-subtle bg-surface-1">
          {themes.length === 0 ? (
            <div className="p-4 text-xs text-text-muted">No themes yet.</div>
          ) : (
            <ul className="p-2">
              {themes.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/themes/${t.id}`)}
                    className={[
                      "flex w-full items-center gap-2 rounded-default px-2 py-1.5 text-left text-sm transition-colors",
                      selected?.id === t.id
                        ? "bg-surface-3 text-text-primary"
                        : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                    ].join(" ")}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border-subtle"
                      style={{ background: t.colors.primary }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="flex-1 overflow-auto">
          {selected ? (
            <ThemeEditor
              key={selected.id}
              theme={selected}
              onSave={save}
              onDelete={() => setConfirmDelete(selected)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-muted">
              Select or create a theme to edit.
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete theme?"
        description={
          <>
            Delete <span className="text-text-primary">{confirmDelete?.name}</span>?
            Projects using this theme will keep their data but lose the link.
          </>
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDelete && void deleteTheme(confirmDelete)}
      />
    </div>
  );
}
