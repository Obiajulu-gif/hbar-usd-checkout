# Agent instructions

Briefing for coding agents (Claude Code, Cursor, Codex) working in the **hbar-usd-checkout** Scaffold-HBAR template. Claude Code loads it through `CLAUDE.md`.

## What this template does

A merchant creates a checkout priced in **USD cents**. A payer pays it in **HBAR**. `Checkout.sol` reads the **Chainlink HBAR/USD data feed** at execution time, takes exactly the HBAR needed, forwards it to the merchant and refunds the rest. A Next.js API route then verifies the payment on the **mirror node** and writes a JSON receipt to a **Hedera Consensus Service (HCS) topic**. The receipts page reads that topic back from the mirror node.

```text
Merchant ──createCheckout(usdCents, memo)──▶ Checkout.sol
Payer ──pay(id) + HBAR──▶ Checkout.sol ──latestRoundData()──▶ Chainlink HBAR/USD
                              │ Paid event
Browser ──POST /api/receipt {txHash}──▶ mirror node /contracts/results/{hash} (verify)
                                     └─▶ TopicMessageSubmitTransaction ──▶ HCS topic
/receipts ──▶ mirror node /topics/{id}/messages
```

## Invariants (do not break)

1. **Units.** Inside the EVM on Hedera, `msg.value` and balances are **tinybars** (1 HBAR = 1e8). Wallets, wagmi and viem send `value` in **weibars** (1 HBAR = 1e18), and the relay drops anything below 1e10 weibars. Convert only through `packages/nextjs/utils/checkout/units.ts` (`tinybarsToWeibars`). Never use `parseEther` for HBAR amounts going into `Checkout`.
2. **Price checks.** `Checkout._checkedPrice` rejects a non-positive answer, `updatedAt == 0`, and prices older than `maxPriceAgeSec`. Keep all three when changing the oracle code.
3. **Rounding.** `requiredTinybars` rounds **up**, so the merchant never receives less than the USD amount.
4. **Checks-effects-interactions in `pay`.** The status flips to `Paid` and the event is emitted before any HBAR moves.
5. **Receipts come from the chain.** `/api/receipt` accepts only a tx hash. Every receipt field is decoded from the mirror node's copy of the `Paid` log (`receiptFromContractResult`). Never accept amounts from the client.
6. **The operator key stays on the server.** `HEDERA_OPERATOR_KEY` is read only in `utils/checkout/hcs.ts` (API routes) and `scripts/createTopic.mjs`. Never give it a `NEXT_PUBLIC_` prefix.
7. **No `eth_getLogs` for history.** Hedera's JSON-RPC relay limits log queries to short block ranges. Read history from the mirror node (receipts) or contract state (`getCheckout`).

## Commands

```bash
yarn next:dev                                  # frontend on http://localhost:3000
yarn hardhat:test                              # contract tests (in-memory chain + MockAggregator)
yarn hardhat:compile
yarn hardhat:deploy --network hederaTestnet    # deploys Checkout, regenerates deployedContracts.ts
yarn hardhat:account:import                    # store an encrypted deployer key
yarn hcs:create-topic                          # create the receipt topic (needs packages/nextjs/.env.local)
yarn next:test                                 # unit tests for units + receipt parsing
yarn lint && yarn next:check-types && yarn next:build   # run all three before declaring work done
```

## Key paths

| Path | Purpose |
| --- | --- |
| `packages/hardhat/contracts/Checkout.sol` | Checkout state, oracle pricing, settlement |
| `packages/hardhat/contracts/interfaces/AggregatorV3Interface.sol` | Minimal Chainlink feed interface |
| `packages/hardhat/contracts/mocks/MockAggregator.sol` | Test-only feed |
| `packages/hardhat/deploy/00_deploy_checkout.ts` | Deploy with the per-network Chainlink feed address |
| `packages/hardhat/test/Checkout.test.ts` | Contract tests |
| `packages/nextjs/app/page.tsx` | Merchant: create a checkout |
| `packages/nextjs/app/pay/[id]/page.tsx` | Payer: live quote, pay, record receipt |
| `packages/nextjs/app/receipts/page.tsx` | HCS receipt feed |
| `packages/nextjs/app/api/receipt/route.ts` | Verify payment on the mirror node, then submit to HCS |
| `packages/nextjs/app/api/health/route.ts` | Liveness check plus whether HCS is configured |
| `packages/nextjs/utils/checkout/` | `units.ts`, `receipt.ts`, `mirror.ts`, `hcs.ts` |
| `packages/nextjs/scripts/createTopic.mjs` | One-time HCS topic creation |
| `packages/nextjs/contracts/deployedContracts.ts` | Generated on deploy. Do not hand-edit |

## Common tasks

**Price in a different currency.** Use a Chainlink feed for HBAR/<currency> on Hedera, pass it as `HBAR_USD_FEED` when deploying, and rename `usdCents`/`formatUsd` to match. The contract math only depends on the feed's `decimals()`.

**Accept an HTS token instead of HBAR.** Add a `payWithToken` path that uses the HTS precompile at `0x167` (or the token's ERC-20 facade) and a second feed for that token. Keep the same rounding and staleness rules.

**Add fields to receipts.** Add them to `Paid` in `Checkout.sol`, redeploy, extend `Receipt` and `receiptFromContractResult` in `utils/checkout/receipt.ts`, and bump `v` so old and new messages can coexist on the topic.

**Add a page.** Create `packages/nextjs/app/<route>/page.tsx` with `"use client"` if it uses hooks, then add it to `menuLinks` in `components/Header.tsx`.

## Frontend conventions

- Contract hooks live in `packages/nextjs/hooks/scaffold-hbar`: `useScaffoldReadContract` and `useScaffoldWriteContract` (not `...ContractRead` / `...ContractWrite`).
- DaisyUI classes for UI. Use `~~/` imports.
- Prefer `type` over `interface`. Comments explain why, not what.

## Package manager

Scaffolds default to Yarn workspaces. If the project was created with `--package-manager npm`, use `npm run <script>` instead of `yarn <script>`.
