// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title UniswapV2PriceFeed
/// @notice Minimal Uniswap V2 TWAP price feed for AccessGating or vault logic.
/// @dev Uses price0/price1 cumulatives, scaled to 18 decimals.
contract UniswapV2PriceFeed {
    IUniswapV2Pair public immutable pair;
    address public immutable token0;
    address public immutable token1;
    address public immutable baseToken;
    address public immutable quoteToken;
    bool public immutable baseIsToken0;
    uint8 public immutable token0Decimals;
    uint8 public immutable token1Decimals;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32 public blockTimestampLast;
    uint256 public price0AverageUQ112x112; // UQ112x112 fixed-point average
    uint256 public price1AverageUQ112x112; // UQ112x112 fixed-point average
    uint32 public lastAverageDuration; // updated duration of the last average
    
    /// @dev Emitted for debugging time deltas between updates.
    event DebugTimeElapsed(uint256 blockTimestamp, uint256 blockTimestampLast, uint256 timeElapsed);

    uint32 public constant MIN_UPDATE_INTERVAL = 1800; // 30 minutes

    constructor(address _pair, address _baseToken, address _quoteToken) {
        require(_pair != address(0), "UniswapV2PriceFeed: INVALID_PAIR");
        require(_baseToken != address(0) && _quoteToken != address(0), "UniswapV2PriceFeed: INVALID_TOKEN");
        require(_baseToken != _quoteToken, "UniswapV2PriceFeed: SAME_TOKEN");

        pair = IUniswapV2Pair(_pair);
        token0 = pair.token0();
        token1 = pair.token1();
        token0Decimals = _safeDecimals(token0);
        token1Decimals = _safeDecimals(token1);

        bool isToken0Pair = _baseToken == token0 && _quoteToken == token1;
        bool isToken1Pair = _baseToken == token1 && _quoteToken == token0;
        require(isToken0Pair || isToken1Pair, "UniswapV2PriceFeed: PAIR_MISMATCH");

        baseToken = _baseToken;
        quoteToken = _quoteToken;
        baseIsToken0 = isToken0Pair;

        price0CumulativeLast = pair.price0CumulativeLast();
        price1CumulativeLast = pair.price1CumulativeLast();

        (uint112 reserve0, uint112 reserve1, uint32 timestamp) = pair.getReserves();
        require(reserve0 > 0 && reserve1 > 0, "UniswapV2PriceFeed: NO_RESERVES");
        blockTimestampLast = timestamp;
    }

    /// @notice Updates the TWAP price. Should be called periodically (e.g., every 30+ minutes).
    function update() external {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = currentCumulativePrices();
        uint32 timeElapsed;
        unchecked {
            timeElapsed = blockTimestamp - blockTimestampLast;
        }

        emit DebugTimeElapsed(blockTimestamp, blockTimestampLast, timeElapsed);

        // Enforce a minimum interval to smooth volatility.
        require(timeElapsed >= MIN_UPDATE_INTERVAL, "UniswapV2PriceFeed: TOO_SOON");

        unchecked {
            price0AverageUQ112x112 = (price0Cumulative - price0CumulativeLast) / timeElapsed;
            price1AverageUQ112x112 = (price1Cumulative - price1CumulativeLast) / timeElapsed;
        }

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
        lastAverageDuration = timeElapsed;
    }

    /// @notice Returns the latest TWAP price (counterfactual since last update) scaled to 18 decimals.
    function getLatestPrice() external view returns (uint256) {
        return _consult(baseToken, 1e18);
    }

    /// @notice Returns the amount out for a given token amount based on the TWAP.
    function consult(address token, uint256 amountIn) external view returns (uint256 amountOut) {
        return _consult(token, amountIn);
    }

    function _consult(address token, uint256 amountIn) internal view returns (uint256 amountOut) {
        if (token == token0) {
            (uint256 price0Average,) = currentAverages();
            uint256 scaledIn = _scaleAmount(amountIn, 18, token0Decimals);
            uint256 rawOut = (price0Average * scaledIn) / (2 ** 112);
            return _scaleAmount(rawOut, token1Decimals, 18);
        }
        require(token == token1, "UniswapV2PriceFeed: INVALID_TOKEN");
        (, uint256 price1Average) = currentAverages();
        uint256 scaledInB = _scaleAmount(amountIn, 18, token1Decimals);
        uint256 rawOutB = (price1Average * scaledInB) / (2 ** 112);
        return _scaleAmount(rawOutB, token0Decimals, 18);
    }

    /// @notice Returns the time (in seconds) since the last TWAP update.
    function getTimeSinceUpdate() external view returns (uint32) {
        return uint32(block.timestamp) - blockTimestampLast;
    }

    /// @dev Returns current TWAP averages since the last update, or stored averages if no time elapsed.
    function currentAverages() internal view returns (
        uint256 price0Average,
        uint256 price1Average
    ) {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = currentCumulativePrices();
        uint32 timeElapsed;
        unchecked {
            timeElapsed = blockTimestamp - blockTimestampLast;
        }
        
        if (timeElapsed == 0) {
            return (price0AverageUQ112x112, price1AverageUQ112x112);
        }

        unchecked {
            uint256 price0DeltaAvg = (price0Cumulative - price0CumulativeLast) / timeElapsed;
            uint256 price1DeltaAvg = (price1Cumulative - price1CumulativeLast) / timeElapsed;

            // Before the first successful update(), there is no stored average window to blend.
            if (lastAverageDuration == 0) {
                return (price0DeltaAvg, price1DeltaAvg);
            }

            uint256 totalDuration = uint256(lastAverageDuration) + uint256(timeElapsed);
            price0Average = (price0AverageUQ112x112 * uint256(lastAverageDuration) + price0DeltaAvg * uint256(timeElapsed)) / totalDuration;
            price1Average = (price1AverageUQ112x112 * uint256(lastAverageDuration) + price1DeltaAvg * uint256(timeElapsed)) / totalDuration;
        }
    }

    /// @dev Returns current cumulative prices and block timestamp
    function currentCumulativePrices() internal view returns (
        uint256 price0Cumulative,
        uint256 price1Cumulative,
        uint32 blockTimestamp
    ) {
        price0Cumulative = pair.price0CumulativeLast();
        price1Cumulative = pair.price1CumulativeLast();

        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLastPair) = pair.getReserves();
        blockTimestamp = uint32(block.timestamp);

        if (blockTimestampLastPair != blockTimestamp) {
            // Compute counterfactual cumulatives since last pair update.
            uint32 timeElapsed;
            unchecked {
                timeElapsed = blockTimestamp - blockTimestampLastPair;
            }

            require(reserve0 > 0 && reserve1 > 0, "UniswapV2PriceFeed: NO_RESERVES");

            uint256 price0Delta = uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve1), reserve0)) * uint256(timeElapsed);
            uint256 price1Delta = uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve0), reserve1)) * uint256(timeElapsed);

            unchecked {
                price0Cumulative += price0Delta;
                price1Cumulative += price1Delta;
            }
        }
    }

    function _scaleAmount(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals < toDecimals) {
            return amount * (10 ** (toDecimals - fromDecimals));
        }
        return amount / (10 ** (fromDecimals - toDecimals));
    }

    function _safeDecimals(address token) internal view returns (uint8) {
        if (token.code.length == 0) return 18;
        try IERC20Metadata(token).decimals() returns (uint8 dec) {
            return dec;
        } catch {
            return 18;
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
