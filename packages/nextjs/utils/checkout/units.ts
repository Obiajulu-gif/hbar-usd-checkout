/**
 * HBAR unit handling. Hedera's EVM uses tinybars (1 HBAR = 1e8) inside contracts, while the
 * JSON-RPC relay, wagmi and viem use weibars (1 HBAR = 1e18) for tx.value. The relay divides
 * tx.value by 1e10, so any part below 1e10 weibars is silently dropped. Convert only here.
 */
export const TINYBARS_PER_HBAR = 100_000_000n;
export const WEIBARS_PER_TINYBAR = 10_000_000_000n;

export const tinybarsToWeibars = (tinybars: bigint) => tinybars * WEIBARS_PER_TINYBAR;

/** Adds a slippage buffer (in basis points), rounded up. Checkout refunds whatever is not needed. */
export const withBuffer = (tinybars: bigint, bps: bigint) => tinybars + (tinybars * bps + 9_999n) / 10_000n;

export function formatHbar(tinybars: bigint) {
  const hbar = Number(tinybars) / Number(TINYBARS_PER_HBAR);
  return `${hbar.toLocaleString("en-US", { maximumFractionDigits: 4 })} HBAR`;
}

export const formatUsd = (usdCents: bigint | number) =>
  (Number(usdCents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Parses a typed dollar amount ("25", "25.5", "25.50") into cents. Returns null when invalid or zero. */
export function parseUsdToCents(input: string): bigint | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents > 0n ? cents : null;
}
