import { AccountId, Client, PrivateKey, TopicId, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

export type HcsConfig = { operatorId: string; operatorKey: string; topicId: string };

/** Reads HCS config from server env. Returns null when the template has not been configured yet. */
export function readHcsConfig(): HcsConfig | null {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const topicId = process.env.NEXT_PUBLIC_HCS_TOPIC_ID;
  return operatorId && operatorKey && topicId ? { operatorId, operatorKey, topicId } : null;
}

/** Portal keys come either DER-encoded (302…) or as raw ECDSA hex. */
export const parsePrivateKey = (key: string) =>
  key.startsWith("302") ? PrivateKey.fromStringDer(key) : PrivateKey.fromStringECDSA(key);

export async function submitToTopic(config: HcsConfig, message: string) {
  const client = Client.forTestnet().setOperator(
    AccountId.fromString(config.operatorId),
    parsePrivateKey(config.operatorKey),
  );
  try {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(config.topicId))
      .setMessage(message)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return {
      transactionId: response.transactionId.toString(),
      sequenceNumber: receipt.topicSequenceNumber?.toString() ?? null,
    };
  } finally {
    client.close();
  }
}
