const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("CharityVault", function () {

  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);
  });

  it("Rejects unauthorized caller on CharityVault.setStakingVault", async () => {
    await expect(
      charityVault.connect(user1).authorizeStakingVault(user2.address)
    ).to.be.revertedWith("Unauthorized: not token");
  });
  
  it("Rejects unauthorized caller on CharityVault.migrateTo", async () => {
    await expect(
      charityVault.connect(user1).migrateTo(user2.address)
    ).to.be.revertedWith("Unauthorized: not token");
  });

  it("Transfers tokens and emits event from spend()", async () => {
    const amount = ethers.parseUnits("1000", 18);
  
    // Give vault tokens directly
    await token.approve(charityVault.target, amount);
    await charityVault.fundVault(amount);

    // Spend them to user1
    const memo = "Test spend";
    await expect(charityVault.spend(user1.address, amount, memo))
      .to.emit(charityVault, "CharitySpent")
      .withArgs(user1.address, amount, memo);
  
    expect(await token.balanceOf(user1.address)).to.equal(amount);
  });

  it("Reverts spend() if vault balance is too low", async () => {
    const tooMuch = ethers.parseUnits("5000", 18); // more than it has
    const memo = "Testing too much to spend";

    await expect(
      charityVault.spend(user1.address, tooMuch, memo)
    ).to.be.reverted;
  });

  it("Rejects receiveFee if called by unauthorized address", async () => {
    const amount = ethers.parseUnits("1000", 18);
  
    await expect(
      charityVault.connect(user1).receiveFee(amount)
    ).to.be.revertedWith("Unauthorized fee sender");
  
    await expect(
      stakingVault.connect(user1).receiveFee(amount)
    ).to.be.revertedWith("Only token contract can fund");
  });

})