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
  
    const token = await ethers.getContractAt("PetCoinAI", deployed.token);
    const charityVault = await ethers.getContractAt("CharityVault", deployed.charity);
    const stakingVault = await ethers.getContractAt("StakingVault", deployed.staking);
    const feed = await ethers.getContractAt("MockPriceFeed", deployed.feed);
    const gate = await ethers.getContractAt("AccessGating", deployed.gate);
  
    // === Token ===
    const [name, symbol, supply, balance] = await Promise.all([
      token.name(),
      token.symbol(),
      token.totalSupply(),
      token.balanceOf(signer.address)
    ]);
    console.log(`💰 Token: ${name} (${symbol})`);
    console.log(`   Total Supply: ${ethers.formatEther(supply)} PETAI`);
    console.log(`   Your Balance: ${ethers.formatEther(balance)} PETAI\n`);
  
    const [charityBal, stakingBal] = await Promise.all([
      token.balanceOf(charityVault),
      token.balanceOf(stakingVault),
    ]);

    // === Vault ===
    const [staked, penalty, receiver, paused] = await stakingVault.getVaultStats();
    console.log("🏦 Staking Vault:");
    console.log(`   Total Staked: ${ethers.formatEther(staked)} PETAI`);
    console.log(`   Total Funded: ${ethers.formatEther(stakingBal - staked)} PETAI`);
    console.log(`   Penalty Rate: ${penalty / 100n}%`);
    console.log(`   Penalty Receiver: ${receiver}`);
    console.log(`   Staking Paused: ${paused}\n`);
  


    console.log("📦 Vaults:");
    console.log(`   Charity: ${ethers.formatEther(charityBal)} PETAI`);
    console.log(`   Staking: ${ethers.formatEther(stakingBal)} PETAI\n`);
  
    // === Oracle ===
    const price= await feed.getLatestPrice();
    const usd = Number(price) / 1e18;
    console.log(`📉 Price: $${usd.toFixed(9)} / PETAI\n`);
  
    // === Gating ===
  
    const tiers = ["NONE", "CLUB", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
  
    const tier = await gate.getTier(signer.address);
    console.log(`🧭 AccessGating Tier (You): Tier #${tiers[tier]}`);
  
  
    for (let i = 1; i <= 5; i++) {
      const val = await gate.usdThresholds(i);
      console.log(`   ${tiers[i]}: $${ethers.formatUnits(val, 18)}`);
    }

  });