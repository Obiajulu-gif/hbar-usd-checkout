import type { MirrorContractResult } from "./receipt";

export const MIRROR_NODE_URL = process.env.NEXT_PUBLIC_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

export type TopicMessage = {
  consensus_timestamp: string;
  sequence_number: number;
  /** base64 */
  message: string;
};

/**
 * Fetches a contract result by tx hash. The mirror node lags consensus by a few seconds,
 * so a 404 right after a payment is retried before giving up.
 */
export async function fetchContractResult(txHash: string, attempts = 6): Promise<MirrorContractResult> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${MIRROR_NODE_URL}/api/v1/contracts/results/${txHash}`, { cache: "no-store" });
    if (res.ok) return (await res.json()) as MirrorContractResult;
    if (res.status !== 404) throw new Error(`Mirror node returned ${res.status}`);
    await new Promise(r => setTimeout(r, 1000 * 2 ** Math.min(i, 3)));
  }
  throw new Error("Transaction not found on the mirror node yet. Try again in a few seconds.");
}

export async function fetchTopicMessages(topicId: string, limit = 100): Promise<TopicMessage[]> {
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?order=desc&limit=${limit}`, {
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Mirror node returned ${res.status}`);
  return ((await res.json()) as { messages: TopicMessage[] }).messages;
}

export const decodeBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

export const hashscanUrl = (kind: "transaction" | "topic" | "contract", id: string) =>
  `https://hashscan.io/testnet/${kind}/${id}`;
