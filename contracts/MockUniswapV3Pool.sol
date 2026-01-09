// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Test-only mock for Uniswap V3 pool observations. Not production-ready.
contract MockUniswapV3Pool is Ownable {
    address public immutable token0;
    address public immutable token1;

    int24 public currentTick;
    uint128 public liquidity;
    uint24 public fee;
    int24 public tickSpacing;
    uint16 public observationCardinalityNext;

    int56 private tickCumulative;
    uint160 private secondsPerLiquidityCumulativeX128;
    uint32 private lastTimestamp;

    constructor(
        address _token0,
        address _token1,
        int24 initialTick,
        uint128 initialLiquidity
    ) Ownable(msg.sender) {
        require(_token0 != address(0) && _token1 != address(0), "Tokens required");
        require(_token0 != _token1, "Tokens identical");

        token0 = _token0;
        token1 = _token1;
        currentTick = initialTick;
        liquidity = initialLiquidity == 0 ? 1 : initialLiquidity;
        fee = 3000;
        tickSpacing = 60;
        observationCardinalityNext = 1;
        lastTimestamp = uint32(block.timestamp);
    }

    function setTick(int24 newTick) external onlyOwner {
        _roll();
        currentTick = newTick;
    }

    function setLiquidity(uint128 newLiquidity) external onlyOwner {
        _roll();
        liquidity = newLiquidity == 0 ? 1 : newLiquidity;
    }

    function setFee(uint24 newFee, int24 newTickSpacing) external onlyOwner {
        fee = newFee;
        tickSpacing = newTickSpacing;
    }

    function increaseObservationCardinalityNext(uint16 newCardinality) external {
        if (newCardinality > observationCardinalityNext) {
            observationCardinalityNext = newCardinality;
        }
    }

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext_,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return (0, currentTick, 0, observationCardinalityNext, observationCardinalityNext, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        (int56 cumulativeNow, uint160 secondsPerLiquidityNow, uint32 blockTimestamp) = _currentCumulatives();

        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);

        for (uint256 i = 0; i < secondsAgos.length; i++) {
            uint32 secondsAgo = secondsAgos[i];
            require(secondsAgo <= blockTimestamp, "MockV3Pool: secondsAgo too large");

            tickCumulatives[i] = cumulativeNow - int56(int32(secondsAgo)) * int56(currentTick);
            secondsPerLiquidityCumulativeX128s[i] =
                secondsPerLiquidityNow -
                uint160((uint256(secondsAgo) << 128) / liquidity);
        }
    }

    function _roll() internal {
        (int56 cumulativeNow, uint160 secondsPerLiquidityNow, uint32 blockTimestamp) = _currentCumulatives();
        tickCumulative = cumulativeNow;
        secondsPerLiquidityCumulativeX128 = secondsPerLiquidityNow;
        lastTimestamp = blockTimestamp;
    }

    function _currentCumulatives() internal view returns (int56, uint160, uint32) {
        uint32 blockTimestamp = uint32(block.timestamp);
        uint32 timeElapsed = blockTimestamp - lastTimestamp;

        int56 cumulativeNow = tickCumulative + int56(int32(timeElapsed)) * int56(currentTick);
        uint160 secondsPerLiquidityNow = secondsPerLiquidityCumulativeX128 +
            uint160((uint256(timeElapsed) << 128) / liquidity);

        return (cumulativeNow, secondsPerLiquidityNow, blockTimestamp);
    }
}
