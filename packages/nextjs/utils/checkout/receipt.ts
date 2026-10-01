import { type Hex, decodeEventLog, isAddressEqual } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";

export const CHECKOUT = deployedContracts[296].Checkout;

/** The JSON document written to the HCS topic for every paid checkout. */
export type Receipt = {
  v: 1;
  checkoutId: string;
  payer: string;
  merchant: string;
  usdCents: string;
  tinybars: string;
  /** Chainlink HBAR/USD answer used for settlement, scaled by priceDecimals. */
  price: string;
  priceDecimals: number;
  txHash: Hex;
};

export type MirrorContractResult = {
  hash: Hex;
  result: string;
  to: Hex | null;
  logs: { address: Hex; data: Hex; topics: Hex[] }[];
};

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Builds a receipt from a mirror node contract result. Everything comes from the chain,
 * never from the client, so a forged request cannot put a fake payment on the topic.
 */
export function receiptFromContractResult(tx: MirrorContractResult, checkoutAddress: Hex = CHECKOUT.address): Receipt {
  if (tx.result !== "SUCCESS") throw new Error(`Transaction did not succeed (${tx.result})`);
  if (!tx.to || !isAddressEqual(tx.to, checkoutAddress)) throw new Error("Transaction was not sent to Checkout");

  for (const log of tx.logs) {
    if (!isAddressEqual(log.address, checkoutAddress) || log.topics.length === 0) continue;
    try {
      const { eventName, args } = decodeEventLog({
        abi: CHECKOUT.abi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (eventName !== "Paid") continue;
      return {
        v: 1,
        checkoutId: args.id.toString(),
        payer: args.payer,
        merchant: args.merchant,
        usdCents: args.usdCents.toString(),
        tinybars: args.tinybarsPaid.toString(),
        price: args.price.toString(),
        priceDecimals: args.priceDecimals,
        txHash: tx.hash,
      };
    } catch {
      // Not one of our events; keep looking.
    }
  }
  throw new Error("Transaction has no Paid event");
}

/** Parses an HCS message body. Returns null for anything that is not a v1 receipt. */
export function parseReceipt(text: string): Receipt | null {
  try {
    const r = JSON.parse(text) as Partial<Receipt>;
    return r.v === 1 && typeof r.checkoutId === "string" && typeof r.txHash === "string" && TX_HASH_RE.test(r.txHash)
      ? (r as Receipt)
      : null;
  } catch {
    return null;
  }
}
