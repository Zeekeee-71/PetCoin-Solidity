const addressesFor = require("../lib/addresses");

task("status", "Get summery stats")
  .setAction(async (args, hre) => {

    const fs = require("fs");
    const path = require("path");
    const network = hre.network.name;
    const deployed = addressesFor(network);

    console.info("Contract Addresses:", deployed)
  
    const [signer] = await ethers.getSigners();
    console.log(`📡 Querying contracts from: ${signer.address} on [${network}]\n`);
  
    const token = await ethers.getContractAt("CNU", deployed.token);
    const treasuryVault = await ethers.getContractAt("TreasuryVault", deployed.treasury);
    const charityVault = await ethers.getContractAt("CharityVault", deployed.charity);
    const stakingVault = await ethers.getContractAt("StakingVault", deployed.staking);
    const feed = await ethers.getContractAt("UniswapV3PriceFeed", deployed.feed);
    const gate = await ethers.getContractAt("AccessGating", deployed.gate);
  
    // === Token ===
    const [name, symbol, supply, balance] = await Promise.all([
      token.name(),
      token.symbol(),
      token.totalSupply(),
      token.balanceOf(signer.address)
    ]);
    console.log(`💰 Token: ${name} (${symbol})`);
    console.log(`   Total Supply: ${ethers.formatEther(supply)} CNU`);
    console.log(`   Your Balance: ${ethers.formatEther(balance)} CNU\n`);
  
    const [treasuryBal, charityBal, stakingBal] = await Promise.all([
      token.balanceOf(treasuryVault),
      token.balanceOf(charityVault),
      token.balanceOf(stakingVault),
    ]);

    // === Vault ===
    const [totalStaked, earlyWithdrawPenalty, charityVaultAddress, stakingPaused] = await stakingVault.getVaultStats();
    const [totalLiabilities, isFinalized] = await Promise.all([
      stakingVault.totalLiabilities(),
      stakingVault.isFinalized(),
    ]);
    console.log("🏦 Staking Vault:");
    console.log(`   Total Staked: ${ethers.formatEther(totalStaked)} CNU`);
    console.log(`   Total Funded: ${ethers.formatEther(stakingBal - totalStaked)} CNU`);
    console.log(`   Total Liabilities: ${ethers.formatEther(totalLiabilities)} CNU`);
    console.log(`   Penalty Rate: ${earlyWithdrawPenalty / 100n}%`);
    console.log(`   Charity Vault (penalty receiver): ${charityVaultAddress}`);
    console.log(`   Staking Paused: ${stakingPaused}`);
    console.log(`   Finalized: ${isFinalized}\n`);
  


    console.log("📦 Vaults:");
    console.log(`   Treasury: ${ethers.formatEther(treasuryBal)} CNU`);
    console.log(`   Charity: ${ethers.formatEther(charityBal)} CNU`);
    console.log(`   Staking: ${ethers.formatEther(stakingBal)} CNU\n`);
  
    // === Oracle ===
    const price = await feed.getLatestPrice();
    const quotePerCnu = Number(price) / 1e18;
    console.log(`📉 Price: ${quotePerCnu.toFixed(9)} quote / CNU\n`);
  
    // === Gating ===
  
    const tiers = ["NONE", "CLUB", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
  
    const tier = await gate.getTier(signer.address);
    console.log(`🧭 AccessGating Tier (You): Tier #${tiers[tier]}`);
  
  
    for (let i = 1; i <= 5; i++) {
      const val = await gate.usdThresholds(i);
      console.log(`   ${tiers[i]}: $${ethers.formatUnits(val, 18)}`);
    }

  });
