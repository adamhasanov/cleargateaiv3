"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getPlan, type Plan, type PlanCode } from "@/lib/billing/plans";
import type { RiskScore } from "@/lib/engine/risk";
import type { CheckResult, DocumentExtraction, DocumentId } from "@/lib/engine/types";
import { fundingFor, usageFor, visibleChecks, type Usage } from "./demo-logic";

/**
 * MVP demo store. There is NO server-side account or database: the "signed-in
 * user" and everything they do live in this browser's localStorage only, and
 * nothing here is verified or sent anywhere. Falls back to memory if storage
 * is unavailable (private mode), in which case data lasts until the tab closes.
 */

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "user";
  locale: "az" | "ru" | "en";
}

export interface DemoCheck {
  id: string;
  createdAt: string;
  documentNames: Partial<Record<DocumentId, string>>;
  result: CheckResult;
  risk: RiskScore | null;
  /** Extracted values only (no file content); lets the advisor recompute the result. */
  extractions: DocumentExtraction[];
}

export interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface DemoChat {
  id: string;
  title: string;
  checkId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: DemoMessage[];
}

export interface DemoData {
  plan: PlanCode;
  /** Simulated single-check credits ("Buy one check"). */
  credits: number;
  checks: DemoCheck[];
  chats: DemoChat[];
}

const SESSION_KEY = "cg-demo:session";
const dataKey = (email: string) => `cg-demo:data:${email.toLowerCase()}`;
const EMPTY: DemoData = { plan: "free", credits: 0, checks: [], chats: [] };
const MAX_CHECKS = 50;
const MAX_CHATS = 30;

// ---------- storage with memory fallback ----------

const memory = new Map<string, string>();
function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* storage blocked: use memory */
  }
  return memory.get(key) ?? null;
}
function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: memory only */
  }
}

// ---------- external store ----------

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let session: Me | null | undefined; // undefined = not read yet
const dataCache = new Map<string, DemoData>();

function readSession(): Me | null {
  try {
    const raw = read(SESSION_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Me>) : null;
    if (p && typeof p.id === "string" && typeof p.email === "string") {
      return { id: p.id, email: p.email, name: p.name ?? "", role: "user", locale: p.locale === "ru" || p.locale === "en" ? p.locale : "az" };
    }
  } catch {
    /* corrupt value: treat as signed out */
  }
  return null;
}

function readData(email: string): DemoData {
  try {
    const raw = read(dataKey(email));
    const p = raw ? (JSON.parse(raw) as Partial<DemoData>) : null;
    if (p) {
      return {
        plan: getPlan(String(p.plan)) ? (p.plan as PlanCode) : "free",
        credits: Number.isFinite(p.credits) ? Math.max(0, Number(p.credits)) : 0,
        checks: Array.isArray(p.checks) ? p.checks : [],
        chats: Array.isArray(p.chats) ? p.chats : [],
      };
    }
  } catch {
    /* corrupt value: start empty */
  }
  return { ...EMPTY };
}

function currentSession(): Me | null | undefined {
  if (typeof window === "undefined") return undefined;
  if (session === undefined) session = readSession();
  return session;
}

function currentData(): DemoData | null {
  const me = currentSession();
  if (!me) return null;
  const key = me.email.toLowerCase();
  let d = dataCache.get(key);
  if (!d) {
    d = readData(key);
    dataCache.set(key, d);
  }
  return d;
}

// ---------- session (fake sign in / sign up) ----------

export function useMe(): Me | null | undefined {
  return useSyncExternalStore(subscribe, currentSession, () => undefined);
}

/** Fake sign-in: any values are accepted; nothing is checked or sent. */
export function signIn(input: { email: string; name?: string; locale: Me["locale"] }): Me {
  const email = input.email.trim().toLowerCase();
  const local = email.split("@")[0] ?? "";
  const name = (input.name ?? "").trim() || local.charAt(0).toUpperCase() + local.slice(1);
  const me: Me = { id: `demo-${email}`, email, name, role: "user", locale: input.locale };
  session = me;
  write(SESSION_KEY, JSON.stringify(me));
  emit();
  return me;
}

export function signOut(): void {
  session = null;
  write(SESSION_KEY, null);
  emit();
}

export function updateProfile(patch: Partial<Pick<Me, "name" | "locale">>): void {
  const me = currentSession();
  if (!me) return;
  session = { ...me, ...patch };
  write(SESSION_KEY, JSON.stringify(session));
  emit();
}

// ---------- demo data ----------

export function useDemoData(): DemoData | null | undefined {
  return useSyncExternalStore(subscribe, () => (currentSession() === undefined ? undefined : currentData()), () => undefined);
}

export function updateDemoData(fn: (d: DemoData) => DemoData): void {
  const me = currentSession();
  const d = currentData();
  if (!me || !d) return;
  const next = fn(d);
  const trimmed: DemoData = { ...next, checks: next.checks.slice(0, MAX_CHECKS), chats: next.chats.slice(0, MAX_CHATS) };
  dataCache.set(me.email.toLowerCase(), trimmed);
  write(dataKey(me.email), JSON.stringify(trimmed));
  emit();
}

/** Erases this demo user's data in this browser (plan, history, chats). */
export function resetDemoData(): void {
  updateDemoData(() => ({ ...EMPTY, checks: [], chats: [] }));
}

export const newId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- derived account view ----------

export interface DemoAccount {
  plan: Plan;
  usage: Usage;
  credits: number;
  funding: "plan" | "credit" | null;
  /** Checks inside the plan's history window, newest first. */
  checks: DemoCheck[];
}

export function useDemoAccount(): DemoAccount | null | undefined {
  const data = useDemoData();
  return useMemo(() => {
    if (!data) return data;
    const plan = getPlan(data.plan)!;
    const usage = usageFor(plan, data.checks);
    return { plan, usage, credits: data.credits, funding: fundingFor(usage, data.credits), checks: visibleChecks(plan, data.checks) };
  }, [data]);
}
