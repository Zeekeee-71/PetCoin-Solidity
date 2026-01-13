// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

/// @title UniswapV3PriceFeed
/// @notice Minimal Uniswap V3 TWAP price feed for AccessGating or vault logic.
/// @dev Returns the base token priced in the quote token, scaled to 18 decimals.
contract UniswapV3PriceFeed {
    IUniswapV3Pool public immutable pool;
    address public immutable baseToken;
    address public immutable quoteToken;
    uint8 public immutable baseDecimals;
    uint8 public immutable quoteDecimals;
    uint128 public immutable baseAmount;
    uint256 public immutable quoteScale;
    bool public immutable scaleUp;
    uint24 public immutable poolFee;
    uint32 public immutable twapInterval;
    uint128 public immutable minLiquidity;
    int24 public immutable maxTickDeviation;

    uint32 public lastUpdateTimestamp;
    uint128 public lastHarmonicMeanLiquidity;
    int24 public lastArithmeticMeanTick;
    uint256 public lastPrice;

    uint32 public constant MIN_UPDATE_INTERVAL = 1800; // 30 minutes

    event Updated(uint256 price, int24 meanTick, uint32 timeElapsed);

    struct InitState {
        IUniswapV3Pool pool;
        uint24 poolFee;
        uint8 baseDecimals;
        uint8 quoteDecimals;
        uint128 baseAmount;
        uint256 quoteScale;
        bool scaleUp;
        uint32 twapInterval;
        uint128 minLiquidity;
        int24 maxTickDeviation;
    }

    constructor(
        address _pool,
        address _baseToken,
        address _quoteToken,
        uint24 _expectedFee,
        uint32 _twapInterval,
        uint128 _minLiquidity,
        int24 _maxTickDeviation,
        uint16 _cardinalityNext
    ) {
        require(_pool != address(0), "Invalid pool");
        require(_baseToken != address(0) && _quoteToken != address(0), "Invalid token");
        require(_baseToken != _quoteToken, "Identical tokens");

        InitState memory init;
        init.pool = IUniswapV3Pool(_pool);

        address token0 = init.pool.token0();
        address token1 = init.pool.token1();

        require(
            (token0 == _baseToken && token1 == _quoteToken) || (token0 == _quoteToken && token1 == _baseToken),
            "Pool tokens mismatch"
        );

        init.poolFee = init.pool.fee();
        if (_expectedFee != 0) {
            require(init.poolFee == _expectedFee, "Pool fee mismatch");
        }

        init.baseDecimals = IERC20Metadata(_baseToken).decimals();
        init.quoteDecimals = IERC20Metadata(_quoteToken).decimals();
        require(init.baseDecimals <= 30 && init.quoteDecimals <= 30, "Decimals too large");

        init.baseAmount = _pow10(init.baseDecimals);
        (init.quoteScale, init.scaleUp) = _scaleForDecimals(init.quoteDecimals);

        init.twapInterval = _twapInterval == 0 ? MIN_UPDATE_INTERVAL : _twapInterval;
        init.minLiquidity = _minLiquidity;
        init.maxTickDeviation = _maxTickDeviation;

        if (_cardinalityNext > 0) {
            init.pool.increaseObservationCardinalityNext(_cardinalityNext);
        }

        (, int24 spotTick, , , , , ) = init.pool.slot0();
        uint128 currentLiquidity = init.pool.liquidity();
        if (init.minLiquidity > 0) {
            require(currentLiquidity >= init.minLiquidity, "UniswapV3PriceFeed: LOW_LIQUIDITY");
        }

        uint256 initialQuote = OracleLibrary.getQuoteAtTick(spotTick, init.baseAmount, _baseToken, _quoteToken);
        uint256 initialPrice = init.scaleUp ? initialQuote * init.quoteScale : initialQuote / init.quoteScale;

        pool = init.pool;
        baseToken = _baseToken;
        quoteToken = _quoteToken;
        baseDecimals = init.baseDecimals;
        quoteDecimals = init.quoteDecimals;
        baseAmount = init.baseAmount;
        quoteScale = init.quoteScale;
        scaleUp = init.scaleUp;
        poolFee = init.poolFee;
        twapInterval = init.twapInterval;
        minLiquidity = init.minLiquidity;
        maxTickDeviation = init.maxTickDeviation;

        lastArithmeticMeanTick = spotTick;
        lastHarmonicMeanLiquidity = currentLiquidity;
        lastPrice = initialPrice;
        lastUpdateTimestamp = uint32(block.timestamp);
    }

    /// @notice Updates the TWAP price. Should be called periodically (e.g., every 30+ minutes).
    function update() external {
        uint256 nowTimestamp = block.timestamp;
        require(nowTimestamp >= lastUpdateTimestamp, "UniswapV3PriceFeed: TIME");
        uint32 timeElapsed = uint32(nowTimestamp - lastUpdateTimestamp);
        require(timeElapsed >= MIN_UPDATE_INTERVAL, "UniswapV3PriceFeed: TOO_SOON");

        (int24 meanTick, uint128 harmonicLiquidity) = OracleLibrary.consult(address(pool), twapInterval);
        if (minLiquidity > 0) {
            require(harmonicLiquidity >= minLiquidity, "UniswapV3PriceFeed: LOW_LIQUIDITY");
        } else {
            require(harmonicLiquidity > 0, "UniswapV3PriceFeed: NO_LIQUIDITY");
        }

        if (maxTickDeviation > 0) {
            uint24 tickDelta = _absTickDelta(meanTick, lastArithmeticMeanTick);
            require(tickDelta <= uint24(maxTickDeviation), "UniswapV3PriceFeed: TICK_JUMP");
        }

        uint256 price = _scaledQuoteAtTick(meanTick);

        lastArithmeticMeanTick = meanTick;
        lastHarmonicMeanLiquidity = harmonicLiquidity;
        lastPrice = price;
        lastUpdateTimestamp = uint32(nowTimestamp);

        emit Updated(price, meanTick, timeElapsed);
    }

    /// @notice Returns the last TWAP price (base/quote) scaled to 18 decimals.
    function getLatestPrice() external view returns (uint256) {
        return lastPrice;
    }

    /// @notice Returns the time (in seconds) since the last TWAP update.
    function getTimeSinceUpdate() external view returns (uint32) {
        require(block.timestamp >= lastUpdateTimestamp, "UniswapV3PriceFeed: TIME");
        return uint32(block.timestamp - lastUpdateTimestamp);
    }

    function _scaledQuoteAtTick(int24 tick) internal view returns (uint256) {
        uint256 quoteAmount = OracleLibrary.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
        if (scaleUp) {
            return quoteAmount * quoteScale;
        }
        return quoteAmount / quoteScale;
    }

    function _pow10(uint8 exponent) internal pure returns (uint128) {
        uint256 result = 1;
        for (uint256 i = 0; i < exponent; i++) {
            result *= 10;
        }
        require(result <= type(uint128).max, "Base amount overflow");
        return uint128(result);
    }

    function _scaleForDecimals(uint8 decimals) internal pure returns (uint256 scale, bool up) {
        if (decimals == 18) {
            return (1, true);
        }
        if (decimals < 18) {
            uint256 factor = 1;
            for (uint256 i = 0; i < 18 - decimals; i++) {
                factor *= 10;
            }
            return (factor, true);
        }
        uint256 divisor = 1;
        for (uint256 i = 0; i < decimals - 18; i++) {
            divisor *= 10;
        }
        return (divisor, false);
    }

    function _absTickDelta(int24 a, int24 b) internal pure returns (uint24) {
        int24 delta = a - b;
        if (delta < 0) {
            delta = -delta;
        }
        return uint24(delta);
    }
}
