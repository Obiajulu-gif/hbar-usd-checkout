/**
 * Verifies the deployed Checkout on Sourcify (API v2), which HashScan reads for verified source.
 * hardhat-verify still calls Sourcify API v1, which has been removed.
 * Usage: yarn hardhat:verify:testnet | yarn hardhat:verify:mainnet
 */
import { artifacts, deployments, network } from "hardhat";

const SOURCIFY = "https://sourcify.dev/server";
const CONTRACT = "contracts/Checkout.sol:Checkout";

async function main() {
  const chainId = network.config.chainId;
  if (chainId !== 295 && chainId !== 296) throw new Error(`Run with --network hederaTestnet or hederaMainnet`);

  const { address } = await deployments.get("Checkout");
  const buildInfo = await artifacts.getBuildInfo(CONTRACT);
  if (!buildInfo) throw new Error("No build info. Run `yarn hardhat:compile` first.");

  const res = await fetch(`${SOURCIFY}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "hbar-usd-checkout" },
    body: JSON.stringify({
      stdJsonInput: buildInfo.input,
      compilerVersion: buildInfo.solcLongVersion,
      contractIdentifier: CONTRACT,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sourcify returned ${res.status}: ${JSON.stringify(body)}`);

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 3000));
    const job = await (await fetch(`${SOURCIFY}/v2/verify/${body.verificationId}`)).json();
    if (!job.isJobCompleted) continue;
    if (job.error?.customCode === "already_verified") return report(chainId, address, "already verified");
    if (job.error) throw new Error(`Verification failed: ${JSON.stringify(job.error)}`);
    return report(chainId, address, job.contract.runtimeMatch);
  }
  throw new Error(`Timed out waiting for Sourcify job ${body.verificationId}`);
}

function report(chainId: number, address: string, match: string) {
  console.log(`✅ Checkout ${address}: ${match}`);
  console.log(`HashScan: https://hashscan.io/${chainId === 295 ? "mainnet" : "testnet"}/contract/${address}`);
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
