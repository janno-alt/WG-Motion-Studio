import { useEffect, useState } from "react";
import { toast } from "sonner";

import { commands, type Provider } from "@/lib/tauri";
import { SettingsSection } from "./SettingsSection";

interface Row {
  provider: Provider;
  label: string;
  placeholder: string;
}

const ROWS: Row[] = [
  {
    provider: "gemini",
    label: "Google Gemini API key",
    placeholder: "AIza…",
  },
];

export function ApiKeysSection() {
  const [present, setPresent] = useState<Record<Provider, boolean>>({ gemini: false });
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ gemini: "" });
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    void (async () => {
      const g = await commands.hasApiKey("gemini");
      setPresent({ gemini: g });
    })();
  }, []);

  const save = async (provider: Provider) => {
    const value = drafts[provider].trim();
    if (!value) {
      toast.error("Empty value — paste the key first.");
      return;
    }
    setBusy(provider);
    try {
      await commands.setApiKey(provider, value);
      setPresent((p) => ({ ...p, [provider]: true }));
      setDrafts((d) => ({ ...d, [provider]: "" }));
      toast.success(`${provider} key saved to Keychain.`);
    } catch (err) {
      toast.error(`Failed to save: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const clear = async (provider: Provider) => {
    setBusy(provider);
    try {
      await commands.clearApiKey(provider);
      setPresent((p) => ({ ...p, [provider]: false }));
      toast.success(`${provider} key removed.`);
    } catch (err) {
      toast.error(`Failed to remove: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection
      title="API keys"
      description="Stored in the macOS Keychain. macOS will prompt for access on first save."
    >
      {ROWS.map((row) => (
        <div key={row.provider} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-primary">{row.label}</label>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-2xs font-medium",
                present[row.provider]
                  ? "bg-success/10 text-success"
                  : "bg-surface-3 text-text-muted",
              ].join(" ")}
            >
              {present[row.provider] ? "Stored" : "Not set"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={drafts[row.provider]}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [row.provider]: e.target.value }))
              }
              placeholder={row.placeholder}
              className="min-w-0 flex-1 rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={busy === row.provider || !drafts[row.provider]}
              onClick={() => void save(row.provider)}
              className="rounded-default bg-accent-primary px-3 py-1.5 text-xs font-medium text-surface-0 transition-colors hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save to Keychain
            </button>
            {present[row.provider] ? (
              <button
                type="button"
                disabled={busy === row.provider}
                onClick={() => void clear(row.provider)}
                className="rounded-default border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}
