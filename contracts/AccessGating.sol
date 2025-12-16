// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ICNUVaults.sol";

interface IPriceFeed {
    function getLatestPrice() external view returns (uint256);
}

interface IStakingVaultOwed {
    function getUserOwed(address user) external view returns (uint256);
}

contract AccessGating is Ownable {
    IERC20 public immutable cnuToken;
    IPriceFeed public priceFeed; // CNU/USD or CNU/ETH

    enum Tier { NONE, CLUB, SILVER, GOLD, PLATINUM, DIAMOND }

    mapping(Tier => uint256) public usdThresholds;

    uint256 public maxPrice = 1_000_000 * 1e18;

    event ThresholdUpdated(Tier tier, uint256 usdAmount);
    event PriceFeedUpdated(address newFeed);
    event MaxPriceUpdated(uint256 maxPrice);

    constructor(address _cnuToken, address _priceFeed) Ownable(msg.sender) {
        require(_cnuToken != address(0), "Invalid token");
        require(_priceFeed != address(0), "Invalid feed");
        cnuToken = IERC20(_cnuToken);
        priceFeed = IPriceFeed(_priceFeed);

        // Default USD thresholds (in 18 decimal USD)
        usdThresholds[Tier.NONE] = 0;
        usdThresholds[Tier.CLUB] = 1; // Any amount > 0, even one wei
        usdThresholds[Tier.SILVER] = 100 * 1e18;
        usdThresholds[Tier.GOLD] = 500 * 1e18;
        usdThresholds[Tier.PLATINUM] = 1_000 * 1e18;
        usdThresholds[Tier.DIAMOND] = 10_000 * 1e18;
    }

    function setThreshold(Tier tier, uint256 amountUSD18) external onlyOwner {
        require(tier > Tier.CLUB && tier <= Tier.DIAMOND, "Invalid tier");
        // Validate reasonable bounds (e.g., $5 to $1M)
        require(amountUSD18 >= 5 * 1e18 && amountUSD18 <= 1_000_000 * 1e18, "Threshold out of bounds");

        for (uint256 i = uint256(Tier.CLUB); i < uint256(tier); i++) {
            require(amountUSD18 > usdThresholds[Tier(i)], "Must be higher than lower tiers");
        }
        for (uint256 i = uint256(tier) + 1; i <= uint256(Tier.DIAMOND); i++) {
            require(amountUSD18 < usdThresholds[Tier(i)], "Must be lower than higher tiers");
        }

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

    function setMaxPrice(uint256 newMaxPrice) external onlyOwner {
        require(newMaxPrice > 0, "Invalid max price");
        maxPrice = newMaxPrice;
        emit MaxPriceUpdated(newMaxPrice);
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
        uint256 balance = cnuToken.balanceOf(user); // 18 decimals
        uint256 stakedOwed = getUserStakedOwed(user);
        return getUSD(balance + stakedOwed);
    }

    function getUserStakedOwed(address user) public view returns (uint256 stakedOwed) {
        address[] memory vaults = ICNUVaults(address(cnuToken)).getStakingVaultHistory();
        for (uint256 i = 0; i < vaults.length; i++) {
            address vault = vaults[i];
            if (vault == address(0) || vault.code.length == 0) continue;
            try IStakingVaultOwed(vault).getUserOwed(user) returns (uint256 owed) {
                stakedOwed += owed;
            } catch {
                // Ignore incompatible vaults
            }
        }
    }

    function getUSD(uint256 amount) public view returns (uint256 usdValue) {
        uint256 price = priceFeed.getLatestPrice();
        require(price > 0 && price <= maxPrice, "Invalid price");
        usdValue = (amount * price) / 1e18;
    }
}
