// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "hardhat/console.sol";

interface IStakingVault {
    function receiveFee(uint256 amount) external;
    function migrateTo(address newVault) external;
    function setCharityVault(address newCharityVault) external;
    function setFeeForwarder(address forwarder) external;
}

interface ICharityVault {
    function receiveFee(uint256 amount) external;
    function migrateTo(address newVault) external;
    // function authorizeStakingVault(address newStakingVault) external;
    function setFeeForwarder(address forwarder) external;
}

contract PetCoinAI is ERC20, Ownable, Pausable {
    uint256 private constant FEE_DENOMINATOR = 10000;

    uint256 public constant CHARITY_FEE = 100;    // 1%
    uint256 public constant BURN_FEE = 50;       // 0.5%
    uint256 public constant REWARDS_FEE = 200;    // 2%

    uint256 public maxWalletSize;
    uint256 public maxTxSize;

    address public charityVault;
    address public stakingVault;

    uint256 public totalCharityDistributed;
    uint256 public totalRewardsDistributed;

    mapping(address => bool) public isExcludedFromFees;

    event FeesTaken(address indexed from, uint256 charity, uint256 burn, uint256 rewards);
    event ExclusionUpdated(address indexed user, bool isExcluded);
    event StakingVaultUpdated(address newVault);
    event CharityVaultUpdated(address newVault);

    constructor(uint256 initialSupply) ERC20("Pet Coin AI", "PETAI") Ownable(msg.sender) {
        // uint256 initialSupply = 1_000_000_000_000 * 10 ** decimals(); // 1 trillion
        _mint(msg.sender, initialSupply);
        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;

    }

    function excludeFromFees(address account, bool excluded) external onlyOwner {
        isExcludedFromFees[account] = excluded;
        emit ExclusionUpdated(account, excluded);
    }

    function setCharityVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid charity vault address");
        if(charityVault != address(0) && charityVault != _vault){
            ICharityVault(charityVault).migrateTo(_vault);
        }
        if(charityVault != _vault){
            charityVault = _vault;
            isExcludedFromFees[_vault] = true;
            emit CharityVaultUpdated(charityVault);
        }
    }

    function setStakingVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid staking vault address");
        if(stakingVault != address(0) && stakingVault != _vault){
            IStakingVault(stakingVault).migrateTo(_vault);
        }
        if(stakingVault != _vault){
            stakingVault = _vault;
            isExcludedFromFees[_vault] = true;
            emit StakingVaultUpdated(stakingVault);
        }
    }

    function setWalletLimit(uint256 _maxWallet) external onlyOwner {
        require(_maxWallet > 1_000_000 * 10 ** decimals(), "Maximum wallet size too small");
        require(_maxWallet < 50_000_000_000 * 10 ** decimals(), "Maximum wallet size too large");
        maxWalletSize = _maxWallet;
    }

    function setTxLimit(uint256 _maxTx) external onlyOwner {
        require(_maxTx > 1_000_000 * 10 ** decimals(), "Maximum transaction size too small");
        require(_maxTx < 10_000_000_000 * 10 ** decimals(), "Maximum transaction size too large");
        maxTxSize = _maxTx;
    }

    function _isFeeExempt(address from, address to) internal view returns (bool) {
        return isExcludedFromFees[from] ||
            isExcludedFromFees[to] ||
            from == address(0) ||
            to == address(0);
    }

    function _update(address from, address to, uint256 amount) internal override whenNotPaused {

        if (_isFeeExempt(from, to)) {
            super._update(from, to, amount);
            return;
        }

        require(amount <= maxTxSize, "Exceeds max transaction size");
        if (to != address(0)) {
            require(balanceOf(to) + amount <= maxWalletSize, "Exceeds max wallet size");
        }

        // Calculate each slice
        uint256 burnAmount = (amount * BURN_FEE) / FEE_DENOMINATOR;
        uint256 charityAmount = (amount * CHARITY_FEE) / FEE_DENOMINATOR;
        uint256 rewardsAmount = (amount * REWARDS_FEE) / FEE_DENOMINATOR;

        // Now derive feeAmount exactly
        uint256 feeAmount = burnAmount + charityAmount + rewardsAmount;
        uint256 transferAmount = amount - feeAmount;

        // Perform net transfer to recipient
        super._update(from, to, transferAmount);

        // Burn
        if (burnAmount > 0) {
            _burn(from, burnAmount);
        }

        // Transfer charity and rewards directly
        if (charityAmount > 0) {
            super._update(from, charityVault, charityAmount);
            // Deprecated: remove for mainnet
            // ICharityVault(charityVault).receiveFee(charityAmount);
            totalCharityDistributed += charityAmount;
        }

        if (rewardsAmount > 0) {
            super._update(from, stakingVault, rewardsAmount);
            // Deprecated: remove for mainnet
            // IStakingVault(stakingVault).receiveFee(rewardsAmount);
            totalRewardsDistributed += rewardsAmount;
        }

        emit FeesTaken(from, charityAmount, burnAmount, rewardsAmount);
    }
    

    // Emergency pause/unpause
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
