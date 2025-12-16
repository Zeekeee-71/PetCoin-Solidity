const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("TreasuryVault", function () {
  let owner, user1, user2, token, treasuryVault;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, token, treasuryVault } = ecosystem);
  });

  it("Allows funding via transferFrom and emits an event", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.approve(treasuryVault.target, amount);
    await expect(treasuryVault.fund(amount))
      .to.emit(treasuryVault, "TreasuryFunded")
      .withArgs(owner.address, amount);

    expect(await token.balanceOf(treasuryVault.target)).to.equal(amount);
  });

  it("Pays claims only from the owner and records the memo", async () => {
    const amount = ethers.parseUnits("5000", 18);
    const memo = "Medical claim";

    await token.approve(treasuryVault.target, amount);
    await treasuryVault.fund(amount);

    await expect(
      treasuryVault.connect(user1).payClaim(user1.address, amount, memo)
    ).to.be.revertedWithCustomError(treasuryVault, "OwnableUnauthorizedAccount");

    await expect(treasuryVault.payClaim(user1.address, amount, memo))
      .to.emit(treasuryVault, "ClaimPaid")
      .withArgs(user1.address, amount, memo);

    expect(await token.balanceOf(user1.address)).to.equal(amount);
  });

  it("Allows owner withdrawals separate from claims", async () => {
    const amount = ethers.parseUnits("2500", 18);
    const memo = "Ops transfer";

    await token.approve(treasuryVault.target, amount);
    await treasuryVault.fund(amount);

    await expect(treasuryVault.withdraw(user2.address, amount, memo))
      .to.emit(treasuryVault, "TreasuryWithdrawn")
      .withArgs(user2.address, amount, memo);

    expect(await token.balanceOf(user2.address)).to.equal(amount);
  });

  it("Rejects unauthorized caller on migrateTo", async () => {
    await expect(
      treasuryVault.connect(user1).migrateTo(user2.address)
    ).to.be.revertedWith("Unauthorized: not token");
  });

  it("Migrates balances when a new treasury is configured", async () => {
    const amount = ethers.parseUnits("7500", 18);
    await token.approve(treasuryVault.target, amount);
    await treasuryVault.fund(amount);

    const TreasuryFactory = await ethers.getContractFactory("TreasuryVault");
    const newTreasury = await TreasuryFactory.deploy(token);

    await expect(token.setTreasuryVault(newTreasury.target)).to.not.be.reverted;

    expect(await token.balanceOf(treasuryVault.target)).to.equal(0);
    expect(await token.balanceOf(newTreasury.target)).to.equal(amount);
  });
});
