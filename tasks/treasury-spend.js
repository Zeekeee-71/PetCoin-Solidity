const addressesFor = require("../lib/addresses");

task("treasury-spend", "Spend CNU from the treasury vault to a recipient")
  .addPositionalParam("amount", "Amount of CNU to spend (e.g. 100.5)")
  .addPositionalParam("recipient", "Recipient wallet address")
  .addPositionalParam("memo", "Memo to store on-chain")
  .setAction(async ({ amount, recipient, memo }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);

    if (!deployed?.treasury) {
      throw new Error(`No treasury vault configured for network '${hre.network.name}'`);
    }

    if (!ethers.isAddress(recipient)) {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }

    const amountWei = ethers.parseUnits(amount, 18);
    if (amountWei <= 0n) {
      throw new Error("Amount must be greater than zero");
    }

    const [signer] = await ethers.getSigners();
    const treasury = await ethers.getContractAt("TreasuryVault", deployed.treasury);
    const token = await ethers.getContractAt("CNU", deployed.token);

    console.log(`Using signer: ${signer.address}`);
    console.log(`Spending ${ethers.formatUnits(amountWei, 18)} CNU from treasury to ${recipient}`);
    console.log(`Memo: ${memo}`);

    const tx = await treasury.connect(signer).withdraw(recipient, amountWei, memo);
    const receipt = await tx.wait();

    const [treasuryBalance, recipientBalance] = await Promise.all([
      token.balanceOf(deployed.treasury),
      token.balanceOf(recipient),
    ]);

    console.log(`✅ Treasury spend complete. Tx hash: ${receipt.hash}`);
    console.log(`Treasury balance: ${ethers.formatUnits(treasuryBalance, 18)} CNU`);
    console.log(`Recipient balance: ${ethers.formatUnits(recipientBalance, 18)} CNU`);
  });
