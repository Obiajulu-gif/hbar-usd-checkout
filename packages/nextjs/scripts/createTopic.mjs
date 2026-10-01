// Creates the HCS topic that stores checkout receipts. Only the operator key can submit to it.
// Usage: yarn hcs:create-topic   (reads HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY from .env.local)
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";

const { HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY } = process.env;
if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
  console.error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env.local first.");
  process.exit(1);
}

const key = HEDERA_OPERATOR_KEY.startsWith("302")
  ? PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY)
  : PrivateKey.fromStringECDSA(HEDERA_OPERATOR_KEY);
const client = Client.forTestnet().setOperator(AccountId.fromString(HEDERA_OPERATOR_ID), key);

try {
  const response = await new TopicCreateTransaction()
    .setTopicMemo("hbar-usd-checkout receipts v1")
    .setSubmitKey(key.publicKey)
    .execute(client);
  const { topicId } = await response.getReceipt(client);
  console.log(`Topic created: ${topicId}`);
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);
  console.log(`\nAdd to packages/nextjs/.env.local:\nNEXT_PUBLIC_HCS_TOPIC_ID=${topicId}`);
} finally {
  client.close();
}
