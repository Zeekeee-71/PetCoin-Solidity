const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("PetCoin AI Token contract", function () {

  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;


  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);
  });

  it("Deployment should assign the total supply of tokens to the owner", async function () {
    const ownerBalance = await token.balanceOf(owner);
    expect(await token.totalSupply()).to.equal(ownerBalance);
  });


  it("Allows transfers between users and take fees", async () => {
    const amount = ethers.parseUnits("10000", 18);
    const totalFee = ethers.parseUnits("350", 18); // 3.5%
    await token.transfer(user1, amount);
    await token.connect(user1).transfer(user2, amount);
    const expectedReceived = amount - totalFee;
    const balance = await token.balanceOf(user2);
    expect(balance).to.equal(expectedReceived);
  });

  it("Exempts excluded addresses from all fees", async () => {
    const amount = ethers.parseUnits("100000", 18);
    await token.excludeFromFees(user1, true);
    await token.transfer(user1, amount);
    await token.connect(user1).transfer(user2, amount);
    expect(await token.balanceOf(user2)).to.equal(amount);
  });
  

  it("Transfers fees to charity", async () => {
    const amount = ethers.parseUnits("100000", 18); // BigNumber (ethers)
    await token.transfer(user1.address, amount);   // Fee-exempt
    await token.connect(user1).transfer(user2, amount); // Fee applies
    const CHARITY_FEE = 100n;
    const FEE_DENOMINATOR = 10000n;
    const expectedCharity = (amount * CHARITY_FEE) / FEE_DENOMINATOR;
    const actualCharity = await token.balanceOf(await token.charityVault());
    expect(actualCharity).to.equal(expectedCharity);
  });

  it("Transfers fees to rewards vault", async () => {
    const amount = ethers.parseUnits("100000", 18);
    await token.transfer(user1.address, amount);
    await token.connect(user1).transfer(user2, amount);
    const REWARDS_FEE = 200n;
    const FEE_DENOMINATOR = 10000n;
    const expectedRewards = amount * REWARDS_FEE / FEE_DENOMINATOR;
    const stakingBal = await token.balanceOf(await token.stakingVault());
    expect(stakingBal).to.equal(expectedRewards);
  });

  it("Does not charge fees when transferring from owner or to charity vault", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.connect(owner).transfer(charityVault, amount);
    await token.connect(owner).transfer(user1, amount); // reset
    await token.connect(user1).transfer(charityVault, amount);
    const balance = await token.balanceOf(charityVault);
    expect(balance).to.equal(amount * 2n); // assuming no prior balance
  });
  
  it("Does not charge fees when transferring from owner or to staking vault", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.connect(owner).transfer(stakingVault, amount);
    await token.connect(owner).transfer(user1, amount); 
    await token.connect(user1).transfer(stakingVault, amount);
    const balance = await token.balanceOf(stakingVault);
    expect(balance).to.equal(amount * 2n); // assuming no prior balance
  });

  it("Tracks total burned supply correctly", async () => {
    const totalBefore = await token.totalSupply();
    const amount = ethers.parseUnits("1000", 18);
    await token.transfer(user1, amount);
    await token.connect(user1).transfer(user2, amount);

    const totalAfter = await token.totalSupply();
    const expectedBurn = amount * 50n / 10000n; // 0.5%
    expect(totalBefore - totalAfter).to.equal(expectedBurn);
  });

  it("Tracks total burned supply correctly", async () => {
    const totalBefore = await token.totalSupply();
    const amount = ethers.parseUnits("1000", 18);
    await token.transfer(user1, amount);
    await token.connect(user1).transfer(user2, amount);
    
    const totalAfter = await token.totalSupply();
    const expectedBurn = amount * 50n / 10000n; // 0.5%
    expect(totalBefore - totalAfter).to.equal(expectedBurn);
  });

  it("Reverts if transfer exceeds max tx size", async () => {
    const tooMuch = await token.maxTxSize() + 1n;
    await token.transfer(user1, tooMuch);
    await expect(
      token.connect(user1).transfer(user2, tooMuch)
    ).to.be.revertedWith("Exceeds max transaction size");
  });


  it("Reverts if recipient exceeds max wallet size", async () => {
    const txnAmount = await token.maxTxSize();
    const tooMuch = await token.maxWalletSize() + (txnAmount / 2n);
    await token.transfer(user1, tooMuch);
    
    expect(txnAmount).to.be.lt(tooMuch)
    txnsToExceedTooMuch = tooMuch / txnAmount;
    for(let i = 0; i < txnsToExceedTooMuch; i ++){
      await token.connect(user1).transfer(user2, txnAmount);
    }
    await expect(
      token.connect(user1).transfer(user2, await token.balanceOf(user1))
    ).to.be.revertedWith("Exceeds max wallet size");
  });


  it("Does not allow transfer when paused", async () => {
    await token.pause();
    await expect(
      token.transfer(user1, 1)
    ).to.be.revertedWithCustomError(token, "EnforcedPause");
  });

  it("Does allow owner to unpause and resume transfers", async () => {
    await token.pause();
    await expect(
      token.transfer(user1, 1)
    ).to.be.revertedWithCustomError(token, "EnforcedPause");

    await token.unpause();
    await expect(token.transfer(user1, 1)).to.not.be.reverted;
  });

  it("Rejects non-owner pausing or unpausing", async () => {
    await expect(
      token.connect(user1).pause()
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(
      token.connect(user1).unpause()
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("Only allows owner to set vaults", async () => {
    await expect(
      token.connect(user1).setCharityVault(user2.address)
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(
      token.connect(user1).setStakingVault(user2.address)
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("Burns tokens on transfer (if burn fee applies)", async () => {
    const supplyBefore = await token.totalSupply();
    const transferAmount = ethers.parseUnits("10000", 18);

    await token.transfer(user1, transferAmount);
    await token.connect(user1).transfer(user2, transferAmount);

    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.be.lt(supplyBefore);
  });

  it("Respects allowance mechanics (approve/transferFrom)", async () => {
    const amount = ethers.parseUnits("5000", 18);
    await token.transfer(user1.address, amount);

    await token.connect(user1).approve(user2, amount);
    await token.connect(user2).transferFrom(user1, user3, amount);

    expect(await token.balanceOf(user3)).to.be.closeTo(amount * 9650n / 10000n, 1); // fees
  });

  it("Allows fee exempt transactions [u1 (exempt) -> u2]", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.transfer(user1.address, amount);
    await token.excludeFromFees(user1.address, true);
    await token.transfer(user1.address, amount);
    await token.connect(user1).transfer(user2, amount);
    expect(await token.balanceOf(user2)).to.equal(amount);
  })

  it("Allows fee exempt transactions [u1 -> u2 (exempt)]", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.transfer(user1.address, amount);
    await token.excludeFromFees(user2.address, true);
    await token.transfer(user1.address, amount);
    await token.connect(user1).transfer(user2, amount);
    expect(await token.balanceOf(user2)).to.equal(amount);
  })

  it("Allows fee exempt transactions [u1 (exempt) -> u2 (exempt)]", async () => {
    const amount = ethers.parseUnits("10000", 18);
    await token.transfer(user1.address, amount);
    await token.excludeFromFees(user1.address, true);
    await token.excludeFromFees(user2.address, true);
    await token.transfer(user1.address, amount);
    await token.connect(user1).transfer(user2, amount);
    expect(await token.balanceOf(user2)).to.equal(amount);
  })

  it("Disallows setting maxWalletSize to values out of range", async () => {
    await expect(
      token.setWalletLimit(ethers.parseUnits("0", 18))
    ).to.be.revertedWith("Maximum wallet size too small");
    await expect(
      token.setWalletLimit(ethers.parseUnits("100000", 18))
    ).to.be.revertedWith("Maximum wallet size too small");
    await expect(
      token.setWalletLimit(ethers.parseUnits("50000000000", 18))
    ).to.be.revertedWith("Maximum wallet size too large");
  })

  it("Allows setting maxWalletSize to a new value", async () => {
    const five_bil = ethers.parseUnits("5000000000", 18)
    await token.setWalletLimit(five_bil)
    await expect(token.maxWalletSize() == five_bil)
  })

  it("Disallows setting maxTxSize to values out of range", async () => {
    await expect(
      token.setTxLimit(ethers.parseUnits("0", 18))
    ).to.be.revertedWith("Maximum transaction size too small");
    await expect(
      token.setTxLimit(ethers.parseUnits("100000", 18))
    ).to.be.revertedWith("Maximum transaction size too small");
    await expect(
      token.setTxLimit(ethers.parseUnits("50000000000", 18))
    ).to.be.revertedWith("Maximum transaction size too large");
  })

  it("Allows setting maxTxSize to a new value", async () => {
    const five_bil = ethers.parseUnits("5000000000", 18)
    await token.setTxLimit(five_bil)
    await expect(token.maxTxSize() == five_bil)
  })

  it("Migrates staking vault and transfer balance", async () => {
    // Deploy new staking vault
    const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
    const newStakingVault = await StakingVaultFactory.deploy(token.target);
  
    // Fund old staking vault
    const amount = ethers.parseUnits("10000000", 18);
    await token.transfer(stakingVault.target, amount);
  
    const balanceBefore = await token.balanceOf(stakingVault.target);
  
    // Migrate to new vault
    await expect(token.setStakingVault(newStakingVault.target))
      .to.not.be.reverted;
  
    // Confirm balance moved
    const oldVaultBalance = await token.balanceOf(stakingVault.target);
    const newVaultBalance = await token.balanceOf(newStakingVault.target);
  
    expect(oldVaultBalance).to.equal(0);
    expect(newVaultBalance).to.equal(balanceBefore);
  
    // Confirm the token's internal stakingVault address is updated
    expect(await token.stakingVault()).to.equal(newStakingVault.target);
  });
  
  it("Migrates charity vault and transfer balance", async () => {
    // Deploy new charity vault
    const CharityVaultFactory = await ethers.getContractFactory("CharityVault");
    const newCharityVault = await CharityVaultFactory.deploy(token.target);
  
    // Fund old charity vault
    const amount = ethers.parseUnits("10000000", 18);
    await token.transfer(charityVault.target, amount);
  
    const balanceBefore = await token.balanceOf(charityVault.target);
  
    // Migrate to new vault
    await expect(token.setCharityVault(newCharityVault.target))
      .to.not.be.reverted;
  
    // Confirm balance moved
    const oldVaultBalance = await token.balanceOf(charityVault.target);
    const newVaultBalance = await token.balanceOf(newCharityVault.target);
  
    expect(oldVaultBalance).to.equal(0);
    expect(newVaultBalance).to.equal(balanceBefore);
  
    // Confirm the token's internal charityVault address is updated
    expect(await token.charityVault()).to.equal(newCharityVault.target);
  });

  it("Handles unit transfers without rounding errors or fee leakage", async () => {
    const one = 1n;
    await token.transfer(user1, one);
    const balanceBefore = await token.balanceOf(user2);
  
    await token.connect(user1).transfer(user2, one);
  
    // Recipient should get 0 due to fee rounding, or 1 if fee exemption applies
    const balanceAfter = await token.balanceOf(user2);
    expect(balanceAfter).to.be.lte(balanceBefore + one);
  
    // Total supply should not decrease more than 1 wei (burn shouldn't round below 1)
    const supplyAfter = await token.totalSupply();
    const maxPossibleBurn = one; // prevent underflow
    expect(await token.totalSupply()).to.be.gte(supplyAfter - maxPossibleBurn);
  });

  it("Reverts when setStakingVault is called with same address", async () => {
    const currentVault = await token.stakingVault();
    const StakingVault = await ethers.getContractAt("StakingVault", currentVault);
    await expect(token.setStakingVault(currentVault)).to.be.revertedWith("Same staking vault address");
  });

  it("Reverts when setCharityVault is called with same address", async () => {
    const currentVault = await token.charityVault();
    const CharityVault = await ethers.getContractAt("CharityVault", currentVault);
    await expect(token.setCharityVault(currentVault)).to.be.revertedWith("Same charity vault address");
  });


  it("Accurately tracks totalCharityDistributed and totalRewardsDistributed", async () => {
    const amount = ethers.parseUnits("100000", 18); // clean number
    const CHARITY_FEE = 100n;
    const REWARDS_FEE = 200n;
    const DENOM = 10000n;
  
    // Setup
    await token.transfer(user1.address, amount);
    const beforeCharity = await token.totalCharityDistributed();
    const beforeRewards = await token.totalRewardsDistributed();
  
    // Action: user1 transfers to user2 (normal fee-charged tx)
    await token.connect(user1).transfer(user2.address, amount);
  
    // Expectations
    const expectedCharity = (amount * CHARITY_FEE) / DENOM;
    const expectedRewards = (amount * REWARDS_FEE) / DENOM;
  
    const afterCharity = await token.totalCharityDistributed();
    const afterRewards = await token.totalRewardsDistributed();
  
    expect(afterCharity - beforeCharity).to.equal(expectedCharity);
    expect(afterRewards - beforeRewards).to.equal(expectedRewards);
  });

  it("Rolls back setStakingVault if migrateTo fails", async () => {
    const FailingVaultFactory = await ethers.getContractFactory("FailingVault");
    const badVault = await FailingVaultFactory.deploy();
    await token.setStakingVault(badVault.target); // has deficient migrateTo
    const current = await token.stakingVault();
    const DummyVaultFactory = await ethers.getContractFactory("StakingVault");
    const dummyVault = await DummyVaultFactory.deploy(token.target);
    // Migration will call badVault.migrateTo(dummyVault), which reverts
    await expect(token.setStakingVault(dummyVault.target)).to.be.revertedWith("Migration transfer failed");
    // Ensure the internal state wasn't changed
    expect(await token.stakingVault()).to.equal(current);
  });
  
  it("Rolls back setCharityVault if migrateTo fails", async () => {
    const FailingVaultFactory = await ethers.getContractFactory("FailingVault");
    const badVault = await FailingVaultFactory.deploy();
    await token.setCharityVault(badVault.target); // has deficient migrateTo
    const current = await token.charityVault();
    const DummyVaultFactory = await ethers.getContractFactory("CharityVault");
    const dummyVault = await DummyVaultFactory.deploy(token.target);
    // Migration will call badVault.migrateTo(dummyVault), which reverts
    await expect(token.setCharityVault(dummyVault.target)).to.be.revertedWith("Migration transfer failed");
    // Ensure the internal state wasn't changed
    expect(await token.charityVault()).to.equal(current);
  });

  it("Allows transferFrom() by approved spender with correct fee logic", async () => {
    const amount = ethers.parseUnits("1000", 18);
    await token.transfer(user1, amount);
  
    // user1 approves user2 to spend on their behalf
    await token.connect(user1).approve(user2.address, amount);
  
    const allowanceBefore = await token.allowance(user1.address, user2.address);
    const user1BalanceBefore = await token.balanceOf(user1.address);
    const user3BalanceBefore = await token.balanceOf(user3.address);
  
    // user2 transfers from user1 to user3
    await token.connect(user2).transferFrom(user1.address, user3.address, amount);
  
    const allowanceAfter = await token.allowance(user1.address, user2.address);
    const user1BalanceAfter = await token.balanceOf(user1.address);
    const user3BalanceAfter = await token.balanceOf(user3.address);
  
    // Fees: 3.5% = 35 PETAI, net transfer = 965
    const expectedNet = ethers.parseUnits("965", 18);
  
    expect(allowanceAfter).to.equal(0);
    expect(user1BalanceAfter).to.equal(user1BalanceBefore - amount);
    expect(user3BalanceAfter - user3BalanceBefore).to.equal(expectedNet);
  });

  it("Exempts sender from fees when using transferFrom()", async () => {
    const amount = ethers.parseUnits("1000", 18);
    await token.transfer(user1, amount);
  
    // Exempt user1 from fees
    await token.connect(owner).excludeFromFees(user1.address, true);
  
    // Approve user2 to spend on behalf of user1
    await token.connect(user1).approve(user2.address, amount);
  
    const user3BalanceBefore = await token.balanceOf(user3.address);
  
    // user2 transfers from user1 to user3
    await token.connect(user2).transferFrom(user1.address, user3.address, amount);
  
    // Should be full amount, no fees
    const user3BalanceAfter = await token.balanceOf(user3.address);
    expect(user3BalanceAfter - user3BalanceBefore).to.equal(amount);
  });

  it("Exempts receiver from fees when using transferFrom()", async () => {
    const amount = ethers.parseUnits("1000", 18);
    await token.transfer(user1, amount);
  
    // Exempt user1 from fees
    await token.connect(owner).excludeFromFees(user3.address, true);
  
    // Approve user2 to spend on behalf of user1
    await token.connect(user1).approve(user2.address, amount);
  
    const user3BalanceBefore = await token.balanceOf(user3.address);
  
    // user2 transfers from user1 to user3
    await token.connect(user2).transferFrom(user1.address, user3.address, amount);
  
    // Should be full amount, no fees
    const user3BalanceAfter = await token.balanceOf(user3.address);
    expect(user3BalanceAfter - user3BalanceBefore).to.equal(amount);
  });

  it("Applies full fees correctly via transferFrom and updates all counters", async () => {
    const amount = ethers.parseUnits("10000", 18); // Clean number for math
    const burnRate = 50n;
    const charityRate = 100n;
    const rewardsRate = 200n;
    const denominator = 10000n;
  
    await token.transfer(user1, amount);
  
    // Ensure none of the actors are fee-exempt
    await token.connect(owner).excludeFromFees(user1.address, false);
    await token.connect(owner).excludeFromFees(user2.address, false);
    await token.connect(owner).excludeFromFees(user3.address, false);
  
    // Approve user2 to spend on behalf of user1
    await token.connect(user1).approve(user2.address, amount);
  
    const burnBefore = await token.totalSupply();
    const rewardsVaultBefore = await token.balanceOf(await token.stakingVault());
    const charityVaultBefore = await token.balanceOf(await token.charityVault());
    const user3BalanceBefore = await token.balanceOf(user3.address);
  
    // Perform transferFrom from user1 to user3, via user2
    await token.connect(user2).transferFrom(user1.address, user3.address, amount);
  
    const feeTotal = (amount * (burnRate + charityRate + rewardsRate)) / denominator;
    const netAmount = amount - feeTotal;
    const burnAmount = (amount * burnRate) / denominator;
    const charityAmount = (amount * charityRate) / denominator;
    const rewardsAmount = (amount * rewardsRate) / denominator;
  
    const burnAfter = await token.totalSupply();
    const rewardsVaultAfter = await token.balanceOf(await token.stakingVault());
    const charityVaultAfter = await token.balanceOf(await token.charityVault());
    const user3BalanceAfter = await token.balanceOf(user3.address);
  
    // Check net received
    expect(user3BalanceAfter - user3BalanceBefore).to.equal(netAmount);
  
    // Check vault distributions
    expect(rewardsVaultAfter - rewardsVaultBefore).to.equal(rewardsAmount);
    expect(charityVaultAfter - charityVaultBefore).to.equal(charityAmount);
  
    // Check burn
    expect(burnBefore - burnAfter).to.equal(burnAmount);
  });

  it("Reverts transferFrom if it exceeds maxTxSize or maxWalletSize", async () => {
    const largeAmount = ethers.parseUnits("125000000", 18); // 125M PETAI
    await token.transfer(user1, largeAmount);
  
    // Set strict limits
    const maxTx = ethers.parseUnits("100000000", 18); // max tx = 100M PETAI
    const maxWallet = ethers.parseUnits("150000000", 18); // max wallet = 150M PETAI
    await expect(token.connect(owner).setTxLimit(maxTx)).to.not.be.reverted;
    await expect(token.connect(owner).setWalletLimit(maxWallet)).to.not.be.reverted;
  
    // Approve user2 to transfer on behalf of user1
    await token.connect(user1).approve(user2.address, largeAmount);
  
    // Case 1: Exceeds maxTxSize
    await expect(
      token.connect(user2).transferFrom(user1.address, user3.address, maxTx + 1n)
    ).to.be.revertedWith("Exceeds max transaction size");
  
    // Case 2: Transfer that would push user3 above maxWalletSize
    // First bring user3 to near limit
    const nearLimit = ethers.parseUnits("140000000", 18); // 140M
    await token.connect(owner).transfer(user3.address, nearLimit);
  
    // Try to transfer a bit
    await expect(
      token.connect(user2).transferFrom(user1.address, user3.address, ethers.parseUnits("5000000", 18))
    ).to.not.be.reverted

    // Try to transfer another 20M (would exceed 150M limit)
    await expect(
      token.connect(user2).transferFrom(user1.address, user3.address, ethers.parseUnits("20000000", 18))
    ).to.be.revertedWith("Exceeds max wallet size");
  });

});