// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceFeed {
    function getLatestPrice() external view returns (uint256);
}

contract AccessGating is Ownable {
    IERC20 public immutable petToken;
    IPriceFeed public priceFeed; // PETAI/USD or PETAI/ETH

    enum Tier { NONE, CLUB, SILVER, GOLD, PLATINUM, DIAMOND }

    mapping(Tier => uint256) public usdThresholds;

    event ThresholdUpdated(Tier tier, uint256 usdAmount);
    event PriceFeedUpdated(address newFeed);

    constructor(address _petToken, address _priceFeed) Ownable(msg.sender) {
        require(_petToken != address(0), "Invalid token");
        require(_priceFeed != address(0), "Invalid feed");
        petToken = IERC20(_petToken);
        priceFeed = IPriceFeed(_priceFeed);

        // Default USD thresholds (in 18 decimal USD)
        usdThresholds[Tier.NONE] = 0;
        usdThresholds[Tier.CLUB] = 1;
        usdThresholds[Tier.SILVER] = 100 * 1e18;
        usdThresholds[Tier.GOLD] = 500 * 1e18;
        usdThresholds[Tier.PLATINUM] = 1_000 * 1e18;
        usdThresholds[Tier.DIAMOND] = 10_000 * 1e18;
    }

    function setThreshold(Tier tier, uint256 amountUSD18) external onlyOwner {
        require(tier != Tier.NONE, "Invalid tier"); // always 0
        require(tier != Tier.CLUB, "Invalid tier"); // always only just 1 token
        require(tier <= Tier.DIAMOND, "Invalid tier");
        if(tier > Tier.SILVER) {
            require(amountUSD18 > usdThresholds[Tier(uint(tier) - 1)], "Must be higher than previous tier");
        }
        if(tier < Tier.DIAMOND) {
            require(amountUSD18 < usdThresholds[Tier(uint(tier) + 1)], "Must be lower than next tier");
        }
        // Validate reasonable bounds (e.g., $5 to $1M)
        require(amountUSD18 >= 5 * 1e18 && amountUSD18 <= 1_000_000 * 1e18, "Threshold out of bounds");

        usdThresholds[tier] = amountUSD18;
        emit ThresholdUpdated(tier, amountUSD18);
    }

    function setPriceFeed(address newFeed) external onlyOwner {
        require(newFeed != address(0), "Invalid feed");
        require(newFeed.code.length > 0, "Feed must be a contract");
        // validate
        try IPriceFeed(newFeed).getLatestPrice() returns (uint256 price) {
            require(price > 0, "Invalid price from feed");
        } catch {
            revert("Invalid price feed interface");
        }
        priceFeed = IPriceFeed(newFeed);
        emit PriceFeedUpdated(newFeed);
    }

    function getTier(address user) public view returns (Tier) {
        uint256 usdValue = getUserUSD(user);

        if (usdValue >= usdThresholds[Tier.DIAMOND]) return Tier.DIAMOND;
        if (usdValue >= usdThresholds[Tier.PLATINUM]) return Tier.PLATINUM;
        if (usdValue >= usdThresholds[Tier.GOLD]) return Tier.GOLD;
        if (usdValue >= usdThresholds[Tier.SILVER]) return Tier.SILVER;
        if (usdValue >= usdThresholds[Tier.CLUB]) return Tier.CLUB;
        return Tier.NONE;
    }

    function hasAccess(address user, Tier requiredTier) external view returns (bool) {
        return getTier(user) >= requiredTier;
    }

    function getUserUSD(address user) public view returns (uint256 usdValue) {
        uint256 balance = petToken.balanceOf(user); // 18 decimals
        return getUSD(balance);
    }

    function getUSD(uint256 amount) public view returns (uint256 usdValue) {
        uint256 price = priceFeed.getLatestPrice();
        require(price > 0, "Invalid price");
        usdValue = (amount * price) / 1e18;
    }
}
