// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VaultBase.sol";

/// @title CharityVault
/// @notice Stores and disburses charity allocations from CNU fees.
contract CharityVault is VaultBase {

    event VaultFunded(uint256 amount);
    event StakingVaultUpdated(address vault);
    event CharityFundsMigrated(address indexed to, uint256 amount);
    event CharitySpent(address indexed recipient, uint256 amount, string memo);

    constructor(address _cnuToken) VaultBase(_cnuToken) {
        require(_cnuToken != address(0), "Invalid token address");
    }

    /**
     * @notice Fund the vault directly from an approved account.
     */
    function fundVault(uint256 amount) external {
        require(cnuToken.transferFrom(msg.sender, address(this), amount), "Funding failed");
        emit VaultFunded(amount);
    }

    /**
     * Spend funds held in the vault for a charitable recipient.
     */
    function spend(address recipient, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        IERC20 token = IERC20(cnuToken);
        uint256 balance = token.balanceOf(address(this));
        require(amount <= balance, "Insufficient balance");
        require(token.transfer(recipient, amount), "Transfer failed");

        emit CharitySpent(recipient, amount, memo);
    }

    /**
     * Used when upgrading to a new CharityVault.
     * Transfers all held tokens to the new contract.
     */
    function migrateTo(address newVault) external onlyToken {
        uint256 balance = _migrateAll(newVault);
        emit CharityFundsMigrated(newVault, balance);
    }
}
