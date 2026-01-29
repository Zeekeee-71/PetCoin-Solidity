// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title UniswapV2PriceFeed
/// @notice Minimal Uniswap V2 TWAP price feed for AccessGating or vault logic.
/// @dev Uses price0/price1 cumulatives, scaled to 18 decimals.
contract UniswapV2PriceFeed is Ownable {
    IUniswapV2Pair public immutable pair;
    address public immutable token0;
    address public immutable token1;
    address public immutable baseToken;
    address public immutable quoteToken;
    bool public immutable baseIsToken0;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32 public blockTimestampLast;
    uint256 public price0AverageUQ112x112;
    uint256 public price1AverageUQ112x112;
    uint32 public lastUpdateTimestamp;

    event DebugTimeElapsed(uint256 blockTimestamp, uint256 blockTimestampLast, uint256 timeElapsed);

    uint32 public constant MIN_UPDATE_INTERVAL = 1800; // 30 minutes

    constructor(address _pair, address _baseToken, address _quoteToken) Ownable(msg.sender) {
        require(_pair != address(0), "UniswapV2PriceFeed: INVALID_PAIR");
        require(_baseToken != address(0) && _quoteToken != address(0), "UniswapV2PriceFeed: INVALID_TOKEN");
        require(_baseToken != _quoteToken, "UniswapV2PriceFeed: SAME_TOKEN");

        pair = IUniswapV2Pair(_pair);
        token0 = pair.token0();
        token1 = pair.token1();

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
        lastUpdateTimestamp = timestamp;
    }

    /// @notice Updates the TWAP price. Should be called periodically (e.g., every 30+ minutes).
    function update() external {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = currentCumulativePrices();
        uint32 timeElapsed;
        unchecked {
            timeElapsed = blockTimestamp - blockTimestampLast;
        }

        emit DebugTimeElapsed(blockTimestamp, blockTimestampLast, timeElapsed);


        require(timeElapsed >= MIN_UPDATE_INTERVAL, "UniswapV2PriceFeed: TOO_SOON");

        unchecked {
            price0AverageUQ112x112 = (price0Cumulative - price0CumulativeLast) / timeElapsed;
            price1AverageUQ112x112 = (price1Cumulative - price1CumulativeLast) / timeElapsed;
        }

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
        lastUpdateTimestamp = blockTimestamp;
    }

    /// @notice Returns the latest TWAP price (counterfactual since last update) scaled to 18 decimals.
    function getLatestPrice() external view returns (uint256) {
        (uint256 price0Average, uint256 price1Average, ) = currentAverages();
        uint256 average = baseIsToken0 ? price0Average : price1Average;
        return (average * 1e18) / (2 ** 112);
    }

    /// @notice Returns the amount out for a given token amount based on the TWAP.
    function consult(address token, uint256 amountIn) external view returns (uint256 amountOut) {
        if (token == token0) {
            (uint256 price0Average, , ) = currentAverages();
            return (price0Average * amountIn) / (2 ** 112);
        }
        require(token == token1, "UniswapV2PriceFeed: INVALID_TOKEN");
        (, uint256 price1Average, ) = currentAverages();
        return (price1Average * amountIn) / (2 ** 112);
    }

    /// @notice Returns the time (in seconds) since the last TWAP update.
    function getTimeSinceUpdate() external view returns (uint32) {
        return uint32(block.timestamp) - lastUpdateTimestamp;
    }

    /// @dev Returns current TWAP averages since the last update, or stored averages if no time elapsed.
    function currentAverages() internal view returns (
        uint256 price0Average,
        uint256 price1Average,
        uint32 timeElapsed
    ) {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = currentCumulativePrices();
        unchecked {
            timeElapsed = blockTimestamp - blockTimestampLast;
        }
        if (timeElapsed == 0) {
            return (price0AverageUQ112x112, price1AverageUQ112x112, timeElapsed);
        }

        unchecked {
            price0Average = (price0Cumulative - price0CumulativeLast) / timeElapsed;
            price1Average = (price1Cumulative - price1CumulativeLast) / timeElapsed;
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
