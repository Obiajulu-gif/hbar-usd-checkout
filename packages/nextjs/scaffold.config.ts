import type { ChainFees } from "viem";
import { getGasPrice } from "viem/actions";
import * as chains from "viem/chains";

export type ScaffoldConfig = {
  targetNetworks: readonly [chains.Chain, ...chains.Chain[]];
  pollingInterval: number;
  rpcOverrides?: Record<number, string>;
  enableBurnerWallet: boolean;
  walletConnectProjectId: string;
};

const hederaLocalFork = {
  ...chains.hardhat,
  name: "Hedera Local Fork",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    // Note: HBAR has 8 protocol decimals (tinybar),
    // but JSON-RPC msg.value & gasPrice use 18 decimals for EVM compatibility.
    // We keep 18 here so tx.value formatting matches what viem/hardhat return.
    decimals: 18,
  },
} as const satisfies chains.Chain;

// Hashio's eth_getBlockByNumber reports a placeholder baseFeePerGas (e.g. 81 wei) while the real
// minimum is eth_gasPrice (850 gwei on testnet). viem's default estimate derives fees from that base
// fee, so transactions sent by in-app wallets get rejected with "Gas price below configured minimum".
const hederaFees: ChainFees = {
  async estimateFeesPerGas({ client, type }) {
    const gasPrice = await getGasPrice(client);
    return type === "legacy" ? { gasPrice } : { maxFeePerGas: gasPrice, maxPriorityFeePerGas: 0n };
  },
};

const targetNetworks = [
  { ...chains.hederaTestnet, fees: hederaFees },
  { ...chains.hedera, fees: hederaFees },
  hederaLocalFork,
] as const satisfies readonly [chains.Chain, ...chains.Chain[]];

const scaffoldConfig = {
  targetNetworks,

  pollingInterval: 10000,

  enableBurnerWallet: true,

  rpcOverrides: {
    [chains.hedera.id]: process.env.NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL || "https://mainnet.hashio.io/api",
    [chains.hederaTestnet.id]: process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
  },

  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
