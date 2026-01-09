const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

const MIN_UPDATE_INTERVAL = 1800;

function tickForPrice(targetPrice) {
  return Math.floor(Math.log(targetPrice) / Math.log(1.0001));
}

describe("UniswapV3PriceFeed (mocked)", function () {
  async function deployFixture() {
    const TokenFactory = await ethers.getContractFactory("CNU");
    const token = await TokenFactory.deploy(ethers.parseUnits("1000000", 18));

    const WethFactory = await ethers.getContractFactory("WETH9");
    const weth = await WethFactory.deploy();

    const token0 = token.target ?? token.address;
    const token1 = weth.target ?? weth.address;

    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool = await Pool.deploy(token0, token1, 0, 1_000_000);

    const Feed = await ethers.getContractFactory("UniswapV3PriceFeed");
    const feed = await Feed.deploy(
      pool.target ?? pool.address,
      token0,
      token1,
      3000,
      MIN_UPDATE_INTERVAL,
      0,
      0,
      0
    );

    return { pool, feed, token0, token1 };
  }

  it("updates price after time elapses", async () => {
    const { feed } = await loadFixture(deployFixture);

    await time.increase(MIN_UPDATE_INTERVAL);
    await expect(feed.update()).to.emit(feed, "Updated");

    const avg = await feed.getLatestPrice();
    expect(Number(ethers.formatUnits(avg, 18))).to.be.closeTo(1, 0.0001);
  });

  it("tracks price changes when tick moves", async () => {
    const { feed, pool, token0, token1 } = await loadFixture(deployFixture);

    await time.increase(MIN_UPDATE_INTERVAL);
    await feed.update();

    const targetPrice = 5;
    await pool.setTick(tickForPrice(targetPrice));

    await time.increase(MIN_UPDATE_INTERVAL);
    await feed.update();

    const avg = await feed.getLatestPrice();
    const baseIsLower = token0.toLowerCase() < token1.toLowerCase();
    const expected = baseIsLower ? targetPrice : 1 / targetPrice;
    expect(Number(ethers.formatUnits(avg, 18))).to.be.closeTo(expected, 0.05);
  });

  it("reverts if update() is called too soon", async () => {
    const { feed } = await loadFixture(deployFixture);

    await time.increase(MIN_UPDATE_INTERVAL);
    await feed.update();

    await time.increase(60);
    await expect(feed.update()).to.be.revertedWith("UniswapV3PriceFeed: TOO_SOON");
  });

  it("getTimeSinceUpdate() tracks properly", async () => {
    const { feed } = await loadFixture(deployFixture);

    await time.increase(MIN_UPDATE_INTERVAL);
    await feed.update();

    await time.increase(180);
    const delta = await feed.getTimeSinceUpdate();
    expect(delta).to.be.closeTo(180, 2);
  });
});
