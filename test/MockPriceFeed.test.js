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
    await feed.setPrice(133700000n); // $1.337
    expect(await feed.getLatestPrice()).to.equal("133700000");
  });

  it("Supports multiple updates and overwrites correctly", async () => {
    await feed.setPrice("100000000"); // $1.00
    await feed.setPrice("420000000"); // $4.20
    expect(await feed.getLatestPrice()).to.equal("420000000");
  });

  it("Allows zero or extreme values for testing purposes", async () => {
    await feed.setPrice(0);
    expect(await feed.getLatestPrice()).to.equal(0);

    await feed.setPrice("999999999999"); // $10M+ in 8 decimals
    expect(await feed.getLatestPrice()).to.equal("999999999999");
  });

});