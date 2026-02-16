const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SplitBuy", function () {
  async function deploySplitBuyFixture() {
    const [owner, payer, dev, holdings, other] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const weth = await MockERC20Factory.deploy("Wrapped Ether", "WETH");
    const dai = await MockERC20Factory.deploy("Dai Stablecoin", "DAI");
    const otherToken = await MockERC20Factory.deploy("Other Token", "OTK");

    const SplitBuyFactory = await ethers.getContractFactory("SplitBuy");
    const splitBuy = await SplitBuyFactory.deploy(
      dev.address,
      holdings.address,
      [ethers.ZeroAddress, weth.target, dai.target]
    );

    await weth.mint(payer.address, ethers.parseEther("100"));
    await dai.mint(payer.address, ethers.parseEther("100"));
    await otherToken.mint(payer.address, ethers.parseEther("100"));

    return {
      owner,
      payer,
      dev,
      holdings,
      other,
      splitBuy,
      weth,
      dai,
      otherToken,
    };
  }

  it("Stores constructor configuration and allowed tokens", async () => {
    const { splitBuy, dev, holdings, weth, dai } = await loadFixture(deploySplitBuyFixture);

    expect(await splitBuy.devWallet()).to.equal(dev.address);
    expect(await splitBuy.holdingsWallet()).to.equal(holdings.address);
    expect(await splitBuy.isAllowedToken(ethers.ZeroAddress)).to.equal(true);
    expect(await splitBuy.isAllowedToken(weth.target)).to.equal(true);
    expect(await splitBuy.isAllowedToken(dai.target)).to.equal(true);
    expect(await splitBuy.DEV_SHARE_BPS()).to.equal(2000n);
  });

  it("Rejects zero recipients in constructor", async () => {
    const [, , , holdings] = await ethers.getSigners();
    const SplitBuyFactory = await ethers.getContractFactory("SplitBuy");

    await expect(
      SplitBuyFactory.deploy(ethers.ZeroAddress, holdings.address, [])
    ).to.be.revertedWith("Invalid dev wallet");

    await expect(
      SplitBuyFactory.deploy(holdings.address, ethers.ZeroAddress, [])
    ).to.be.revertedWith("Invalid holdings wallet");
  });

  it("Allows owner to update recipients", async () => {
    const { splitBuy, other } = await loadFixture(deploySplitBuyFixture);

    await expect(splitBuy.setRecipients(other.address, other.address))
      .to.emit(splitBuy, "RecipientsUpdated")
      .withArgs(other.address, other.address);

    expect(await splitBuy.devWallet()).to.equal(other.address);
    expect(await splitBuy.holdingsWallet()).to.equal(other.address);
  });

  it("Blocks non-owner recipient updates", async () => {
    const { splitBuy, payer, other } = await loadFixture(deploySplitBuyFixture);

    await expect(
      splitBuy.connect(payer).setRecipients(other.address, other.address)
    ).to.be.revertedWithCustomError(splitBuy, "OwnableUnauthorizedAccount");
  });

  it("Allows owner to toggle allowed tokens", async () => {
    const { splitBuy, otherToken } = await loadFixture(deploySplitBuyFixture);

    await expect(splitBuy.setAllowedToken(otherToken.target, true))
      .to.emit(splitBuy, "AllowedTokenUpdated")
      .withArgs(otherToken.target, true);

    expect(await splitBuy.isAllowedToken(otherToken.target)).to.equal(true);
  });

  it("Blocks non-owner token allowlist updates", async () => {
    const { splitBuy, payer, otherToken } = await loadFixture(deploySplitBuyFixture);

    await expect(
      splitBuy.connect(payer).setAllowedToken(otherToken.target, true)
    ).to.be.revertedWithCustomError(splitBuy, "OwnableUnauthorizedAccount");
  });

  it("Splits native payment 20/80 and emits payment metadata", async () => {
    const { splitBuy, payer, dev, holdings } = await loadFixture(deploySplitBuyFixture);

    const amount = ethers.parseEther("1");
    const devShare = amount / 5n;
    const holdingsShare = amount - devShare;

    const devBefore = await ethers.provider.getBalance(dev.address);
    const holdingsBefore = await ethers.provider.getBalance(holdings.address);

    await expect(
      splitBuy.connect(payer).payNative(777, { value: amount })
    ).to.emit(splitBuy, "PaymentReceived").withArgs(
      777n,
      payer.address,
      ethers.ZeroAddress,
      amount,
      devShare,
      holdingsShare,
      dev.address,
      holdings.address
    );

    const devAfter = await ethers.provider.getBalance(dev.address);
    const holdingsAfter = await ethers.provider.getBalance(holdings.address);

    expect(devAfter - devBefore).to.equal(devShare);
    expect(holdingsAfter - holdingsBefore).to.equal(holdingsShare);
    expect(await ethers.provider.getBalance(splitBuy.target)).to.equal(0);
  });

  it("Rounds native dust to holdings wallet", async () => {
    const { splitBuy, payer, dev, holdings } = await loadFixture(deploySplitBuyFixture);

    const amount = 1n;
    const devBefore = await ethers.provider.getBalance(dev.address);
    const holdingsBefore = await ethers.provider.getBalance(holdings.address);

    await splitBuy.connect(payer).payNative(1, { value: amount });

    const devAfter = await ethers.provider.getBalance(dev.address);
    const holdingsAfter = await ethers.provider.getBalance(holdings.address);

    expect(devAfter - devBefore).to.equal(0);
    expect(holdingsAfter - holdingsBefore).to.equal(1n);
  });

  it("Rejects native payment when disabled", async () => {
    const { splitBuy, payer } = await loadFixture(deploySplitBuyFixture);
    await splitBuy.setAllowedToken(ethers.ZeroAddress, false);

    await expect(
      splitBuy.connect(payer).payNative(99, { value: 1n })
    ).to.be.revertedWith("Native payment disabled");
  });

  it("Rejects zero-value native payments", async () => {
    const { splitBuy, payer } = await loadFixture(deploySplitBuyFixture);

    await expect(
      splitBuy.connect(payer).payNative(10, { value: 0 })
    ).to.be.revertedWith("Amount must be > 0");
  });

  it("Rejects direct native transfers", async () => {
    const { splitBuy, payer } = await loadFixture(deploySplitBuyFixture);

    await expect(
      payer.sendTransaction({ to: splitBuy.target, value: 1n })
    ).to.be.revertedWith("Use payNative");
  });

  it("Splits ERC20 token payments 20/80", async () => {
    const { splitBuy, payer, dev, holdings, dai } = await loadFixture(deploySplitBuyFixture);

    const amount = ethers.parseEther("37");
    const devShare = amount / 5n;
    const holdingsShare = amount - devShare;

    await dai.connect(payer).approve(splitBuy.target, amount);

    await expect(splitBuy.connect(payer).payToken(123, dai.target, amount))
      .to.emit(splitBuy, "PaymentReceived")
      .withArgs(
        123n,
        payer.address,
        dai.target,
        amount,
        devShare,
        holdingsShare,
        dev.address,
        holdings.address
      );

    expect(await dai.balanceOf(dev.address)).to.equal(devShare);
    expect(await dai.balanceOf(holdings.address)).to.equal(holdingsShare);
    expect(await dai.balanceOf(splitBuy.target)).to.equal(0);
  });

  it("Rounds ERC20 dust to holdings wallet", async () => {
    const { splitBuy, payer, dev, holdings, dai } = await loadFixture(deploySplitBuyFixture);

    const amount = 7n;
    await dai.connect(payer).approve(splitBuy.target, amount);
    await splitBuy.connect(payer).payToken(4, dai.target, amount);

    expect(await dai.balanceOf(dev.address)).to.equal(1n);
    expect(await dai.balanceOf(holdings.address)).to.equal(6n);
  });

  it("Rejects invalid token payment inputs", async () => {
    const { splitBuy, payer, dai, otherToken } = await loadFixture(deploySplitBuyFixture);

    await expect(
      splitBuy.connect(payer).payToken(1, ethers.ZeroAddress, 1n)
    ).to.be.revertedWith("Use payNative for native");

    await expect(
      splitBuy.connect(payer).payToken(1, otherToken.target, 1n)
    ).to.be.revertedWith("Token not allowed");

    await expect(
      splitBuy.connect(payer).payToken(1, dai.target, 0)
    ).to.be.revertedWith("Amount must be > 0");
  });

  it("Reverts when dev recipient rejects native transfer", async () => {
    const { splitBuy, payer, holdings } = await loadFixture(deploySplitBuyFixture);
    const RejectFactory = await ethers.getContractFactory("RejectNativeReceiver");
    const rejector = await RejectFactory.deploy();

    await splitBuy.setRecipients(rejector.target, holdings.address);

    await expect(
      splitBuy.connect(payer).payNative(33, { value: 10n })
    ).to.be.revertedWith("Dev transfer failed");
  });

  it("Reverts when holdings recipient rejects native transfer", async () => {
    const { splitBuy, payer, dev } = await loadFixture(deploySplitBuyFixture);
    const RejectFactory = await ethers.getContractFactory("RejectNativeReceiver");
    const rejector = await RejectFactory.deploy();

    await splitBuy.setRecipients(dev.address, rejector.target);

    await expect(
      splitBuy.connect(payer).payNative(34, { value: 10n })
    ).to.be.revertedWith("Holdings transfer failed");
  });

  it("Prevents reentrancy during native split transfers", async () => {
    const { splitBuy, payer, holdings } = await loadFixture(deploySplitBuyFixture);
    const ReentrantFactory = await ethers.getContractFactory("ReentrantNativeReceiver");
    const reentrantReceiver = await ReentrantFactory.deploy(splitBuy.target);

    await splitBuy.setRecipients(reentrantReceiver.target, holdings.address);

    const holdingsBefore = await ethers.provider.getBalance(holdings.address);

    await expect(
      splitBuy.connect(payer).payNative(55, { value: 10n })
    ).to.emit(splitBuy, "PaymentReceived").withArgs(
      55n,
      payer.address,
      ethers.ZeroAddress,
      10n,
      2n,
      8n,
      reentrantReceiver.target,
      holdings.address
    );

    const holdingsAfter = await ethers.provider.getBalance(holdings.address);
    expect(holdingsAfter - holdingsBefore).to.equal(8n);
    expect(await reentrantReceiver.attempted()).to.equal(true);
    expect(await ethers.provider.getBalance(splitBuy.target)).to.equal(0);
  });
});
