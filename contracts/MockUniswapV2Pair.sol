// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMinimalUniswapV2Pair {
  function price0CumulativeLast() external view returns (uint256);
  function price1CumulativeLast() external view returns (uint256);
  function getReserves() external view returns (uint112, uint112, uint32);
}

/// @title MockUniswapV2Pair
/// @notice Test-only mock for Uniswap V2 cumulative pricing.
contract MockUniswapV2Pair is IMinimalUniswapV2Pair, Ownable {
  address immutable token0Address;
  address immutable token1Address;

  uint256 public price0CumulativeLast;
  uint256 public price1CumulativeLast;
  uint112 public reserve0;
  uint112 public reserve1;
  uint32 public blockTimestampLast;

  constructor(address _token0, address _token1) Ownable(msg.sender) {
    require(_token0 != address(0), "Token0 must be set");
    require(_token1 != address(0), "Token1 must be set");
    token0Address = _token0;
    token1Address = _token1;
    blockTimestampLast = uint32(block.timestamp);
  }

  function token0() external view returns (address) {
    return token0Address;
  }

  function token1() external view returns (address) {
    return token1Address;
  }


  /**
   * @notice Set cumulative price values for testing.
   */
  function setCumulativePrices(uint256 _price0, uint256 _price1) external onlyOwner {
    price0CumulativeLast = _price0;
    price1CumulativeLast = _price1;
    //blockTimestampLast = uint32(block.timestamp);
  }

  /**
   * @notice Set reserves for testing.
   */
  function setReserves(uint112 _reserve0, uint112 _reserve1) external onlyOwner {
    reserve0 = _reserve0;
    reserve1 = _reserve1;
    //blockTimestampLast = uint32(block.timestamp);
  }

  /**
   * @notice Return reserves and last timestamp.
   */
  function getReserves() external view returns (uint112, uint112, uint32) {
    return (reserve0, reserve1, blockTimestampLast);
  }

  /**
   * @notice Advance time and cumulatives with constant rates.
   * @dev Rates are unscaled prices; converted to UQ112x112 internally.
   */
  function advance(uint32 timeElapsed, uint256 price0Rate, uint256 price1Rate) external onlyOwner {
    price0CumulativeLast += (price0Rate * uint256(timeElapsed)) << 112;
    price1CumulativeLast += (price1Rate * uint256(timeElapsed)) << 112;
    blockTimestampLast = uint32(block.timestamp); // sync to EVM time
  }

  /**
   * @notice Set timestamp and advance cumulatives to that time.
   * @dev Rates are unscaled prices; converted to UQ112x112 internally.
   */
  function advanceTo(uint32 toTimestamp, uint256 price0Rate, uint256 price1Rate) external onlyOwner {
    uint32 timeElapsed = toTimestamp - blockTimestampLast;
    price0CumulativeLast += (price0Rate * uint256(timeElapsed)) << 112;
    price1CumulativeLast += (price1Rate * uint256(timeElapsed)) << 112;
    blockTimestampLast = toTimestamp;
  }


}
