import { NextResponse } from "next/server";
import { readHcsConfig, submitToTopic } from "~~/utils/checkout/hcs";
import { decodeBase64, fetchContractResult, fetchTopicMessages } from "~~/utils/checkout/mirror";
import { TX_HASH_RE, parseReceipt, receiptFromContractResult } from "~~/utils/checkout/receipt";

// ponytail: per-process dedupe plus a scan of the latest 100 topic messages. Move to a DB unique
// index on txHash if several server instances run or the topic grows past a page of recent receipts.
const submitted = new Set<string>();

/**
 * POST { txHash } after a successful Checkout.pay. Verifies the payment on the mirror node and
 * writes a receipt to the HCS topic. Safe to call more than once for the same payment.
 */
export async function POST(req: Request) {
  const config = readHcsConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "HCS receipts are not configured. Set HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY and NEXT_PUBLIC_HCS_TOPIC_ID.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { txHash?: unknown } | null;
  const txHash = typeof body?.txHash === "string" ? body.txHash.toLowerCase() : "";
  if (!TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: "Body must be { txHash: 0x-prefixed 32-byte hash }" }, { status: 400 });
  }

  let receipt;
  try {
    receipt = receiptFromContractResult(await fetchContractResult(txHash));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  try {
    const existing = (await fetchTopicMessages(config.topicId))
      .map(m => ({ seq: m.sequence_number, r: parseReceipt(decodeBase64(m.message)) }))
      .find(({ r }) => r?.txHash.toLowerCase() === txHash);
    if (existing || submitted.has(txHash)) {
      return NextResponse.json({
        receipt,
        topicId: config.topicId,
        sequenceNumber: existing?.seq ?? null,
        duplicate: true,
      });
    }

    submitted.add(txHash);
    const result = await submitToTopic(config, JSON.stringify(receipt));
    return NextResponse.json({ receipt, topicId: config.topicId, ...result, duplicate: false });
  } catch (e) {
    submitted.delete(txHash);
    console.error("[api/receipt]", e);
    return NextResponse.json({ error: "Could not write the receipt to HCS. Try again." }, { status: 502 });
  }
}
