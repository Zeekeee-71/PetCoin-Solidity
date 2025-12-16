// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockPriceFeed is Ownable {
    uint256 public price = 5e13; // 0.0000005 * 1e18 // Default: $0.0000005 USD with 18 decimals

    constructor() Ownable(msg.sender) { }

    function getLatestPrice() external view returns (uint256) {
        return price;
    }

    // Manual override (testnet use only)
    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
    }
}