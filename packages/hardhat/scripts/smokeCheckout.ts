/**
 * End-to-end check against a live deployment: create a $0.25 checkout, quote it, pay it.
 * Usage: yarn hardhat:smoke --network hederaTestnet
 */
import { ethers, deployments, network } from "hardhat";
import type { Checkout } from "../typechain-types";

const WEIBARS_PER_TINYBAR = 10_000_000_000n;
const USD_CENTS = 25n;

async function main() {
  const { address } = await deployments.get("Checkout");
  const checkout = (await ethers.getContractAt("Checkout", address)) as unknown as Checkout;
  const hashscan = (tx: string) =>
    `https://hashscan.io/${network.name === "hederaMainnet" ? "mainnet" : "testnet"}/transaction/${tx}`;

  const created = await (await checkout.createCheckout(USD_CENTS, "smoke test")).wait();
  const event = created!.logs.map(log => checkout.interface.parseLog(log)).find(e => e?.name === "CheckoutCreated");
  const id: bigint = event!.args.id;
  console.log(`createCheckout #${id}: ${hashscan(created!.hash)}`);

  const quote = await checkout.quote(id);
  console.log(`quote: ${quote} tinybars (${Number(quote) / 1e8} HBAR) for $0.25`);

  // quote() is in tinybars; tx.value through the JSON-RPC relay is in weibars. Add 1% for price movement.
  const value = (quote + quote / 100n + 1n) * WEIBARS_PER_TINYBAR;
  const paid = await (await checkout.pay(id, { value })).wait();
  console.log(`pay #${id}: ${hashscan(paid!.hash)}`);

  const order = await checkout.getCheckout(id);
  if (order.status !== 2n) throw new Error(`Expected checkout #${id} to be Paid, got status ${order.status}`);
  console.log("✅ Checkout paid");
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
