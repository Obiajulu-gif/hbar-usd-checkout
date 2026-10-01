"use client";

import { useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { parseEventLogs } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { CHECKOUT } from "~~/utils/checkout/receipt";
import { formatUsd, parseUsdToCents } from "~~/utils/checkout/units";

const MAX_MEMO_BYTES = 100;

const Home: NextPage = () => {
  // `isConnected` stays false while wagmi is "reconnecting" after a full page load, even though the
  // wallet is usable; an address means we can send.
  const isConnected = Boolean(useAccount().address);
  const [amount, setAmount] = useState("25.00");
  const [memo, setMemo] = useState("");
  const [createdId, setCreatedId] = useState<bigint>();
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "Checkout" });

  const usdCents = parseUsdToCents(amount);
  const memoTooLong = new TextEncoder().encode(memo).length > MAX_MEMO_BYTES;

  const create = async () => {
    if (!usdCents) return;
    setCreatedId(undefined);
    await writeContractAsync(
      { functionName: "createCheckout", args: [usdCents, memo] },
      {
        onBlockConfirmation: receipt => {
          const [created] = parseEventLogs({ abi: CHECKOUT.abi, logs: receipt.logs, eventName: "CheckoutCreated" });
          setCreatedId(created?.args.id);
        },
      },
    );
  };

  const buttonLabel = isMining
    ? "Creating…"
    : isConnected
      ? `Create ${usdCents ? formatUsd(usdCents) : ""} checkout`
      : "Connect a wallet";

  return (
    <div className="flex flex-col items-center grow px-5 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold mb-2">USD checkout, settled in HBAR</h1>
        <p className="text-base-content/70 mb-8">
          Set a price in dollars. The payer is charged the matching HBAR at the Chainlink HBAR/USD rate when they pay,
          and a receipt is written to the Hedera Consensus Service.
        </p>

        <div className="card bg-base-100 shadow-md border border-base-300">
          <div className="card-body gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Amount (USD)</span>
              <input
                className={`input input-bordered w-full ${amount && !usdCents ? "input-error" : ""}`}
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              {amount && !usdCents && (
                <span className="text-error text-sm">Enter a positive amount with up to 2 decimals.</span>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Memo (optional)</span>
              <input
                className={`input input-bordered w-full ${memoTooLong ? "input-error" : ""}`}
                placeholder="Order #1042"
                value={memo}
                onChange={e => setMemo(e.target.value)}
              />
              {memoTooLong && <span className="text-error text-sm">Memo must be {MAX_MEMO_BYTES} bytes or less.</span>}
            </label>
            <button
              className="btn btn-primary"
              disabled={!isConnected || !usdCents || memoTooLong || isMining}
              onClick={create}
            >
              {buttonLabel}
            </button>
          </div>
        </div>

        {createdId !== undefined && (
          <div role="status" className="alert alert-success mt-6 flex flex-col items-start">
            <span>Checkout #{createdId.toString()} created. Share this link with the payer:</span>
            <Link className="link font-mono break-all" href={`/pay/${createdId}`}>
              {`${window.location.origin}/pay/${createdId}`}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
