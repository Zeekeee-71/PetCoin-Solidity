const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("E2E Scenarios", function () {
  async function addLiquidity({ owner, token, weth, positionManager, pool, poolFee }, tokenAmount, wethAmount) {
    await weth.deposit({ value: wethAmount });

    const tokenAddress = token.target ?? token.address;
    const wethAddress = weth.target ?? weth.address;
    const token0 = tokenAddress.toLowerCase() < wethAddress.toLowerCase() ? tokenAddress : wethAddress;
    const token1 = token0 === tokenAddress ? wethAddress : tokenAddress;

    const amount0Desired = token0 === tokenAddress ? tokenAmount : wethAmount;
    const amount1Desired = token1 === tokenAddress ? tokenAmount : wethAmount;

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

  async function deployWithSwapLiquidity() {
    const ecosystem = await deployEcosystem();
    const tokenAmount = ethers.parseUnits("100000000000", 18); // 100B CNU
    const wethAmount = ethers.parseEther("1"); // 1 WETH
    await addLiquidity(ecosystem, tokenAmount, wethAmount);
    return ecosystem;
  }

  async function deployWithTwapLiquidity() {
    const ecosystem = await deployEcosystem();
    const tokenAmount = ethers.parseUnits("10000", 18); // 10k CNU
    const wethAmount = ethers.parseEther("10"); // 10 WETH
    await addLiquidity(ecosystem, tokenAmount, wethAmount);
    return ecosystem;
  }

  describe("Staking + AccessGating", function () {
    it("E2E: Stake in old vault, migrate, claim from old vault, AccessGating still counts owed across history", async () => {
      const { user1, token, stakingVault, gate, feed } = await loadFixture(deployEcosystem);

      await feed.setPrice(ethers.parseUnits("1", 18)); // $1.00
      await gate.setThreshold(2, ethers.parseUnits("100", 18)); // SILVER = $100

      const stakeAmount = ethers.parseUnits("100", 18);
      const reward = stakeAmount / 100n; // 1% on THIRTY tier

      await token.transfer(stakingVault, reward);
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1);

      expect(await gate.getTier(user1.address)).to.equal(2);

      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const stakingVault2 = await StakingVaultFactory.deploy(token);
      await token.setStakingVault(stakingVault2);

      expect((await token.getStakingVaultHistory()).length).to.equal(2);
      expect(await gate.getTier(user1.address)).to.equal(2);

      await time.increase(31 * 24 * 60 * 60);
      await stakingVault.connect(user1).claim(0);

      expect(await gate.getUserStakedOwed(user1.address)).to.equal(0n);
      expect(await token.balanceOf(user1.address)).to.equal(stakeAmount + reward);
      expect(await gate.getTier(user1.address)).to.equal(2);
    });

    it("E2E: User has stakes in multiple historical staking vaults; tier reflects sum of principal + unclaimed rewards", async () => {
      const { user1, token, stakingVault, gate, feed } = await loadFixture(deployEcosystem);

      await feed.setPrice(ethers.parseUnits("1", 18)); // $1.00
      await gate.setThreshold(2, ethers.parseUnits("160", 18)); // SILVER = $160

      const stake1 = ethers.parseUnits("100", 18);
      const reward1 = stake1 / 100n;

      await token.transfer(stakingVault, reward1);
      await token.transfer(user1, stake1);
      await token.connect(user1).approve(stakingVault, stake1);
      await stakingVault.connect(user1).stake(stake1, 1);

      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const stakingVault2 = await StakingVaultFactory.deploy(token);
      await token.setStakingVault(stakingVault2);

      const stake2 = ethers.parseUnits("60", 18);
      const reward2 = stake2 / 100n;

      await token.transfer(stakingVault2, reward2);
      await token.transfer(user1, stake2);
      await token.connect(user1).approve(stakingVault2, stake2);
      await stakingVault2.connect(user1).stake(stake2, 1);

      const expectedOwed = (stake1 + reward1) + (stake2 + reward2);
      expect(await gate.getUserStakedOwed(user1.address)).to.equal(expectedOwed);
      expect(await gate.getTier(user1.address)).to.equal(2);
    });

    it("E2E: Fee inflows build reward reserves; new stake succeeds without manual prefund", async () => {
      const { user1, user2, token, stakingVault } = await loadFixture(deployEcosystem);

      const feeGeneratingTransfer = ethers.parseUnits("500", 18);
      const stakeAmount = ethers.parseUnits("1000", 18);
      const rewardNeeded = stakeAmount / 100n; // 1% on THIRTY tier

      await token.transfer(user1, feeGeneratingTransfer + stakeAmount);

      expect(await token.balanceOf(stakingVault)).to.equal(0n);
      await token.connect(user1).transfer(user2, feeGeneratingTransfer);
      expect(await token.balanceOf(stakingVault)).to.equal(rewardNeeded);

      await token.connect(user1).approve(stakingVault, stakeAmount);
      await expect(stakingVault.connect(user1).stake(stakeAmount, 1)).to.not.be.reverted;
      expect(await stakingVault.getTotalLiabilities()).to.equal(rewardNeeded);
    });

    it("E2E: Early withdraw pre-finalization vs post-finalization routes reward to charity correctly", async () => {
      const { user1, token, charityVault, stakingVault } = await loadFixture(deployEcosystem);

      const stakeAmount = ethers.parseUnits("1000", 18);
      const reward = stakeAmount / 100n;
      const penalty = stakeAmount / 10n; // 10%

      await token.transfer(stakingVault, reward * 2n);
      await token.transfer(user1, stakeAmount * 2n);
      await token.connect(user1).approve(stakingVault, stakeAmount * 2n);

      await stakingVault.connect(user1).stake(stakeAmount, 1);

      const charityBefore = await token.balanceOf(charityVault);
      await stakingVault.connect(user1).earlyWithdraw(0);
      const charityAfterPre = await token.balanceOf(charityVault);
      expect(charityAfterPre - charityBefore).to.equal(penalty);

      await stakingVault.connect(user1).stake(stakeAmount, 1);

      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const stakingVault2 = await StakingVaultFactory.deploy(token);
      await token.setStakingVault(stakingVault2);

      const charityBeforePost = await token.balanceOf(charityVault);
      await stakingVault.connect(user1).earlyWithdraw(1);
      const charityAfterPost = await token.balanceOf(charityVault);
      expect(charityAfterPost - charityBeforePost).to.equal(penalty + reward);
    });
  });

  describe("Vault Upgrades + History", function () {
    it("E2E: Charity vault migration moves balance and appends to history", async () => {
      const { owner, token, charityVault } = await loadFixture(deployEcosystem);

      const CharityVaultFactory = await ethers.getContractFactory("CharityVault");
      const newCharityVault = await CharityVaultFactory.deploy(token);

      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(charityVault, amount);

      const historyBefore = await token.getCharityVaultHistory();
      expect(historyBefore.length).to.equal(1);
      expect(historyBefore[0]).to.equal(charityVault.target);

      await token.connect(owner).setCharityVault(newCharityVault);

      expect(await token.balanceOf(charityVault)).to.equal(0n);
      expect(await token.balanceOf(newCharityVault)).to.equal(amount);

      const historyAfter = await token.getCharityVaultHistory();
      expect(historyAfter.length).to.equal(2);
      expect(historyAfter[1]).to.equal(newCharityVault.target);
    });

    it("E2E: Treasury vault migration moves balance and appends to history", async () => {
      const { owner, token, treasuryVault } = await loadFixture(deployEcosystem);

      const TreasuryVaultFactory = await ethers.getContractFactory("TreasuryVault");
      const newTreasuryVault = await TreasuryVaultFactory.deploy(token);

      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(treasuryVault, amount);

      const historyBefore = await token.getTreasuryVaultHistory();
      expect(historyBefore.length).to.equal(1);
      expect(historyBefore[0]).to.equal(treasuryVault.target);

      await token.connect(owner).setTreasuryVault(newTreasuryVault);

      expect(await token.balanceOf(treasuryVault)).to.equal(0n);
      expect(await token.balanceOf(newTreasuryVault)).to.equal(amount);

      const historyAfter = await token.getTreasuryVaultHistory();
      expect(historyAfter.length).to.equal(2);
      expect(historyAfter[1]).to.equal(newTreasuryVault.target);
    });

    it("E2E: Repeated vault rotations do not duplicate history entries", async () => {
      const { token, stakingVault } = await loadFixture(deployEcosystem);

      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const v2 = await StakingVaultFactory.deploy(token);
      const v3 = await StakingVaultFactory.deploy(token);

      expect((await token.getStakingVaultHistory()).length).to.equal(1);

      await token.setStakingVault(v2);
      await token.setStakingVault(v3);
      let history = await token.getStakingVaultHistory();
      expect(history.length).to.equal(3);
      expect(history[0]).to.equal(stakingVault.target);
      expect(history[1]).to.equal(v2.target);
      expect(history[2]).to.equal(v3.target);

      // Rotate back to a previous vault; should not append again.
      await token.setStakingVault(v2);
      history = await token.getStakingVaultHistory();
      expect(history.length).to.equal(3);
      expect(history[0]).to.equal(stakingVault.target);
      expect(history[1]).to.equal(v2.target);
      expect(history[2]).to.equal(v3.target);
    });
  });

  describe("Swaps + Price Feeds", function () {
    it("E2E: Add liquidity, update TWAP, AccessGating uses updated feed without exceeding maxPrice", async () => {
    const { owner, user1, token, gate, unifeed } = await loadFixture(deployWithTwapLiquidity);

      await time.increase(1800);
      await unifeed.update();

      const price = await unifeed.getLatestPrice();
      expect(price).to.be.gt(0n);
      expect(price).to.be.lte(await gate.maxPrice());

      await gate.connect(owner).setPriceFeed(unifeed);
      expect(await gate.getUSD(ethers.parseUnits("1", 18))).to.equal(price);

      await token.transfer(user1, ethers.parseUnits("1", 18));
      expect(await gate.getUserUSD(user1.address)).to.equal(price);
    });

    it("E2E: Router swap respects amountOutMin and updates balances as expected", async () => {
      const { user1, token, weth, router, poolFee } = await loadFixture(deployWithSwapLiquidity);

      const amountIn = ethers.parseUnits("100000", 18);
      await token.transfer(user1.address, amountIn);
      await token.connect(user1).approve(router, amountIn);

      const deadline = BigInt(await time.latest()) + 1200n;

      await expect(
        router.connect(user1).exactInputSingle({
          tokenIn: token.target,
          tokenOut: weth.target,
          fee: poolFee,
          recipient: user1.address,
          deadline,
          amountIn,
          amountOutMinimum: ethers.parseEther("1"),
          sqrtPriceLimitX96: 0,
        })
      ).to.be.reverted;

      const wethBefore = await weth.balanceOf(user1.address);
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
      const wethAfter = await weth.balanceOf(user1.address);
      expect(wethAfter).to.be.gt(wethBefore);
    });
  });

  describe("Pausing + Limits", function () {
    it("E2E: Token pause blocks transfers/staking flows and unpause restores functionality", async () => {
      const { owner, user1, user2, token, stakingVault } = await loadFixture(deployEcosystem);

      const stakeAmount = ethers.parseUnits("100", 18);
      const reward = stakeAmount / 100n;

      await token.transfer(stakingVault, reward);
      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);

      await token.connect(owner).pause();

      await expect(token.transfer(user2, 1)).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(stakingVault.connect(user1).stake(stakeAmount, 1)).to.be.revertedWithCustomError(token, "EnforcedPause");

      await token.connect(owner).unpause();

      await expect(token.transfer(user2, 1)).to.not.be.reverted;
      await expect(stakingVault.connect(user1).stake(stakeAmount, 1)).to.not.be.reverted;
    });

    it("E2E: Tx/wallet limits interact with router and pool exemptions correctly", async () => {
      const { user1, user2, token, weth, router, pool, poolFee } = await loadFixture(deployWithSwapLiquidity);

      // Make wallet limit small enough to hit, and tx limit modest.
      await token.setWalletLimit(ethers.parseUnits("10000001", 18)); // 10,000,001
      await token.setTxLimit(ethers.parseUnits("20000000", 18)); // 20,000,000

      const initial = ethers.parseUnits("25000000", 18); // 25,000,000
      await token.transfer(user1, initial);

      // Wallet limit should block net incoming to a normal address.
      await expect(token.connect(user1).transfer(user2, ethers.parseUnits("15000000", 18))).to.be.revertedWith("Exceeds max wallet size");

      // Now tighten tx limit; normal transfer should fail, but router swap to pool should still work since pool is limit-exempt.
      await token.setTxLimit(ethers.parseUnits("10000001", 18)); // 10,000,001

      const amountIn = ethers.parseUnits("20000000", 18); // 20,000,000 > tx limit
      await expect(token.connect(user1).transfer(user2, amountIn)).to.be.revertedWith("Exceeds max transaction size");

      const deadline = BigInt(await time.latest()) + 1200n;
      await token.connect(user1).approve(router, amountIn);

      const wethBefore = await weth.balanceOf(user1.address);
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
      const wethAfter = await weth.balanceOf(user1.address);
      expect(wethAfter).to.be.gt(wethBefore);

      // Sanity: token->pool transfer bypassed tx limit because pool is excluded from limits.
      expect(await token.isExcludedFromLimits(pool)).to.equal(true);
      expect(await token.isExcludedFromFees(pool)).to.equal(true);
    });
  });
});
