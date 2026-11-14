import { epointConfig } from "./epoint";

/** The configured payment provider. Only Epoint is implemented; see README for setup. */
export const PAYMENT_PROVIDER = "epoint" as const;

/** True when merchant credentials are configured, i.e. the pay buttons can work. */
export function paymentsConfigured(): boolean {
  return epointConfig() !== null;
}
