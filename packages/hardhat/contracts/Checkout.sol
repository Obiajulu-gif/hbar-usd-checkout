// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";

/// @title Checkout
/// @notice USD-priced checkouts settled in HBAR. The HBAR amount is computed at payment time
///         from the Chainlink HBAR/USD data feed, so the merchant always receives the USD value.
/// @dev On Hedera, msg.value and balances inside the EVM are in tinybars (1 HBAR = 1e8 tinybars),
///      so every HBAR amount in this contract is in tinybars.
contract Checkout {
    enum Status {
        None,
        Open,
        Paid
    }

    struct Order {
        address merchant;
        uint64 usdCents;
        Status status;
        address payer;
        string memo;
    }

    uint256 public constant MAX_MEMO_BYTES = 100;
    uint256 private constant TINYBARS_PER_HBAR = 1e8;
    uint256 private constant CENTS_PER_USD = 100;

    AggregatorV3Interface public immutable priceFeed;
    uint256 public immutable maxPriceAgeSec;

    uint256 public checkoutCount;
    mapping(uint256 => Order) private orders;

    event CheckoutCreated(uint256 indexed id, address indexed merchant, uint64 usdCents, string memo);
    event Paid(
        uint256 indexed id,
        address indexed payer,
        address indexed merchant,
        uint64 usdCents,
        uint256 tinybarsPaid,
        int256 price,
        uint8 priceDecimals,
        uint256 priceUpdatedAt
    );

    error ZeroAmount();
    error MemoTooLong();
    error UnknownCheckout(uint256 id);
    error AlreadyPaid(uint256 id);
    error InvalidPrice();
    error StalePrice(uint256 updatedAt);
    error Underpaid(uint256 required, uint256 sent);
    error TransferFailed();

    constructor(address priceFeed_, uint256 maxPriceAgeSec_) {
        priceFeed = AggregatorV3Interface(priceFeed_);
        maxPriceAgeSec = maxPriceAgeSec_;
    }

    function createCheckout(uint64 usdCents, string calldata memo) external returns (uint256 id) {
        if (usdCents == 0) revert ZeroAmount();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();

        id = ++checkoutCount;
        orders[id] = Order({ merchant: msg.sender, usdCents: usdCents, status: Status.Open, payer: address(0), memo: memo });
        emit CheckoutCreated(id, msg.sender, usdCents, memo);
    }

    function getCheckout(uint256 id) external view returns (Order memory) {
        return orders[id];
    }

    /// @notice Tinybars required to pay checkout `id` at the current oracle price.
    function quote(uint256 id) external view returns (uint256) {
        Order storage order = _open(id);
        (int256 price, uint8 decimals, ) = _checkedPrice();
        return requiredTinybars(order.usdCents, price, decimals);
    }

    /// @dev Send at least `quote(id)`; the price can move between quote and execution,
    ///      so frontends add a small buffer and the excess is refunded.
    function pay(uint256 id) external payable {
        Order storage order = _open(id);
        (int256 price, uint8 decimals, uint256 updatedAt) = _checkedPrice();
        uint256 required = requiredTinybars(order.usdCents, price, decimals);
        if (msg.value < required) revert Underpaid(required, msg.value);

        order.status = Status.Paid;
        order.payer = msg.sender;
        address merchant = order.merchant;
        emit Paid(id, msg.sender, merchant, order.usdCents, required, price, decimals, updatedAt);

        _send(merchant, required);
        if (msg.value > required) _send(msg.sender, msg.value - required);
    }

    /// @notice Converts USD cents to tinybars at `price / 10^decimals` USD per HBAR, rounding up
    ///         so the merchant never receives less than the USD amount.
    function requiredTinybars(uint64 usdCents, int256 price, uint8 decimals) public pure returns (uint256) {
        if (price <= 0) revert InvalidPrice();
        // tinybars = usdCents / 100 * 1e8 * 10^decimals / price
        uint256 numerator = uint256(usdCents) * (TINYBARS_PER_HBAR / CENTS_PER_USD) * 10 ** decimals;
        uint256 denominator = uint256(price);
        return (numerator + denominator - 1) / denominator;
    }

    function _checkedPrice() private view returns (int256 price, uint8 decimals, uint256 updatedAt) {
        (, price, , updatedAt, ) = priceFeed.latestRoundData();
        if (price <= 0) revert InvalidPrice();
        // Guard the subtraction: a feed timestamp can land a moment ahead of the block timestamp.
        if (updatedAt == 0 || (block.timestamp > updatedAt && block.timestamp - updatedAt > maxPriceAgeSec)) {
            revert StalePrice(updatedAt);
        }
        decimals = priceFeed.decimals();
    }

    function _open(uint256 id) private view returns (Order storage order) {
        order = orders[id];
        if (order.status == Status.None) revert UnknownCheckout(id);
        if (order.status == Status.Paid) revert AlreadyPaid(id);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }
}
