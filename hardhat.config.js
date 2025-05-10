require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

// Tasks

require("./tasks/deploy-core")
require("./tasks/create-pair")
require("./tasks/deploy-feed")
require("./tasks/add-liquidity")
require("./tasks/update-feed")
require("./tasks/status")
require("./tasks/balance")

console.info("Hardhat config loaded")

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      accounts: {
        count: 20, // 👈 More accounts!
        balance: "1000000000000000000000" // 1000 ETH
      }
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_WALLET_KEY] // , process.env.PRIVATE_WALLET_KEY2],
    },
  },
};
