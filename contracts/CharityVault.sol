// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CharityVault is Ownable, ReentrancyGuard {
    IERC20 public immutable petToken;

    modifier onlyToken() {
        require(msg.sender == address(petToken), "Unauthorized: not token");
        _;
    }

    event VaultFunded(uint256 amount);
    event StakingVaultUpdated(address vault);
    event CharityFundsMigrated(address indexed to, uint256 amount);
    event CharitySpent(address indexed recipient, uint256 amount, string memo);

    mapping(address => bool) public feeForwarders;

    constructor(address _petToken) Ownable(msg.sender) {
        require(_petToken != address(0), "Invalid token address");
        feeForwarders[_petToken] = true;
        petToken = IERC20(_petToken);
    }

    function fundVault(uint256 amount) external {
        require(petToken.transferFrom(msg.sender, address(this), amount), "Funding failed");
        emit VaultFunded(amount);
    }

    /**
     * Spend funds held in the vault for a charitable recipient.
     */
    function spend(address recipient, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");

        IERC20 token = IERC20(petToken);
        require(token.transfer(recipient, amount), "Transfer failed");

        emit CharitySpent(recipient, amount, memo);
    }

    /**
     * Used when upgrading to a new CharityVault.
     * Transfers all held tokens to the new contract.
     */
    function migrateTo(address newVault) external onlyToken {
        require(newVault != address(0), "Invalid vault address");

        uint256 balance = petToken.balanceOf(address(this));

        require(petToken.transfer(newVault, balance), "Migration transfer failed");
        emit CharityFundsMigrated(newVault, balance);
    }

    function isVault() external returns (bool) {
        return true;
    }
}
