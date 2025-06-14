// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

interface IMinimalUniswapV2Pair {
  function price0CumulativeLast() external view returns (uint256);
  function price1CumulativeLast() external view returns (uint256);
  function getReserves() external view returns (uint112, uint112, uint32);
}

contract MockUniswapV2Pair is IMinimalUniswapV2Pair {
  address immutable token0;
  address immutable token1;

  uint256 public price0CumulativeLast;
  uint256 public price1CumulativeLast;
  uint112 public reserve0;
  uint112 public reserve1;
  uint32 public blockTimestampLast;

  constructor(address _token0, address _token1) {
    require(_token0 != address(0), "Token0 must be set");
    require(_token1 != address(0), "Token1 must be set");
    token0 = _token0;
    token1 = _token1;
    blockTimestampLast = uint32(block.timestamp);
  }



  function setCumulativePrices(uint256 _price0, uint256 _price1) external {
    price0CumulativeLast = _price0;
    price1CumulativeLast = _price1;
    //blockTimestampLast = uint32(block.timestamp);
  }

  function setReserves(uint112 _reserve0, uint112 _reserve1) external {
    reserve0 = _reserve0;
    reserve1 = _reserve1;
    //blockTimestampLast = uint32(block.timestamp);
  }

  function getReserves() external view returns (uint112, uint112, uint32) {
    return (reserve0, reserve1, blockTimestampLast);
  }

  // Optional: simulate advancing time and cumulative values
  function advance(uint32 timeElapsed, uint256 price0Rate, uint256 price1Rate) external {
    price0CumulativeLast += price0Rate * (2 ** 112) * timeElapsed;
    price1CumulativeLast += price1Rate * (2 ** 112) * timeElapsed;
    blockTimestampLast = uint32(block.timestamp); // sync to EVM time
  }

  function advanceTo(uint32 toTimestamp, uint256 price0Rate, uint256 price1Rate) external {
    uint32 timeElapsed = toTimestamp - blockTimestampLast;
    price0CumulativeLast += price0Rate * (2 ** 112) * timeElapsed;
    price1CumulativeLast += price1Rate * (2 ** 112) * timeElapsed;
    blockTimestampLast = toTimestamp;
  }


}
