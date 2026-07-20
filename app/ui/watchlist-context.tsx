"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import {
  addWatch,
  atCap,
  parseWatches,
  removeWatch,
  serializeWatches,
  type LocalWatch,
} from "@/lib/watch-store";
import { FREE_WATCH_LIMIT } from "@/lib/watch-limits";

const STORAGE_KEY = "synthname.watches.v1";

// --- device-local store over localStorage -----------------------------------
// Modeled as an external store so the provider reads it with useSyncExternalStore
// — no setState-in-effect, and a stable empty snapshot on the server so there's
// no hydration mismatch. The in-memory `cache` keeps getSnapshot referentially
// stable between writes (a requirement of useSyncExternalStore).
const EMPTY: LocalWatch[] = [];
let cache: LocalWatch[] | null = null;
const listeners = new Set<() => void>();

function readCache(): LocalWatch[] {
  if (cache === null) cache = parseWatches(localStorage.getItem(STORAGE_KEY));
  return cache;
}
function writeCache(next: LocalWatch[]) {
  cache = next;
  localStorage.setItem(STORAGE_KEY, serializeWatches(next));
  for (const l of listeners) l();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getServerSnapshot(): LocalWatch[] {
  return EMPTY;
}

// The modal a "Watch this" affordance opens. `form` collects the email; a
// successful POST → `done` (with the private manage link); a 429 → `limit`.
export type WatchModalState =
  | { kind: "form"; domain: string; status: string; error?: string; submitting?: boolean }
  | { kind: "done"; domain: string; email: string; manageUrl: string }
  | { kind: "limit"; domain: string };

type WatchCtx = {
  watches: LocalWatch[];
  cap: number;
  atCap: boolean;
  modal: WatchModalState | null;
  openWatch: (domain: string, status: string) => void;
  closeModal: () => void;
  submitWatch: (email: string, domain: string) => Promise<void>;
  removeByToken: (token: string) => void;
};

const Ctx = createContext<WatchCtx | null>(null);

export function useWatchlist(): WatchCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWatchlist must be used within <WatchlistProvider>");
  return ctx;
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const watches = useSyncExternalStore(subscribe, readCache, getServerSnapshot);
  const [modal, setModal] = useState<WatchModalState | null>(null);

  const openWatch = useCallback((domain: string, status: string) => {
    setModal({ kind: "form", domain, status });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const submitWatch = useCallback(async (email: string, domain: string) => {
    setModal((m) => (m?.kind === "form" ? { ...m, submitting: true, error: undefined } : m));
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setModal({ kind: "limit", domain });
        return;
      }
      if (!res.ok || typeof data.manageToken !== "string") {
        setModal((m) =>
          m?.kind === "form"
            ? { ...m, submitting: false, error: data.error ?? `Couldn't start the watch (${res.status}).` }
            : m,
        );
        return;
      }
      writeCache(addWatch(readCache(), { domain, token: data.manageToken, addedAt: Date.now() }));
      setModal({ kind: "done", domain, email, manageUrl: data.manageUrl ?? `/watch/${data.manageToken}` });
    } catch {
      setModal((m) =>
        m?.kind === "form" ? { ...m, submitting: false, error: "Couldn't reach the server. Try again." } : m,
      );
    }
  }, []);

  // Remove locally AND stop the watch server-side (the token authorizes it).
  const removeByToken = useCallback((token: string) => {
    writeCache(removeWatch(readCache(), token));
    void fetch(`/api/watch/${token}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const value = useMemo<WatchCtx>(
    () => ({
      watches,
      cap: FREE_WATCH_LIMIT,
      atCap: atCap(watches, FREE_WATCH_LIMIT),
      modal,
      openWatch,
      closeModal,
      submitWatch,
      removeByToken,
    }),
    [watches, modal, openWatch, closeModal, submitWatch, removeByToken],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
