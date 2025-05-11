task("add-liquidity", "Adds liquidity to the PETAI/WETH pool")
  .addParam("amountPetai", "Amount of PETAI to add", "10000000000000000000000000000", types.string) // 10,000,000,000 PETAI
  .addParam("amountWeth", "Amount of WETH to add",              "1000000000000000000", types.string) // 1 WETH
  .addOptionalParam("weth", "WETH token address", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
  .setAction(async ({ amountPetai, amountWeth, weth }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];

    const IUniswapV2Router02ABI = [
      "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
      "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
      "function WETH() external pure returns (address)"
    ];

    const [signer] = await ethers.getSigners();
    const router = await ethers.getContractAt(IUniswapV2Router02ABI, deployed.UniswapV2Router02);
    const token = await ethers.getContractAt("PetCoinAI", deployed.token);
    const wethToken = await ethers.getContractAt("IERC20", weth);

    await token.approve(router.target, amountPetai);
    await wethToken.approve(router.target, amountWeth);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const tx = await router.addLiquidity(
      token.target,
      weth,
      amountPetai,
      amountWeth,
      0,
      0,
      signer.address,
      deadline
    );

    const receipt = await tx.wait();
    console.log("Liquidity added. Tx hash:", receipt.transactionHash);
  });