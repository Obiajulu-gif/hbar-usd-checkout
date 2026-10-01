"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { NextPage } from "next";
import type { Hash } from "viem";
import { useAccount } from "wagmi";
import { HederaAddress } from "~~/components/scaffold-hbar";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { hashscanUrl } from "~~/utils/checkout/mirror";
import { formatHbar, formatUsd, tinybarsToWeibars, withBuffer } from "~~/utils/checkout/units";

// 1% headroom for the price moving between quote and execution. Checkout refunds the unused part.
const SLIPPAGE_BPS = 100n;
const STATUS_OPEN = 1;

type ReceiptState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; topicId: string; sequenceNumber: string | number | null }
  | { status: "error"; message: string };

const PayPage: NextPage = () => {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;
  const { isConnected } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [txHash, setTxHash] = useState<Hash>();
  const [receipt, setReceipt] = useState<ReceiptState>({ status: "idle" });

  const { data: order, isLoading } = useScaffoldReadContract({
    contractName: "Checkout",
    functionName: "getCheckout",
    args: [id],
  });
  const isOpen = order?.status === STATUS_OPEN;
  const { data: quote, error: quoteError } = useScaffoldReadContract({
    contractName: "Checkout",
    functionName: "quote",
    args: [id],
    query: { enabled: id !== undefined && isOpen },
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "Checkout" });

  const recordReceipt = async (hash: Hash) => {
    setReceipt({ status: "pending" });
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Receipt API returned ${res.status}`);
      setReceipt({ status: "done", topicId: body.topicId, sequenceNumber: body.sequenceNumber });
    } catch (e) {
      setReceipt({ status: "error", message: (e as Error).message });
    }
  };

  const pay = async () => {
    if (id === undefined || !quote) return;
    const hash = await writeContractAsync({
      functionName: "pay",
      args: [id],
      value: tinybarsToWeibars(withBuffer(quote, SLIPPAGE_BPS)),
    });
    if (hash) {
      setTxHash(hash);
      await recordReceipt(hash);
    }
  };

  if (id === undefined) return <Message>Invalid checkout id.</Message>;
  if (isLoading) return <Message>Loading checkout…</Message>;
  if (!order || order.status === 0) return <Message>Checkout #{params.id} does not exist.</Message>;

  return (
    <div className="flex flex-col items-center grow px-5 py-12">
      <div className="card w-full max-w-lg bg-base-100 shadow-md border border-base-300">
        <div className="card-body gap-4">
          <div className="flex justify-between items-start">
            <h1 className="card-title text-2xl">Checkout #{id.toString()}</h1>
            <span className={`badge ${isOpen ? "badge-primary" : "badge-success"}`}>{isOpen ? "Open" : "Paid"}</span>
          </div>
          {order.memo && <p className="m-0 text-base-content/70">{order.memo}</p>}
          <div className="text-4xl font-bold">{formatUsd(order.usdCents)}</div>
          <div className="text-sm flex items-center gap-2">
            Merchant <HederaAddress address={order.merchant} chain={targetNetwork} />
          </div>

          {isOpen && (
            <>
              <div className="bg-base-200 rounded-xl p-4 text-sm">
                {quoteError ? (
                  <span className="text-error">
                    No fresh HBAR/USD price from Chainlink right now. Payments are paused until the feed updates.
                  </span>
                ) : quote ? (
                  <>
                    You pay <strong>{formatHbar(quote)}</strong> at the live Chainlink rate. The wallet sends up to{" "}
                    {formatHbar(withBuffer(quote, SLIPPAGE_BPS))} and the unused part is refunded in the same
                    transaction.
                  </>
                ) : (
                  "Fetching quote…"
                )}
              </div>
              <button className="btn btn-primary" disabled={!isConnected || !quote || isMining} onClick={pay}>
                {isMining ? "Paying…" : isConnected ? "Pay with HBAR" : "Connect a wallet to pay"}
              </button>
            </>
          )}

          {txHash && (
            <a className="link text-sm" href={hashscanUrl("transaction", txHash)} target="_blank" rel="noreferrer">
              View payment on HashScan
            </a>
          )}
          {receipt.status === "pending" && <p className="text-sm m-0">Writing receipt to HCS…</p>}
          {receipt.status === "done" && (
            <a className="link text-sm" href={hashscanUrl("topic", receipt.topicId)} target="_blank" rel="noreferrer">
              Receipt #{receipt.sequenceNumber ?? "?"} recorded on HCS topic {receipt.topicId}
            </a>
          )}
          {receipt.status === "error" && txHash && (
            <div role="alert" className="alert alert-warning text-sm">
              <span>Payment succeeded but the receipt was not recorded: {receipt.message}</span>
              <button className="btn btn-sm" onClick={() => recordReceipt(txHash)}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Message = ({ children }: { children: React.ReactNode }) => (
  <div className="flex grow items-center justify-center p-12 text-lg">{children}</div>
);

export default PayPage;
