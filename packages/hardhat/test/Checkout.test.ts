import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Checkout, MockAggregator } from "../typechain-types";

const MAX_AGE = 3600;
const DECIMALS = 8;
// $0.25 per HBAR with 8 decimals, like the Chainlink HBAR/USD feed.
const PRICE = 25_000_000n;
// $25.00 at $0.25/HBAR = 100 HBAR = 1e10 tinybars.
const USD_CENTS = 2500n;
const REQUIRED = 10_000_000_000n;

describe("Checkout", () => {
  async function setup() {
    const [merchant, payer, stranger] = await ethers.getSigners();
    const feed = (await (await ethers.getContractFactory("MockAggregator")).deploy(DECIMALS)) as MockAggregator;
    await feed.setPrice(PRICE, await time.latest());
    const checkout = (await (
      await ethers.getContractFactory("Checkout")
    ).deploy(await feed.getAddress(), MAX_AGE)) as Checkout;
    await checkout.connect(merchant).createCheckout(USD_CENTS, "order #1");
    return { checkout, feed, merchant, payer, stranger };
  }

  it("quotes the tinybars needed at the current price", async () => {
    const { checkout } = await setup();
    expect(await checkout.quote(1)).to.equal(REQUIRED);
  });

  it("pays the merchant and emits Paid with the price used", async () => {
    const { checkout, feed, merchant, payer } = await setup();
    const [, , , updatedAt] = await feed.latestRoundData();

    const tx = checkout.connect(payer).pay(1, { value: REQUIRED });

    await expect(tx).to.changeEtherBalances([merchant, payer], [REQUIRED, -REQUIRED]);
    await expect(tx)
      .to.emit(checkout, "Paid")
      .withArgs(1, payer.address, merchant.address, USD_CENTS, REQUIRED, PRICE, DECIMALS, updatedAt);
    const order = await checkout.getCheckout(1);
    expect(order.status).to.equal(2n);
    expect(order.payer).to.equal(payer.address);
  });

  it("refunds overpayment to the payer", async () => {
    const { checkout, merchant, payer } = await setup();
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED + 123_456n })).to.changeEtherBalances(
      [merchant, payer],
      [REQUIRED, -REQUIRED],
    );
  });

  it("uses the price at execution time, not at quote time", async () => {
    const { checkout, feed, merchant, payer } = await setup();
    // HBAR doubles in price between quote and pay: the payer owes half as much and gets the rest back.
    await feed.setPrice(PRICE * 2n, await time.latest());
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED })).to.changeEtherBalances(
      [merchant, payer],
      [REQUIRED / 2n, -REQUIRED / 2n],
    );
  });

  it("reverts when underpaid", async () => {
    const { checkout, payer } = await setup();
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED - 1n }))
      .to.be.revertedWithCustomError(checkout, "Underpaid")
      .withArgs(REQUIRED, REQUIRED - 1n);
  });

  it("reverts on a stale price", async () => {
    const { checkout, feed, payer } = await setup();
    const updatedAt = (await time.latest()) - MAX_AGE - 1;
    await feed.setPrice(PRICE, updatedAt);
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED }))
      .to.be.revertedWithCustomError(checkout, "StalePrice")
      .withArgs(updatedAt);
    await expect(checkout.quote(1)).to.be.revertedWithCustomError(checkout, "StalePrice");
  });

  it("reverts when the feed has never reported", async () => {
    const { checkout, feed, payer } = await setup();
    await feed.setPrice(PRICE, 0);
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED })).to.be.revertedWithCustomError(
      checkout,
      "StalePrice",
    );
  });

  it("reverts on a non-positive price", async () => {
    const { checkout, feed, payer } = await setup();
    await feed.setPrice(0, await time.latest());
    await expect(checkout.connect(payer).pay(1, { value: REQUIRED })).to.be.revertedWithCustomError(
      checkout,
      "InvalidPrice",
    );
  });

  it("rejects paying twice and paying unknown checkouts", async () => {
    const { checkout, payer } = await setup();
    await checkout.connect(payer).pay(1, { value: REQUIRED });

    await expect(checkout.connect(payer).pay(1, { value: REQUIRED }))
      .to.be.revertedWithCustomError(checkout, "AlreadyPaid")
      .withArgs(1);
    await expect(checkout.connect(payer).pay(99, { value: REQUIRED }))
      .to.be.revertedWithCustomError(checkout, "UnknownCheckout")
      .withArgs(99);
  });

  it("validates createCheckout input", async () => {
    const { checkout, stranger } = await setup();
    await expect(checkout.connect(stranger).createCheckout(0, "")).to.be.revertedWithCustomError(
      checkout,
      "ZeroAmount",
    );
    await expect(checkout.connect(stranger).createCheckout(1, "x".repeat(101))).to.be.revertedWithCustomError(
      checkout,
      "MemoTooLong",
    );
    await expect(checkout.connect(stranger).createCheckout(1, "ok"))
      .to.emit(checkout, "CheckoutCreated")
      .withArgs(2, stranger.address, 1, "ok");
  });

  describe("requiredTinybars", () => {
    it("converts with 8 decimals", async () => {
      const { checkout } = await setup();
      expect(await checkout.requiredTinybars(USD_CENTS, PRICE, 8)).to.equal(REQUIRED);
    });

    it("converts with other decimals", async () => {
      const { checkout } = await setup();
      expect(await checkout.requiredTinybars(USD_CENTS, 25_000n, 5)).to.equal(REQUIRED);
      // $2 per HBAR at 0 decimals: $1.00 = 0.5 HBAR.
      expect(await checkout.requiredTinybars(100n, 2n, 0)).to.equal(50_000_000n);
    });

    it("rounds up in the merchant's favour", async () => {
      const { checkout } = await setup();
      // 1 cent at $0.30/HBAR = 3_333_333.33 tinybars.
      expect(await checkout.requiredTinybars(1n, 30_000_000n, 8)).to.equal(3_333_334n);
    });
  });
});
