// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockPriceFeed
/// @notice Test-only price feed with manual price control.
contract MockPriceFeed is Ownable {
    uint256 public price = 1e18; // Default: 1.0 quote unit per token (18 decimals)

    constructor() Ownable(msg.sender) { }

    /// @notice Return the current mocked price (quote per token, 18 decimals).
    function getLatestPrice() external view returns (uint256) {
        return price;
    }

    /// @notice Return amountOut in quote units using 18-decimal price.
    function consult(address, uint256 amountIn) external view returns (uint256 amountOut) {
        // amountIn is expected in 18 decimals; keep output in 18 decimals.
        return (amountIn * price) / 1e18;
    }

    /// @notice Manual override for tests or local deployments.
    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
    }
}
