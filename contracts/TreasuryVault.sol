// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VaultBase.sol";

contract TreasuryVault is VaultBase {

    event TreasuryFunded(address indexed from, uint256 amount);
    event ClaimPaid(address indexed recipient, uint256 amount, string memo);
    event TreasuryWithdrawn(address indexed to, uint256 amount, string memo);
    event TreasuryMigrated(address indexed to, uint256 amount);

    constructor(address _cnuToken) VaultBase(_cnuToken) {
        require(_cnuToken != address(0), "Invalid token address");
    }

    /**
     * @notice Move funds into the treasury from an approved account.
     */
    function fund(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(cnuToken.transferFrom(msg.sender, address(this), amount), "Funding failed");
        emit TreasuryFunded(msg.sender, amount);
    }

    /**
     * @notice Pay out an approved claim from the treasury.
     */
    function payClaim(address recipient, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        require(cnuToken.transfer(recipient, amount), "Claim transfer failed");
        emit ClaimPaid(recipient, amount, memo);
    }

    /**
     * @notice Withdraw treasury funds for operations or migrations.
     */
    function withdraw(address to, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        require(cnuToken.transfer(to, amount), "Withdraw transfer failed");
        emit TreasuryWithdrawn(to, amount, memo);
    }

    /**
     * @dev Called by the token during vault upgrades.
     */
    function migrateTo(address newVault) external onlyToken {
        uint256 balance = _migrateAll(newVault);
        emit TreasuryMigrated(newVault, balance);
    }
}
