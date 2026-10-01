"use client";

import type { NextPage } from "next";
import { useQuery } from "@tanstack/react-query";
import { decodeBase64, fetchTopicMessages, hashscanUrl } from "~~/utils/checkout/mirror";
import { parseReceipt } from "~~/utils/checkout/receipt";
import { formatHbar, formatUsd } from "~~/utils/checkout/units";

const TOPIC_ID = process.env.NEXT_PUBLIC_HCS_TOPIC_ID;

const ReceiptsPage: NextPage = () => {
  const { data, error, isLoading } = useQuery({
    queryKey: ["hcs-receipts", TOPIC_ID],
    enabled: Boolean(TOPIC_ID),
    refetchInterval: 10_000,
    queryFn: async () =>
      (await fetchTopicMessages(TOPIC_ID as string)).flatMap(m => {
        const receipt = parseReceipt(decodeBase64(m.message));
        return receipt ? [{ ...receipt, seq: m.sequence_number, at: m.consensus_timestamp }] : [];
      }),
  });

  return (
    <div className="flex flex-col items-center grow px-5 py-12">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Receipts</h1>
        <p className="text-base-content/70 mb-6">
          Every paid checkout in consensus order, read from the HCS topic through the mirror node.{" "}
          {TOPIC_ID && (
            <a className="link" href={hashscanUrl("topic", TOPIC_ID)} target="_blank" rel="noreferrer">
              Topic {TOPIC_ID}
            </a>
          )}
        </p>

        {!TOPIC_ID && (
          <div role="alert" className="alert alert-info">
            Set NEXT_PUBLIC_HCS_TOPIC_ID in packages/nextjs/.env.local. Create a topic with yarn hcs:create-topic.
          </div>
        )}
        {error && (
          <div role="alert" className="alert alert-error">
            {error.message}
          </div>
        )}
        {isLoading && <p>Loading receipts…</p>}
        {data?.length === 0 && <p>No receipts yet. Pay a checkout to create one.</p>}

        {data && data.length > 0 && (
          <div className="overflow-x-auto bg-base-100 rounded-2xl border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Checkout</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Consensus time</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.seq}>
                    <td>{r.seq}</td>
                    <td>{r.checkoutId}</td>
                    <td>{formatUsd(BigInt(r.usdCents))}</td>
                    <td>{formatHbar(BigInt(r.tinybars))}</td>
                    <td>{new Date(Number(r.at.split(".")[0]) * 1000).toLocaleString()}</td>
                    <td>
                      <a className="link" href={hashscanUrl("transaction", r.txHash)} target="_blank" rel="noreferrer">
                        {r.txHash.slice(0, 10)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptsPage;
