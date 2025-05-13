// lib/uniswap.js
const factoryV2ABI = require('@uniswap/v2-core/build/IUniswapV2Factory.json').abi;
const pairV2ABI = require('@uniswap/v2-core/build/IUniswapV2Pair.json').abi;
const routerV2ABI = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json').abi;

module.exports = {
  factoryV2ABI,
  pairV2ABI,
  routerV2ABI
};