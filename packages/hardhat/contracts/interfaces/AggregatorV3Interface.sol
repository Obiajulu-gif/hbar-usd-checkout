// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The subset of Chainlink's AggregatorV3Interface that Checkout reads.
/// @dev Full interface: https://docs.chain.link/data-feeds/api-reference
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
