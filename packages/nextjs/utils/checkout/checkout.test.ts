import { CHECKOUT, type MirrorContractResult, parseReceipt, receiptFromContractResult } from "./receipt";
import { formatHbar, parseUsdToCents, tinybarsToWeibars, withBuffer } from "./units";
import { type Hex, encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";

describe("units", () => {
  it("converts tinybars to the weibars the JSON-RPC relay expects", () => {
    expect(tinybarsToWeibars(1n)).toBe(10_000_000_000n);
    expect(tinybarsToWeibars(100_000_000n)).toBe(10n ** 18n);
  });

  it("adds a rounded-up slippage buffer", () => {
    expect(withBuffer(10_000n, 100n)).toBe(10_100n);
    expect(withBuffer(1n, 100n)).toBe(2n);
  });

  it("parses dollar input into cents", () => {
    expect(parseUsdToCents("25")).toBe(2500n);
    expect(parseUsdToCents("25.5")).toBe(2550n);
    expect(parseUsdToCents(" 0.01 ")).toBe(1n);
    for (const bad of ["", "0", "0.00", "-1", "1.234", "1e3", "abc", "1,000"]) {
      expect(parseUsdToCents(bad)).toBeNull();
    }
  });

  it("formats tinybars as HBAR", () => {
    expect(formatHbar(12_345_678_900n)).toBe("123.4568 HBAR");
  });
});

describe("receipts", () => {
  const payer = "0x1111111111111111111111111111111111111111";
  const merchant = "0x2222222222222222222222222222222222222222";
  const txHash = `0x${"ab".repeat(32)}` as Hex;

  const paidLog = {
    address: CHECKOUT.address,
    topics: encodeEventTopics({ abi: CHECKOUT.abi, eventName: "Paid", args: { id: 7n, payer, merchant } }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint256" }, { type: "int256" }, { type: "uint8" }, { type: "uint256" }],
      [2500n, 10_000_000_000n, 25_000_000n, 8, 1_700_000_000n],
    ),
  };
  const tx = (overrides: Partial<MirrorContractResult> = {}): MirrorContractResult => ({
    hash: txHash,
    result: "SUCCESS",
    to: CHECKOUT.address,
    logs: [paidLog],
    ...overrides,
  });

  it("builds a receipt from the Paid event", () => {
    expect(receiptFromContractResult(tx())).toEqual({
      v: 1,
      checkoutId: "7",
      payer,
      merchant,
      usdCents: "2500",
      tinybars: "10000000000",
      price: "25000000",
      priceDecimals: 8,
      txHash,
    });
  });

  it("rejects failed, foreign or event-less transactions", () => {
    expect(() => receiptFromContractResult(tx({ result: "CONTRACT_REVERT_EXECUTED" }))).toThrow(/did not succeed/);
    expect(() => receiptFromContractResult(tx({ to: merchant }))).toThrow(/not sent to Checkout/);
    expect(() => receiptFromContractResult(tx({ logs: [] }))).toThrow(/no Paid event/);
    // A Paid-shaped log emitted by another contract must not count.
    expect(() => receiptFromContractResult(tx({ logs: [{ ...paidLog, address: merchant }] }))).toThrow(/no Paid event/);
  });

  it("round-trips through the HCS message format and rejects junk", () => {
    const receipt = receiptFromContractResult(tx());
    expect(parseReceipt(JSON.stringify(receipt))).toEqual(receipt);
    expect(parseReceipt("not json")).toBeNull();
    expect(parseReceipt(JSON.stringify({ ...receipt, v: 2 }))).toBeNull();
    expect(parseReceipt(JSON.stringify({ ...receipt, txHash: "0x123" }))).toBeNull();
  });
});
