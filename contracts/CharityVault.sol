// SPDX-License-Identifier: Apache-2.0
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
     * @dev Requires an allowance from msg.sender.
     */
    function fundVault(uint256 amount) external {
        require(cnuToken.transferFrom(msg.sender, address(this), amount), "Funding failed");
        emit VaultFunded(amount);
    }

    /**
     * @notice Spend funds held in the vault for a charitable recipient.
     * @dev Relies on the token to enforce balance and recipient validity.
     */
    function spend(address recipient, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be > 0");
        IERC20 token = IERC20(cnuToken);
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
