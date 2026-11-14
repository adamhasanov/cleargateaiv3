"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./http";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  locale: "az" | "ru" | "en";
}

/** undefined = not loaded yet, null = signed out. Shared by every component on the page. */
let current: Me | null | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setMe(me: Me | null): void {
  current = me;
  emit();
}

export function refreshMe(): Promise<void> {
  loading ??= api<{ user: Me | null }>("/api/auth/me").then((r) => {
    loading = null;
    setMe(r.ok ? r.data.user : null);
  });
  return loading;
}

export function useMe(): Me | null | undefined {
  const me = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => undefined,
  );
  useEffect(() => {
    if (current === undefined) void refreshMe();
  }, []);
  return me;
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", body: {} });
  setMe(null);
}
