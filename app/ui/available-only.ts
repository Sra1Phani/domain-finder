"use client";

// A single persisted "Available only" preference shared by Check and Generate.
// Modeled as an external store (useSyncExternalStore) so it reads localStorage
// without a setState-in-effect and has a stable server snapshot (off), so no
// hydration mismatch.

import { useSyncExternalStore } from "react";

const KEY = "synthname.availableOnly.v1";
let cache: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (cache === null) cache = localStorage.getItem(KEY) === "1";
  return cache;
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getServerSnapshot(): boolean {
  return false;
}

export function useAvailableOnly(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, read, getServerSnapshot);
  const toggle = () => {
    cache = !read();
    localStorage.setItem(KEY, cache ? "1" : "0");
    for (const l of listeners) l();
  };
  return [value, toggle];
}
