const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

async function addLiquidity({ owner, token, weth, positionManager, pool, poolFee }) {
  await weth.deposit({ value: ethers.parseEther("10") });

  const tokenAddress = token.target ?? token.address;
  const wethAddress = weth.target ?? weth.address;
  const token0 = tokenAddress.toLowerCase() < wethAddress.toLowerCase() ? tokenAddress : wethAddress;
  const token1 = token0 === tokenAddress ? wethAddress : tokenAddress;

  const one = ethers.parseUnits("1", 18);
  const bil = ethers.parseUnits("100000000000", 18);

  const amount0Desired = token0 === tokenAddress ? bil : one;
  const amount1Desired = token1 === tokenAddress ? bil : one;

  await token.approve(positionManager.target, amount0Desired + amount1Desired);
  await weth.approve(positionManager.target, amount0Desired + amount1Desired);

  const tickSpacing = Number(await pool.tickSpacing());
  const tickLower = Math.floor(-600 / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil(600 / tickSpacing) * tickSpacing;
  const deadline = BigInt(await time.latest()) + 3600n;

  await positionManager.mint({
    token0,
    token1,
    fee: poolFee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: owner.address,
    deadline,
  });
}

describe("Uniswap V3 Router", function () {
  let owner, user1, token, router, weth, pool, positionManager, poolFee;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, token, router, weth, pool, positionManager, poolFee } = ecosystem);
    await addLiquidity({ owner, token, weth, positionManager, pool, poolFee });
  });

  it("has liquidity", async () => {
    const liquidity = await pool.liquidity();
    expect(liquidity).to.be.gt(0);
  });

  it("swaps tokens in", async () => {
    const amountIn = ethers.parseUnits("0.00001", 18);
    const deadline = BigInt(await time.latest()) + 1200n;

    await weth.connect(user1).deposit({ value: ethers.parseEther("10") });

    const oldTokBal = await token.balanceOf(user1.address);
    const oldEthBal = await weth.balanceOf(user1.address);

    await weth.connect(user1).approve(router.target, amountIn);
    await router.connect(user1).exactInputSingle({
      tokenIn: weth.target,
      tokenOut: token.target,
      fee: poolFee,
      recipient: user1.address,
      deadline,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    });

    const newBal = await token.balanceOf(user1.address);
    const newEthBal = await weth.balanceOf(user1.address);
    expect(newBal).to.be.gt(oldTokBal);
    expect(newEthBal).to.be.lt(oldEthBal);
  });

  it("swaps tokens out", async () => {
    const amountIn = ethers.parseUnits("100000", 18);
    const deadline = BigInt(await time.latest()) + 1200n;

    await token.transfer(user1.address, amountIn);

    const oldTokBal = await token.balanceOf(user1.address);
    const oldEthBal = await weth.balanceOf(user1.address);

    await token.connect(user1).approve(router.target, amountIn);
    await router.connect(user1).exactInputSingle({
      tokenIn: token.target,
      tokenOut: weth.target,
      fee: poolFee,
      recipient: user1.address,
      deadline,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    });

    const newBal = await token.balanceOf(user1.address);
    const newEthBal = await weth.balanceOf(user1.address);
    expect(newBal).to.be.lt(oldTokBal);
    expect(newEthBal).to.be.gt(oldEthBal);
  });
});
