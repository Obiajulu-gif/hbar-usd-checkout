import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// Chainlink HBAR/USD data feeds on Hedera. Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera
const HBAR_USD_FEEDS: Record<string, string> = {
  hederaTestnet: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  hederaMainnet: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
  // `yarn hardhat:chain` forks testnet, so the testnet feed exists there too.
  localhost: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
};

const deployCheckout: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const feed = process.env.HBAR_USD_FEED || HBAR_USD_FEEDS[hre.network.name];
  if (!feed) {
    throw new Error(`No HBAR/USD feed for network "${hre.network.name}". Set HBAR_USD_FEED in packages/hardhat/.env.`);
  }

  await hre.deployments.deploy("Checkout", {
    from: deployer,
    args: [feed, Number(process.env.MAX_PRICE_AGE_SEC || 3600)],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployCheckout.tags = ["Checkout"];
export default deployCheckout;
