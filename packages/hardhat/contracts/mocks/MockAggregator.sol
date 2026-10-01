// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

/// @notice Test-only price feed. Never deployed to Hedera.
contract MockAggregator is AggregatorV3Interface {
    uint8 public immutable decimals;
    int256 private answer;
    uint256 private updatedAt;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setPrice(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
