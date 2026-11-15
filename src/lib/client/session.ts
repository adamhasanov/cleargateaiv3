"use client";

/** Compatibility shim: the demo session now lives in demo.ts (browser only, no server). */
export { signOut as logout, useMe, type Me } from "./demo";
