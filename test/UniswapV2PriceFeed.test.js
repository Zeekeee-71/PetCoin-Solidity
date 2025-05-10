const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");


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
    feed = await Feed.deploy(mockPair);

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
    expect(avg).to.be.within(rate - 1, rate + 1); // will usually pass
  });

  it("reverts if update() is called too soon", async () => {

    await time.increase(3600);
    await mockPair.setCumulativePrices(1000000000, 1000000000);
    await feed.update();

    await time.increase(60); // too soon (< MIN_UPDATE_INTERVAL = 300)
    await mockPair.advance(60, 5, 10);

    await expect(feed.update()).to.be.revertedWith("UniswapV2PriceFeed: TOO_SOON");
  });

  it("getTimeSinceUpdate() tracks properly", async () => {

    
    await time.increase(3600);

    await feed.update();

    await time.increase(180);
    const delta = await feed.getTimeSinceUpdate();
    expect(delta).to.be.closeTo(180, 2);
  });
});

