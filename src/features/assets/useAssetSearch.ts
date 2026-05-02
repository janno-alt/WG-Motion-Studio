import { useEffect, useState } from "react";

import { commands } from "@/lib/tauri";
import type { Asset } from "@/types";

export interface AssetWithTags {
  asset: Asset;
  tags: string[];
}

export function useAssetSearch(projectId: string | null, query: string) {
  const [results, setResults] = useState<AssetWithTags[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await commands.searchAssets(projectId, query);
        if (!cancelled) setResults(list);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  return { results, loading };
}
