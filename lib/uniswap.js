// lib/uniswap.js
const factoryV3ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').abi;
const poolV3ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').abi;
const routerV3ABI = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json').abi;
const positionManagerV3ABI = require('@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json').abi;
const quoterV3ABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json').abi;

module.exports = {
  factoryV3ABI,
  poolV3ABI,
  routerV3ABI,
  positionManagerV3ABI,
  quoterV3ABI
};
