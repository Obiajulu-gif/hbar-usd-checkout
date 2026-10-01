# Hardhat package (Hedera)

Hardhat config, contracts, deploy scripts, tests, and Hashscan verification for this monorepo.

## Local development

From the repo root, use the explicit `hardhat:*` scripts for this package. Inside `packages/hardhat`, use the unprefixed package-local scripts.

1. **Start the local chain** (terminal 1, from repo root):
   ```bash
   yarn hardhat:chain
   ```
   This starts `hardhat node` with **Hedera testnet forking** (`HEDERA_FORKING=true` and `@hashgraph/system-contracts-forking`). JSON-RPC is served at **http://127.0.0.1:8545**.

2. **Deploy to the running fork** (terminal 2):
   ```bash
   yarn hardhat:deploy --network localhost
   ```
   Use **`localhost`** so Hardhat connects to the long-running node on port 8545.

   **`yarn hardhat:deploy` without `--network localhost`** uses the default network `hardhat`, which is the **in-process ephemeral** Hardhat network—**not** the same process as `yarn hardhat:chain`. For deploys against the forked node you started in step 1, always pass **`--network localhost`** while that node is running.

3. **Run contract tests** (from repo root; tests run on an in-memory chain with `MockAggregator`, no network needed):
   ```bash
   yarn hardhat:test
   ```

## Deploy and verify on Hedera testnet/mainnet

You need a deployer account with HBAR on the target network. Without funds, deploy and verify will fail with "Sender account not found".

1. **Generate or import an account** (from the repo root):
   ```bash
   yarn hardhat:account:generate
   ```
   or
   ```bash
   yarn hardhat:account:import
   ```
   The encrypted key is stored in `packages/hardhat/.env`.

2. **Fund the account on testnet:**  
   Use the [Hedera Portal faucet](https://portal.hedera.com/faucet) to receive testnet HBAR.

3. **Deploy to Hedera testnet** (from repo root):
   ```bash
   yarn hardhat:deploy --network hederaTestnet
   ```
   You will be prompted for the password that decrypts your deployer key. The deploy picks the Chainlink HBAR/USD feed for the network and regenerates `packages/nextjs/contracts/deployedContracts.ts`.

4. **Smoke-test the live deployment**: creates a $0.25 checkout, quotes it, pays it and prints HashScan links.
   ```bash
   yarn hardhat:smoke --network hederaTestnet
   ```

5. **Verify on Sourcify** (shows as verified on HashScan):
   ```bash
   yarn hardhat:verify:testnet   # Sourcify API v2, reads deployments/hederaTestnet
   ```

## Layout

- `contracts/Checkout.sol`: checkouts, Chainlink pricing, settlement
- `contracts/interfaces/AggregatorV3Interface.sol`: minimal Chainlink feed interface
- `contracts/mocks/MockAggregator.sol`: test-only feed
- `deploy/00_deploy_checkout.ts`: per-network feed addresses
- `scripts/`: account management, `smokeCheckout.ts`, ABI generation
- `test/Checkout.test.ts`: contract tests
- `hardhat.config.ts`: networks (`hardhat`, `localhost` for RPC at 127.0.0.1:8545, `hederaTestnet`, `hederaMainnet`)

Network and RPC URLs are in `hardhat.config.ts`. Deployer key is read from `.env` (encrypted) and decrypted at deploy time for live networks.
