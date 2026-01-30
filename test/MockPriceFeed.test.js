const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("MockPriceFeed", function () {

  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);
  });

  it("Returns the price that was set", async () => {
    await feed.setPrice(ethers.parseUnits("1.337", 18));
    expect(await feed.getLatestPrice()).to.equal(ethers.parseUnits("1.337", 18));
  });

  it("Supports multiple updates and overwrites correctly", async () => {
    await feed.setPrice(ethers.parseUnits("1", 18));
    await feed.setPrice(ethers.parseUnits("4.2", 18));
    expect(await feed.getLatestPrice()).to.equal(ethers.parseUnits("4.2", 18));
  });

  it("Allows zero or extreme values for testing purposes", async () => {
    await feed.setPrice(0);
    expect(await feed.getLatestPrice()).to.equal(0);

    await feed.setPrice(ethers.parseUnits("10000000", 18)); // 10M quote units
    expect(await feed.getLatestPrice()).to.equal(ethers.parseUnits("10000000", 18));
  });

});
