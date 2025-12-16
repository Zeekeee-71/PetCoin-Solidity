// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title UniswapV2PriceFeed - TWAP adapter for AccessGating or Vault logic
/// @notice Tracks a time-weighted average price from a Uniswap V2 pair
contract UniswapV2PriceFeed is Ownable {
    IUniswapV2Pair public immutable pair;

    uint256 public priceCumulativeLast;
    uint32 public blockTimestampLast;
    uint256 public priceAverageUQ112x112;
    uint32 public lastUpdateTimestamp;

    event DebugTimeElapsed(uint256 blockTimestamp, uint256 blockTimestampLast, uint256 timeElapsed);

    uint32 public constant MIN_UPDATE_INTERVAL = 1800; // 30 minutes

    constructor(address _pair) Ownable(msg.sender) {
        pair = IUniswapV2Pair(_pair);

        try pair.price0CumulativeLast() returns (uint256 price) {
            priceCumulativeLast = price;
        } catch {
            priceCumulativeLast = 0;
        }

        try pair.getReserves() returns (uint112, uint112, uint32 timestamp) {
            blockTimestampLast = timestamp;
            lastUpdateTimestamp = timestamp;
        } catch {
            blockTimestampLast = uint32(block.timestamp);
            lastUpdateTimestamp = uint32(block.timestamp);
        }
    }

    /// @notice Updates the TWAP price. Should be called periodically (e.g., every 30+ minutes)
    function update() external {
        (uint256 price0Cumulative, , uint32 blockTimestamp) = currentCumulativePrices();

        uint32 timeElapsed = blockTimestamp - blockTimestampLast;

        emit DebugTimeElapsed(blockTimestamp, blockTimestampLast, timeElapsed);


        require(timeElapsed >= MIN_UPDATE_INTERVAL, "UniswapV2PriceFeed: TOO_SOON");

        priceAverageUQ112x112 = (price0Cumulative - priceCumulativeLast) / timeElapsed;

        priceCumulativeLast = price0Cumulative;
        blockTimestampLast = blockTimestamp;
        lastUpdateTimestamp = blockTimestamp;
    }

    /// @notice Returns the TWAP-scaled price as a uint256 (18 decimals assumed post-scaling)
    function getLatestPrice() external view returns (uint256) {
        return (priceAverageUQ112x112 * 1e18) / (2 ** 112);
    }

    /// @notice Returns the time (in seconds) since the last TWAP update
    function getTimeSinceUpdate() external view returns (uint32) {
        return uint32(block.timestamp) - lastUpdateTimestamp;
    }

    /// @dev Returns current cumulative prices and block timestamp
    function currentCumulativePrices() internal view returns (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) {
        price0Cumulative = pair.price0CumulativeLast();
        price1Cumulative = pair.price1CumulativeLast();

        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLastPair) = pair.getReserves();
        blockTimestamp = uint32(block.timestamp);

        if (blockTimestampLastPair != blockTimestamp) {
            uint32 timeElapsed = blockTimestamp - blockTimestampLastPair;

            require(reserve0 > 0 && reserve1 > 0, "UniswapV2PriceFeed: NO_RESERVES");

            uint256 price0Delta = uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve1), reserve0)) * uint256(timeElapsed);
            uint256 price1Delta = uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve0), reserve1)) * uint256(timeElapsed);

            price0Cumulative += price0Delta;
            price1Cumulative += price1Delta;
        }
    }
}

/// @dev Minimal UQ112x112 lib
library UQ112x112 {
    uint224 constant Q112 = 2**112;

    function encode(uint112 y) internal pure returns (uint224 z) {
        z = uint224(y) * Q112;
    }

    function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z) {
        z = x / uint224(y);
    }
}
