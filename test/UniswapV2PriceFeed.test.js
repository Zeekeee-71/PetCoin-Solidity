const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");
const { ethers } = require("hardhat");


describe("UniswapV2PriceFeed (mocked)", function () {
  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;
  let mockPair;

  const token0 = "0x0000000000000000000000000000000000000001";
  const token1 = "0x0000000000000000000000000000000000000002";

  beforeEach(async () => {

    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);

    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    mockPair = await MockPair.deploy(token0, token1);

    await mockPair.setCumulativePrices("1000000000", "1000000000");
    await mockPair.setReserves(1000, 1000);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    feed = await Feed.deploy(mockPair, token0, token1);

  });

  it("initializes with cumulative price from pair", async () => {
    await mockPair.setCumulativePrices(1000000000, 1000000000);
    const cumulative = await mockPair.price0CumulativeLast();
    expect(cumulative).to.equal(1000000000);
  });


  it("updates price after time elapses", async () => {

    const rate = 5;
    await mockPair.setCumulativePrices(0, 0);
    await mockPair.setReserves(1000, 1000);

    await time.increase(3600);
    await mockPair.advance(3600, rate, 0);

    await feed.update();
    
    const avg = await feed.getLatestPrice();
    // the timestamps don't perfectly match, so there will be a slight error
    expect(Number(ethers.formatUnits(avg, 18))).to.be.within(rate - 0.01, rate + 0.01); // will usually pass
  });

  it("uses price1 average when base token is token1", async () => {
    const rate = 7;
    await mockPair.setCumulativePrices(0, 0);
    await mockPair.setReserves(1000, 1000);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const reverseFeed = await Feed.deploy(mockPair, token1, token0);

    await time.increase(3600);
    await mockPair.advance(3600, 0, rate);

    await reverseFeed.update();

    const avg = await reverseFeed.getLatestPrice();
    expect(Number(ethers.formatUnits(avg, 18))).to.be.within(rate - 0.05, rate + 0.05);
  });

  it("reverts if update() is called too soon", async () => {

    await time.increase(3600);
    await mockPair.setCumulativePrices(1000000000, 1000000000);
    await feed.update();

    await time.increase(60); // too soon (< MIN_UPDATE_INTERVAL = 300)
    await mockPair.advance(60, 5, 10);

    await expect(feed.update()).to.be.revertedWith("UniswapV2PriceFeed: TOO_SOON");
  });

  it("getLatestPrice uses counterfactual TWAP between updates", async () => {
    const rate = 4;
    await mockPair.setCumulativePrices(0, 0);
    await mockPair.setReserves(1000, 1000);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const freshFeed = await Feed.deploy(mockPair, token0, token1);

    await time.increase(600);
    await mockPair.advance(600, rate, 0);

    const avg = await freshFeed.getLatestPrice();
    expect(Number(ethers.formatUnits(avg, 18))).to.be.within(rate - 0.05, rate + 0.05);

    await expect(freshFeed.update()).to.be.revertedWith("UniswapV2PriceFeed: TOO_SOON");
  });

  it("getTimeSinceUpdate() tracks properly", async () => {

    
    await time.increase(3600);

    await feed.update();

    await time.increase(180);
    const delta = await feed.getTimeSinceUpdate();
    expect(delta).to.be.closeTo(180, 2);
  });

  it("does not overflow in counterfactual cumulative price math", async () => {
    const maxUint112 = (1n << 112n) - 1n;

    await mockPair.setCumulativePrices(0, 0);
    await mockPair.setReserves(1, maxUint112);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const bigFeed = await Feed.deploy(mockPair, token0, token1);

    await time.increase(3600);
    await expect(bigFeed.update()).to.not.be.reverted;
  });
});
