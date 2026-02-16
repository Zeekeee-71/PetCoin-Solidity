const addressesFor = require("../lib/addresses");

task("treasury-fund", "Fund the treasury vault with a CNU amount or all available CNU")
  .addOptionalPositionalParam("amount", "Amount of CNU to fund, or 'all'", "all")
  .setAction(async ({ amount }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);

    if (!deployed?.treasury || !deployed?.token) {
      throw new Error(`Token/treasury addresses missing for network '${hre.network.name}'`);
    }

    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("CNU", deployed.token);
    const treasury = await ethers.getContractAt("TreasuryVault", deployed.treasury);

    const signerBalance = await token.balanceOf(signer.address);
    const useAll = amount.toLowerCase() === "all";
    const amountWei = useAll ? signerBalance : ethers.parseUnits(amount, 18);

    if (amountWei <= 0n) {
      throw new Error("Funding amount must be greater than zero");
    }

    if (amountWei > signerBalance) {
      throw new Error(
        `Insufficient CNU balance. Requested ${ethers.formatUnits(amountWei, 18)}, available ${ethers.formatUnits(signerBalance, 18)}`
      );
    }

    console.log(`Using signer: ${signer.address}`);
    console.log(`Funding treasury with ${ethers.formatUnits(amountWei, 18)} CNU`);

    const allowance = await token.allowance(signer.address, deployed.treasury);
    if (allowance < amountWei) {
      const approveTx = await token.connect(signer).approve(deployed.treasury, amountWei);
      const approveReceipt = await approveTx.wait();
      console.log(`Approval set. Tx hash: ${approveReceipt.hash}`);
    }

    const tx = await treasury.connect(signer).fund(amountWei);
    const receipt = await tx.wait();

    const [updatedSignerBalance, treasuryBalance] = await Promise.all([
      token.balanceOf(signer.address),
      token.balanceOf(deployed.treasury),
    ]);

    console.log(`✅ Treasury funding complete. Tx hash: ${receipt.hash}`);
    console.log(`Signer balance: ${ethers.formatUnits(updatedSignerBalance, 18)} CNU`);
    console.log(`Treasury balance: ${ethers.formatUnits(treasuryBalance, 18)} CNU`);
  });
