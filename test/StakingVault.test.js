const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("StakingVault", function () {

  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);
  });


  describe("Staking", function () {

    it("Allows staking and emit event", async () => {
      const amt = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amt);
      await token.connect(user1).approve(stakingVault, amt);
      await expect(stakingVault.connect(user1).stake(amt, 1)) // Tier 30d
        .to.emit(stakingVault, "Staked")
        .withArgs(user1, 0, amt, 30 * 24 * 60 * 60, 100);
        // msg.sender, stakeId, amount, duration, rate
    });

    it("Reverts if staking is paused", async () => {
      const amt = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amt);
      await stakingVault.pauseStaking(true);
      await token.connect(user1).approve(stakingVault.target, amt);
      await expect(
        stakingVault.connect(user1).stake(amt, 0)
      ).to.be.revertedWith("Staking is paused");
    });
    
  });


  describe("Multiple Stakes Per User", function () {
    it("Allows multiple stakes and tracks them independently", async () => {
      const amt1 = ethers.parseUnits("1000", 18); // Small
      const amt2 = ethers.parseUnits("5000", 18); // Larger
      const tier1 = 1; // 30 days
      const tier2 = 2; // 90 days
  
      // Fund vault with enough for both eventual payouts
      const totalRewardEstimate = amt1 * 100n / 10000n + amt2 * 300n / 10000n;
      await token.transfer(stakingVault, totalRewardEstimate + amt1 + amt2);
  
      // Give user1 tokens and approve for staking
      await token.transfer(user1, amt1 + amt2);
      await token.connect(user1).approve(stakingVault, amt1 + amt2);
  
      // Stake twice
      await stakingVault.connect(user1).stake(amt1, tier1); // stakeId 0
      await stakingVault.connect(user1).stake(amt2, tier2); // stakeId 1
  
      // Check user stake count
      const count = await stakingVault.getStakeCount(user1.address);
      expect(count).to.equal(2);
  
      // Check both stake entries
      const stake0 = await stakingVault.getStake(user1.address, 0);
      const stake1 = await stakingVault.getStake(user1.address, 1);
  
      expect(stake0.amount).to.equal(amt1);
      expect(stake1.amount).to.equal(amt2);
  
      expect(stake0.lockDuration).to.equal(30 * 24 * 60 * 60);
      expect(stake1.lockDuration).to.equal(90 * 24 * 60 * 60);
    });
  
    it("Allows claiming only unlocked stakes", async () => {
      const amt1 = ethers.parseUnits("1000", 18);
      const amt2 = ethers.parseUnits("5000", 18);
  
      await token.transfer(user1, amt1 + amt2);
      await token.connect(user1).approve(stakingVault, amt1 + amt2);
  
      // Fund vault with estimated payouts
      const funding = amt1 * 200n / 10000n + amt2 * 500n / 10000n + amt1 + amt2;
      await token.transfer(stakingVault, funding);
  
      await stakingVault.connect(user1).stake(amt1, 1); // 30d
      await stakingVault.connect(user1).stake(amt2, 2); // 90d
  
      // Simulate 31 days passing (only stake 0 should be unlocked)
      await time.increase(31 * 24 * 60 * 60);
  
      // Can claim stake 0
      await expect(stakingVault.connect(user1).claim(0)).to.emit(stakingVault, "Claimed");
  
      // Cannot yet claim stake 1
      await expect(stakingVault.connect(user1).claim(1)).to.be.revertedWith("Still locked");
    });
  
    it("Calculates earned rewards correctly for each stake", async () => {
      const amt = ethers.parseUnits("500000", 18);
      await token.transfer(user1, amt);
      await token.connect(user1).approve(stakingVault, amt);
  
      await stakingVault.connect(user1).stake(amt / 4n, 1); // 30d, 2%
      await stakingVault.connect(user1).stake(amt / 4n, 2); // 90d, 5%
      await stakingVault.connect(user1).stake(amt / 4n, 3); // 180d, 10%
      await stakingVault.connect(user1).stake(amt / 4n, 4); // 365d, 15%

      expect(await stakingVault.earned(user1, 0)).to.equal(0n);
      expect(await stakingVault.earned(user1, 1)).to.equal(0n);
      expect(await stakingVault.earned(user1, 2)).to.equal(0n);
      expect(await stakingVault.earned(user1, 3)).to.equal(0n);
      await time.increase(31 * 24 * 60 * 60); // 31 days
      expect(await stakingVault.earned(user1, 0)).to.equal((amt / 4n) * 100n / 10000n);
      expect(await stakingVault.earned(user1, 1)).to.equal(0n);
      expect(await stakingVault.earned(user1, 2)).to.equal(0n);
      expect(await stakingVault.earned(user1, 3)).to.equal(0n);
      await time.increase(91 * 24 * 60 * 60); // 91 days
      expect(await stakingVault.earned(user1, 0)).to.equal((amt / 4n) * 100n / 10000n);
      expect(await stakingVault.earned(user1, 1)).to.equal((amt / 4n) * 300n / 10000n);
      expect(await stakingVault.earned(user1, 2)).to.equal(0n);
      expect(await stakingVault.earned(user1, 3)).to.equal(0n);
      await time.increase(91 * 24 * 60 * 60); // 31 days
      expect(await stakingVault.earned(user1, 0)).to.equal((amt / 4n) * 100n / 10000n);
      expect(await stakingVault.earned(user1, 1)).to.equal((amt / 4n) * 300n / 10000n);
      expect(await stakingVault.earned(user1, 2)).to.equal((amt / 4n) * 700n / 10000n);
      expect(await stakingVault.earned(user1, 3)).to.equal(0n);
      await time.increase(181 * 24 * 60 * 60); // 31 days
      expect(await stakingVault.earned(user1, 0)).to.equal((amt / 4n) * 100n / 10000n);
      expect(await stakingVault.earned(user1, 1)).to.equal((amt / 4n) * 300n / 10000n);
      expect(await stakingVault.earned(user1, 2)).to.equal((amt / 4n) * 700n / 10000n);    
      expect(await stakingVault.earned(user1, 3)).to.equal((amt / 4n) * 1500n / 10000n);   
      
    });

    it("Allows re-staking after claim and updates stakerList correctly", async () => {

      const funding = ethers.parseUnits("5000", 18);
      await token.transfer(stakingVault, funding); // Add rewards

      const stakeAmount = ethers.parseUnits("1000", 18);
    
      // Step 1: Stake
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1);
    
      expect(await stakingVault.isStaker(user1.address)).to.equal(true);
    
      // Step 2: Unlock + claim
      await time.increase(31 * 86400);
      await stakingVault.connect(user1).claim(0);
    
      expect(await stakingVault.isStaker(user1.address)).to.equal(false);
      const stakersAfterClaim = await stakingVault.getAllStakers();
      expect(stakersAfterClaim).to.not.include(user1.address);
    
      // Step 3: Re-stake
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1);
    
      expect(await stakingVault.isStaker(user1.address)).to.equal(true);
      const stakersAfterRestake = await stakingVault.getAllStakers();
      expect(stakersAfterRestake).to.include(user1.address);
    });


  });


  describe("Claiming", function () {
    it("Reverts if not unlocked", async () => {
      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Tier 30d
      await expect(stakingVault.connect(user1).claim(0)).to.be.revertedWith("Still locked");
    });

    it("Reverts if claim is called with invalid stake ID", async () => {
      const amount = ethers.parseUnits("1000", 18);
    
      // Stake a valid one so user1 has a stake[0], but no stake[1]
      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Valid stake
    
      // Try to claim non-existent stake index
      await expect(
        stakingVault.connect(user1).claim(1)
      ).to.be.revertedWith("Invalid stake ID");
    });

    it("Reverts earlyWithdraw if stake is already unlocked", async () => {
      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Tier 1 = 30 days
    
      // Fast-forward beyond lock period
      await time.increase(31 * 24 * 60 * 60);
    
      // Should now only be claimable, not earlyWithdraw-able
      await expect(stakingVault.connect(user1).earlyWithdraw(0))
        .to.be.revertedWith("Already unlocked");
    });
    
    it("Reverts claim if stake is still locked", async () => {
      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Tier 1 = 30 days
    
      // Don't time-travel — we're still within the lock period
    
      await expect(
        stakingVault.connect(user1).claim(0)
      ).to.be.revertedWith("Still locked");
    });

    it("Allows claim after lock period and transfer rewards", async () => {
      const amount = ethers.parseUnits("1000", 18);
      const funding = ethers.parseUnits("100", 18);
      await token.transfer(stakingVault, funding); // Add rewards

      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Tier 30d
      await time.increase(31 * 24 * 60 * 60); // 31 days

      await expect(stakingVault.connect(user1).claim(0))
        .to.emit(stakingVault, "Claimed");
      expect(await token.balanceOf(user1)).to.be.above(amount);
      expect(await token.balanceOf(stakingVault)).to.be.below(funding);
    });

    it("Reverts if claim is called twice on the same stake", async () => {
      const stakeAmount = ethers.parseUnits("1000", 18);
      const rewardAmount = stakeAmount * 200n / 10000n; // 2% for tier 1
      const totalFunding = stakeAmount + rewardAmount;
    
      // Fund vault
      await token.transfer(stakingVault, totalFunding);
    
      // Stake
      await token.transfer(user1.address, stakeAmount);
      await token.connect(user1).approve(stakingVault.target, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1); // Tier 1 = 30d
    
      // Time travel to unlock
      await time.increase(31 * 24 * 60 * 60);
    
      // First claim succeeds
      await expect(stakingVault.connect(user1).claim(0))
        .to.emit(stakingVault, "Claimed");
    
      // Second claim fails
      await expect(stakingVault.connect(user1).claim(0))
        .to.be.revertedWith("Already claimed");
    });

    it("Removes user from stakerList after all stakes are claimed", async () => {

      // Fund vault
      const funding = ethers.parseUnits("5000", 18);
      await token.transfer(stakingVault, funding);

      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user1, amount);
      await token.connect(user1).approve(stakingVault, amount);
      await stakingVault.connect(user1).stake(amount, 1); // Tier 1 = 30 days

      expect(await stakingVault.isStaker(user1.address)).to.equal(true);

      await time.increase(31 * 24 * 60 * 60);
      let stakers = await stakingVault.getAllStakers();
      expect(stakers).to.include(user1.address);

      // Claim the stake
      await stakingVault.connect(user1).claim(0);

      expect(await stakingVault.isStaker(user1.address)).to.equal(false);
      stakers = await stakingVault.getAllStakers();
      expect(stakers).to.not.include(user1.address);
    });

  });

  describe("Early Withdrawal", function () {
    it("Allows early withdraw and apply penalty", async () => {
      const amount = ethers.parseUnits("1000", 18);
      const funding = ethers.parseUnits("100", 18);
      await token.transfer(stakingVault, funding); // Add rewards

      await token.transfer(user1.address, amount);
      await token.connect(user1).approve(stakingVault.target, amount);
      await stakingVault.connect(user1).stake(amount, 1);

      await expect(stakingVault.connect(user1).earlyWithdraw(0))
        .to.emit(stakingVault, "EarlyWithdrawn");
    });

    it("Reverts if earlyWithdraw is called twice on the same stake", async () => {
      const stakeAmount = ethers.parseUnits("1000", 18);
      const rewardBuffer = ethers.parseUnits("100", 18); // Not needed, but to mirror real flow
    
      // Fund the vault in case any reward is needed
      await token.transfer(stakingVault, rewardBuffer);
    
      // Give user tokens and stake
      await token.transfer(user1.address, stakeAmount);
      await token.connect(user1).approve(stakingVault.target, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1); // 30d tier
    
      // First earlyWithdraw should succeed
      await expect(stakingVault.connect(user1).earlyWithdraw(0))
        .to.emit(stakingVault, "EarlyWithdrawn");
    
      // Second call should fail
      await expect(stakingVault.connect(user1).earlyWithdraw(0))
        .to.be.revertedWith("Already claimed");
    });

    it("Redirects reward to charity on earlyWithdraw from finalized vault", async () => {
      const stakeAmount = ethers.parseUnits("1000", 18);
      const rewardRate = 100n; // 1%
      const penaltyRate = 1000n; // 10%
      const reward = stakeAmount * rewardRate / 10000n; // 20 PETAI
      const penalty = stakeAmount * penaltyRate / 10000n; // 100 PETAI
      const refund = stakeAmount - penalty;
    
      const totalFunding = reward + ethers.parseUnits("500", 18); // extra buffer
    
      // Fund the vault
      await token.transfer(stakingVault, totalFunding);
    
      // Stake
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1); // Tier 1 = 30d
    
      // Simulate migration — causes stakingVault to finalize
      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const newVault = await StakingVaultFactory.deploy(token.target);
      await token.setStakingVault(newVault.target); // triggers finalizeVault()
    
      // Pre-check balances
      const charityBefore = await token.balanceOf(await token.charityVault());
      const userBefore = await token.balanceOf(user1);
    
      // Early withdraw from finalized vault
      await expect(stakingVault.connect(user1).earlyWithdraw(0)).to.emit(stakingVault, "EarlyWithdrawn");
    
      const userAfter = await token.balanceOf(user1);
      const charityAfter = await token.balanceOf(await token.charityVault());
    
      expect(userAfter - userBefore).to.equal(refund);
      expect(charityAfter - charityBefore).to.equal(penalty + reward);
    });
    
    
  });

  describe("User Summary Views", function () {
    it("Returns accurate data for getUserSummary and getUserOwed", async () => {
      const stake1 = ethers.parseUnits("1000", 18); // Tier 1: 30d @ 1%
      const stake2 = ethers.parseUnits("3000", 18); // Tier 2: 90d @ 3%
  
      const reward1 = stake1 * 100n / 10000n;
      const reward2 = stake2 * 300n / 10000n;
      const totalStake = stake1 + stake2;
      const totalRewards = reward1 + reward2;
  
      const funding = totalStake + totalRewards;
  
      // Setup
      await token.transfer(stakingVault, funding);
      await token.transfer(user1, totalStake);
      await token.connect(user1).approve(stakingVault.target, totalStake);
  
      await stakingVault.connect(user1).stake(stake1, 1);
      await stakingVault.connect(user1).stake(stake2, 2);
  
      // Fast-forward time so both are unlocked
      await time.increase(100 * 24 * 60 * 60);
  
      const summary = await stakingVault.getUserSummary(user1.address);
      const owed = await stakingVault.getUserOwed(user1.address);
      
      expect(summary[0]).to.equal(totalStake);
      expect(summary[1]).to.equal(totalRewards);
      expect(summary[2]).to.equal(totalStake + totalRewards);
      expect(owed).to.equal(totalStake + totalRewards);
    });
  });

  describe("Vault Funding and Migration", function () {

  
    it("Rejects unauthorized caller on StakingVault.migrateTo", async () => {
      await expect(
        stakingVault.connect(user1).migrateTo(user2.address)
      ).to.be.revertedWith("Unauthorized: not token");
    });

    it("Migrates cleanly with a 0 funded vault", async () => {
      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const newVault = await StakingVaultFactory.deploy(token.target);

      await expect(token.setStakingVault(newVault.target)).to.not.be.reverted;
    })

    it("Allows claim from old vault after migration and transfers funds correctly", async () => {
      const stakeAmount = ethers.parseUnits("1000", 18);
      const reward = stakeAmount * 100n / 10000n; // 1% for 30d
      const buffer = ethers.parseUnits("5000", 18);
      const totalFunding = reward + buffer;
    
      // Fund + stake in old vault
      await token.transfer(stakingVault, totalFunding);
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1);

      // Fast forward to unlock
      await time.increase(31 * 86400);
    
      // Deploy new vault and migrate
      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const newVault = await StakingVaultFactory.deploy(token.target);

      await token.setStakingVault(newVault.target);

      await expect(stakingVault.connect(user1).claim(0))
        .to.emit(stakingVault, "Claimed");

      const newBal = await token.balanceOf(newVault);
      expect(newBal).to.equal(buffer);

    });

    it("Finishes claim from old vault after migration and prevents new stakes", async () => {
      const stakeAmount = ethers.parseUnits("1000", 18);
      const reward = stakeAmount * 200n / 10000n;
      const funding = stakeAmount + reward;
    
      // Fund and stake in old vault
      await token.transfer(stakingVault, funding);
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault.target, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1);
    
      // Advance time to unlock
      await time.increase(31 * 86400);
    
      // Deploy new vault and migrate
      const VaultFactory = await ethers.getContractFactory("StakingVault");
      const newVault = await VaultFactory.deploy(token.target);
      await token.setStakingVault(newVault.target);
    
      // Claim still works from old vault
      await expect(stakingVault.connect(user1).claim(0)).to.emit(stakingVault, "Claimed");
    
      // New stake should fail on old vault
      await expect(
        stakingVault.connect(user1).stake(stakeAmount, 1)
      ).to.be.revertedWith("Vault is finalized");
    
      // New stake works on new vault
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(newVault.target, stakeAmount);
      await expect(newVault.connect(user1).stake(stakeAmount, 1))
        .to.emit(newVault, "Staked");
    });

  });

  describe("Admin Controls", function () {
    
    it("Should allow owner to pause staking", async () => {
      await expect(
        stakingVault.pauseStaking(true)
      ).to.be.not.reverted;
    });

    it("Should only allow owner to pause staking", async () => {
      await expect(
        stakingVault.connect(user1).pauseStaking(true)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Prevents external calls to migrateTo and finalizeVault", async () => {
      const newVault = await (await ethers.getContractFactory("StakingVault")).deploy(token.target);
      // Try to call migrateTo directly from non-token user
      await expect(
        stakingVault.connect(user1).migrateTo(newVault.target)
      ).to.be.revertedWith("Unauthorized: not token");
      // finalizeVault is internal, so this shouldn't even compile or expose ABI,
      expect(typeof stakingVault.finalizeVault).to.equal("undefined");
    });
    
  });

  describe("Tier Parameters", function () {
    it("Returns correct lock durations and reward rates", async () => {
      const expected = [
        [0, 0], // NONE / invalid
        [30 * 86400, 100],   // Tier 1 (30d, 2%)
        [90 * 86400, 300],   // Tier 2 (90d, 5%)
        [180 * 86400, 700], // Tier 3 (180d, 10%)
        [365 * 86400, 1500], // Tier 4 (365d, 15%)
      ];
  
      for (let tier = 0; tier < expected.length; tier++) {
        const [duration, rate] = await stakingVault.getTierParams(tier);
        expect(duration).to.equal(expected[tier][0]);
        expect(rate).to.equal(expected[tier][1]);
      }
      await expect(stakingVault.getTierParams(5)).to.be.reverted;

    });

    it("Reverts if staking with invalid tier index", async () => {
      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user1.address, amount);
      await token.connect(user1).approve(stakingVault.target, amount);
    
      const invalidTier = 6;
    
      await expect(
        stakingVault.connect(user1).stake(amount, invalidTier)
      ).to.be.reverted;
    });

  });


  describe("Stress tests", function(){

    it("Fully drains vault after random use + finalization", async () => {

      const tier1 = 1; // 30 days
      const tier2 = 2; // 90 days
    
      const u1Stake = ethers.parseUnits("1000", 18); // user1: early withdraw
      const u2Stake = ethers.parseUnits("2000", 18); // user2: claim
      const u3Stake = ethers.parseUnits("3000", 18); // user3: early withdraw
    
      // Calculate all expected rewards
      const reward1 = u1Stake * 100n / 10000n;
      const reward2 = u2Stake * 300n / 10000n;
      const reward3 = u3Stake * 300n / 10000n;
      const totalReward = reward1 + reward2 + reward3;
    
      // Buffer to keep things safe
      const buffer = ethers.parseUnits("500", 18);
      const totalFunding = totalReward + buffer;
    
      // Fund and stake
      await token.transfer(stakingVault, totalFunding);
    
      for (const [user, amount, tier] of [[user1, u1Stake, tier1], [user2, u2Stake, tier2], [user3, u3Stake, tier2]]) {
        await token.transfer(user, amount);
        await token.connect(user).approve(stakingVault, amount);
        await stakingVault.connect(user).stake(amount, tier);
      }
    
      // Migrate vault → triggers finalization
      const VaultFactory = await ethers.getContractFactory("StakingVault");
      const newVault = await VaultFactory.deploy(token.target);
      await token.setStakingVault(newVault.target);
    
      const charityVault = await token.charityVault();
      const charityBefore = await token.balanceOf(charityVault);
    
      // user1: early withdraw (tier1)
      await stakingVault.connect(user1).earlyWithdraw(0);
    
      // Fast forward enough to unlock tier1 but not tier2
      await time.increase(31 * 86400);

      // user2: claim (tier2 not yet unlockable, should fail)
      await expect(stakingVault.connect(user2).claim(0)).to.be.revertedWith("Still locked");
    
      // user3: early withdraw
      await stakingVault.connect(user3).earlyWithdraw(0);

      // Fast forward more to unlock tier2
      await time.increase(60 * 86400);
    
      // user2: claim
      await stakingVault.connect(user2).claim(0);
    
      // All stakes handled — vault should now be drainable
      const owner = await stakingVault.owner();
    
      const finalVaultBal = await token.balanceOf(stakingVault.target);
      expect(finalVaultBal).to.equal(0);
    
      const charityAfter = await token.balanceOf(charityVault);
      expect(charityAfter).to.be.gte(charityBefore); // We added something

      const newVaultBal = await token.balanceOf(newVault.target);
      expect(newVaultBal).to.equal(buffer); // buffer got migrated

    });
    

  })

});