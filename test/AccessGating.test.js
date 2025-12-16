const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem } = require("./utils/deploy");

describe("AccessGating", function () {

  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed;

  beforeEach(async () => {
    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed } = ecosystem);
  });


  describe("Tier Resolution", function () {

    it("Rejects updates to tier NONE and CLUB", async () => {
      await expect(gate.setThreshold(0, 1)).to.be.revertedWith("Invalid tier");
      await expect(gate.setThreshold(1, 1)).to.be.revertedWith("Invalid tier");
    });

    it("Returns correct tier based on token value in USD", async () => {

      await feed.setPrice(ethers.parseUnits("2", 18)); // $2.00

      await gate.setThreshold(2, ethers.parseUnits("10", 18));
      await gate.setThreshold(3, ethers.parseUnits("100", 18));
      await gate.setThreshold(4, ethers.parseUnits("1000", 18));
      await gate.setThreshold(5, ethers.parseUnits("10000", 18));

      // Value of 10 tokens @ $2 = $20
      const amount = ethers.parseUnits("10", 18);
      expect(await gate.getUSD(amount)).to.equal(ethers.parseUnits("20", 18));

      await token.transfer(user1, amount);

      const tier = await gate.getTier(user1);
      expect(tier).to.equal(2); // should fall into tier 1
    });

    it("Returns tier NONE when token value 0", async () => {
      await feed.setPrice(ethers.parseUnits("0.50", 18)); // $0.50
      const tier = await gate.getTier(user1);
      expect(tier).to.equal(0);
    });

    it("Returns tier 1 (club) for at least one token.", async () => {
      await feed.setPrice(ethers.parseUnits("0.005", 18)); 
      const amount = ethers.parseUnits("1", 18); // a single token
      await token.transfer(user1, amount);
      const tier = await gate.getTier(user1);
      expect(tier).to.equal(1);
    });

    it("Returns highest tier when token value exceeds top threshold", async () => {
      await feed.setPrice(ethers.parseUnits("20", 18)); // $20.00
      const amount = ethers.parseUnits("1000", 18); // $20,000
      await token.transfer(user1, amount);
      const tier = await gate.getTier(user1);
      expect(tier).to.equal(5); // max tier
    });

    it("Correctly handles edge rounding on USD value to tier threshold", async () => {
      // Set threshold for SILVER at $100
      await gate.setThreshold(2, ethers.parseUnits("100", 18));
    
      // Set price so that 49.9999 tokens is just under $100
      await feed.setPrice(ethers.parseUnits("2", 18)); // $2.00
    
      const almostSilver = ethers.parseUnits("49.9999", 18);
      await token.transfer(user1, almostSilver);
      expect(await gate.getTier(user1)).to.equal(1); // CLUB
    
      const exactSilver = ethers.parseUnits("50", 18);
      await token.transfer(user1, ethers.parseUnits("0.0001", 18));
      expect(await gate.getTier(user1)).to.equal(2); // SILVER
    });
    
    it("Reverts if price feed returns non-positive price", async () => {
      const PriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
      const priceFeed = await PriceFeedFactory.deploy();
      await gate.setPriceFeed(priceFeed);
      await priceFeed.setPrice(0);  // set to zero
      await expect(gate.getUserUSD(user1)).to.be.revertedWith("Invalid price");
    });

    
    it("Correctly validates hasAccess for each tier level", async () => {
      await feed.setPrice(ethers.parseUnits("1", 18)); // $1.00
    
      const tiers = {
        1: ethers.parseUnits("1", 18),
        2: ethers.parseUnits("100", 18),
        3: ethers.parseUnits("500", 18),
        4: ethers.parseUnits("1000", 18),
        5: ethers.parseUnits("10000", 18),
      };
    
      for (let tier = 1; tier <= 5; tier++) {
        await token.transfer(user1, tiers[tier]);
        expect(await gate.getTier(user1)).to.equal(tier);
        for (let check = 1; check <= 5; check++) {
          const has = await gate.hasAccess(user1, check);
          expect(has).to.equal(tier >= check);
        }
      }
    });
    
    it("Downgrades tier if token balance decreases below threshold", async () => {
      await feed.setPrice(ethers.parseUnits("1", 18)); // $1
    
      const amount = ethers.parseUnits("1000", 18); // Initially $1000
      await token.transfer(user1, amount);
      expect(await gate.getTier(user1)).to.equal(4); // PLATINUM
    
      // Transfer away 900
      await token.connect(user1).transfer(user2, ethers.parseUnits("900", 18));
      expect(await gate.getTier(user1)).to.equal(2); // SILVER
    });

    it("Counts staked principal + unclaimed rewards across staking vault history", async () => {
      await feed.setPrice(ethers.parseUnits("1", 18)); // $1.00
      await gate.setThreshold(2, ethers.parseUnits("100", 18)); // SILVER = $100

      const stakeAmount = ethers.parseUnits("100", 18);
      const expectedReward = stakeAmount / 100n; // 1% on THIRTY tier

      // Prefund the staking vault so it can cover the promised reward.
      await token.transfer(stakingVault, expectedReward);

      await token.transfer(user1, stakeAmount);
      await token.connect(user1).approve(stakingVault, stakeAmount);
      await stakingVault.connect(user1).stake(stakeAmount, 1); // Tier.THIRTY

      expect(await token.balanceOf(user1)).to.equal(0n);
      expect(await gate.getTier(user1)).to.equal(2); // SILVER, via staked balance

      const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
      const stakingVault2 = await StakingVaultFactory.deploy(token);
      await token.setStakingVault(stakingVault2);

      const history = await token.getStakingVaultHistory();
      expect(history.length).to.equal(2);

      expect(await gate.getUserStakedOwed(user1)).to.equal(stakeAmount + expectedReward);
      expect(await gate.getTier(user1)).to.equal(2); // SILVER still, stake lives in old vault
    });

    it("Prevents setting thresholds that break tier ordering", async () => {
      await expect(gate.setThreshold(3, ethers.parseUnits("50", 18))).to.be.revertedWith("Must be higher than lower tiers");
      await expect(gate.setThreshold(2, ethers.parseUnits("600", 18))).to.be.revertedWith("Must be lower than higher tiers");

      await gate.setThreshold(2, ethers.parseUnits("5", 18)); // SILVER
      await gate.setThreshold(3, ethers.parseUnits("50", 18)); // GOLD
      await expect(gate.setThreshold(2, ethers.parseUnits("100", 18))).to.be.revertedWith("Must be lower than higher tiers");
    });

    

  });

})
