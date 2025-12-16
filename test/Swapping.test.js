const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEcosystem, tokenPair } = require("./utils/deploy");


describe("Uniswap Router", function () {
  let owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed, router, factory, weth, pair;

  beforeEach(async () => {

    const ecosystem = await loadFixture(deployEcosystem);
    ({ owner, user1, user2, user3, rest, token, charityVault, stakingVault, gate, feed, router, factory, weth, pair, tokenA, tokenB} = ecosystem);

    await weth.deposit({ value: ethers.parseEther("10") });

    const one = ethers.parseUnits("1", 18);
    const bil = ethers.parseUnits("100000000000", 18);

    const tokenA_val = tokenA == weth.target ? one : bil;
    const tokenB_val = tokenB == token.target ?  bil : one;

    // Recompute the expected pair address manually using the real init code hash
    /*
    const { keccak256, getAddress, solidityPacked } = ethers;

    const pairInitCodeHash = keccak256((await ethers.getContractFactory("UniswapV2Pair")).bytecode);
    console.log("Pair bytecode hash (actual):", pairInitCodeHash);

    const salt = keccak256(solidityPacked(["address", "address"], [tokenA, tokenB]));
    const computedPairAddr = getAddress(
      "0x" + keccak256(
        solidityPacked(
          ["bytes1", "address", "bytes32", "bytes32"],
          ["0xff", factory.target, salt, pairInitCodeHash]
        )
      ).slice(-40)
    );
    */

    await token.approve(router.target, ethers.MaxUint256);
    await weth.approve(router.target, ethers.MaxUint256);


    await router.addLiquidity(
      tokenA,
      tokenB,
      tokenA_val,
      tokenB_val,
      0,
      0,
      owner,
      Math.floor(Date.now() / 1000) + 60 * 20
    );

  });

  it("has liquidity", async () => {
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.be.gt(0);
    expect(reserves[1]).to.be.gt(0);
  });

  it("swaps tokens in", async () => {
    const amountIn = ethers.parseUnits("0.00001", 18);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    await weth.connect(user1).deposit({ value: ethers.parseEther("10") });

    const oldTokBal = await token.balanceOf(user1);
    const oldEthBal = await weth.balanceOf(user1);

    console.log("Old CNU balance:", ethers.formatUnits(oldTokBal, 18));
    console.log("Old WETH balance:", ethers.formatUnits(oldEthBal, 18));

    await weth.connect(user1).approve(router.target, amountIn);
    const tx = await router.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [weth, token],
      user1,
      deadline
    );

    const receipt = await tx.wait();
    console.log("Swap complete. Tx hash:", receipt.transactionHash);

    const newBal = await token.balanceOf(user1);
    console.log(`New balance: ${ethers.formatUnits(newBal, 18)} tokens`);
  });


  
  it("swaps tokens out", async () => {
    const amountIn = ethers.parseUnits("100000", 18);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    await token.transfer(user1, amountIn);

    const oldTokBal = await token.balanceOf(user1);
    const oldEthBal = await weth.balanceOf(user1);

    console.log("Old CNU balance:", ethers.formatUnits(oldTokBal, 18));
    console.log("Old WETH balance:", ethers.formatUnits(oldEthBal, 18));

    await token.connect(user1).approve(router.target, amountIn * 2n);
    //await token.excludeFromFees(user1, true);
    //await token.excludeFromFees(router, true);
    //await token.excludeFromFees(pair, true);

    const tx = await router.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [token, weth],
      user1,
      deadline
    );

    const receipt = await tx.wait();
    console.log("Swap complete. Tx hash:", receipt.transactionHash);

    const newBal = await token.balanceOf(user1);
    console.log(`New balance: ${ethers.formatUnits(newBal, 18)} tokens`);
  });


});

