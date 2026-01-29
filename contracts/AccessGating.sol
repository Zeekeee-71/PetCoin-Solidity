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

/// @title AccessGating
/// @notice Computes access tiers based on CNU holdings and a quote-based price feed.
contract AccessGating is Ownable {
    IERC20 public immutable cnuToken;
    IPriceFeed public priceFeed; // CNU priced in a configurable quote token (18-decimal scaled)

    enum Tier { NONE, CLUB, SILVER, GOLD, PLATINUM, DIAMOND }

    mapping(Tier => uint256) public quoteThresholds;

    uint256 public maxPrice = 1_000_000 * 1e18;

    event ThresholdUpdated(Tier tier, uint256 quoteAmount);
    event PriceFeedUpdated(address newFeed);
    event MaxPriceUpdated(uint256 maxPrice);

    constructor(address _cnuToken, address _priceFeed) Ownable(msg.sender) {
        require(_cnuToken != address(0), "Invalid token");
        require(_priceFeed != address(0), "Invalid feed");
        cnuToken = IERC20(_cnuToken);
        priceFeed = IPriceFeed(_priceFeed);

        // Default quote-denominated thresholds (18 decimals).
        quoteThresholds[Tier.NONE] = 0;
        quoteThresholds[Tier.CLUB] = 1; // Any amount > 0, even one wei
        quoteThresholds[Tier.SILVER] = 100 * 1e18;
        quoteThresholds[Tier.GOLD] = 500 * 1e18;
        quoteThresholds[Tier.PLATINUM] = 1_000 * 1e18;
        quoteThresholds[Tier.DIAMOND] = 10_000 * 1e18;
    }

    /**
     * @notice Update the threshold for a tier in quote token units (18 decimals).
     */
    function setThreshold(Tier tier, uint256 amountQuote18) external onlyOwner {
        require(tier > Tier.CLUB && tier <= Tier.DIAMOND, "Invalid tier");
        // Validate reasonable bounds (e.g., 5 to 1,000,000 in quote units)
        require(amountQuote18 >= 5 * 1e18 && amountQuote18 <= 1_000_000 * 1e18, "Threshold out of bounds");

        for (uint256 i = uint256(Tier.CLUB); i < uint256(tier); i++) {
            require(amountQuote18 > quoteThresholds[Tier(i)], "Must be higher than lower tiers");
        }
        for (uint256 i = uint256(tier) + 1; i <= uint256(Tier.DIAMOND); i++) {
            require(amountQuote18 < quoteThresholds[Tier(i)], "Must be lower than higher tiers");
        }

        quoteThresholds[tier] = amountQuote18;
        emit ThresholdUpdated(tier, amountQuote18);
    }

    /**
     * @notice Set a new price feed for CNU/quote pricing.
     */
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

    /**
     * @notice Cap the max acceptable price from the feed (18 decimals).
     */
    function setMaxPrice(uint256 newMaxPrice) external onlyOwner {
        require(newMaxPrice > 0, "Invalid max price");
        maxPrice = newMaxPrice;
        emit MaxPriceUpdated(newMaxPrice);
    }

    /**
     * @notice Return the current tier based on wallet balance + owed staking rewards.
     */
    function getTier(address user) public view returns (Tier) {
        uint256 quoteValue = getUserValue(user);

        if (quoteValue >= quoteThresholds[Tier.DIAMOND]) return Tier.DIAMOND;
        if (quoteValue >= quoteThresholds[Tier.PLATINUM]) return Tier.PLATINUM;
        if (quoteValue >= quoteThresholds[Tier.GOLD]) return Tier.GOLD;
        if (quoteValue >= quoteThresholds[Tier.SILVER]) return Tier.SILVER;
        if (quoteValue >= quoteThresholds[Tier.CLUB]) return Tier.CLUB;
        return Tier.NONE;
    }

    /**
     * @notice Check if a user satisfies a required tier.
     */
    function hasAccess(address user, Tier requiredTier) external view returns (bool) {
        return getTier(user) >= requiredTier;
    }

    /**
     * @notice Compute the user's total position value in quote token units.
     */
    function getUserValue(address user) public view returns (uint256 quoteValue) {
        uint256 balance = cnuToken.balanceOf(user); // 18 decimals
        uint256 stakedOwed = getUserStakedOwed(user);
        return getQuoteValue(balance + stakedOwed);
    }

    /**
     * @notice Sum owed staking amounts across all known staking vaults.
     */
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

    /**
     * @notice Convert a CNU amount to quote token value using the feed.
     */
    function getQuoteValue(uint256 amount) public view returns (uint256 quoteValue) {
        uint256 price = priceFeed.getLatestPrice();
        require(price > 0 && price <= maxPrice, "Invalid price");
        quoteValue = (amount * price) / 1e18;
    }
}
