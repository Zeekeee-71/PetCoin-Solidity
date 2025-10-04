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
}

interface ICharityVault {
    function receiveFee(uint256 amount) external;
    function migrateTo(address newVault) external;
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
    mapping(address => bool) public isExcludedFromLimits;

    event FeesTaken(address indexed from, uint256 charity, uint256 burn, uint256 rewards);
    event FeeExclusionUpdated(address indexed user, bool isExcluded);
    event LimitExclusionUpdated(address indexed user, bool isExcluded);
    event StakingVaultUpdated(address newVault);
    event CharityVaultUpdated(address newVault);
    event TxLimitUpdated(uint256 txLimit);
    event WalletLimitUpdated(uint256 walletLimit);

    constructor(uint256 initialSupply) ERC20("Pet Coin AI", "PETAI") Ownable(msg.sender) {
        // uint256 initialSupply = 1_000_000_000_000 * 10 ** decimals(); // 1 trillion
        _mint(msg.sender, initialSupply);
        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;
        isExcludedFromLimits[msg.sender] = true;
        isExcludedFromLimits[address(this)] = true;
    }

    function excludeFromFees(address account, bool excluded) external onlyOwner {
        isExcludedFromFees[account] = excluded;
        emit FeeExclusionUpdated(account, excluded);
    }

    function excludeFromLimits(address account, bool excluded) external onlyOwner {
        isExcludedFromLimits[account] = excluded;
        emit LimitExclusionUpdated(account, excluded);
    }

    function isVault(address _maybeVault) internal returns (bool) {
        bytes memory data = abi.encodeWithSignature("isVault()");
        (bool success, bytes memory returnData) = _maybeVault.call(data);
        return success;
    }

    function setCharityVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid charity vault address");
        require(_vault != charityVault, "Same charity vault address");
        require(_vault.code.length > 0, "Vault must be a contract");
        require(isVault(_vault), "Invalid vault interface");
        isExcludedFromFees[_vault] = true;
        isExcludedFromLimits[_vault] = true;
        address prevVault = charityVault;
        charityVault = _vault;
        if(address(prevVault) != address(0)){
            ICharityVault(prevVault).migrateTo(charityVault);
        }
        emit CharityVaultUpdated(charityVault);
    }

    function setStakingVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid staking vault address");
        require(_vault != stakingVault, "Same staking vault address");
        require(_vault.code.length > 0, "Vault must be a contract");
        require(isVault(_vault), "Invalid vault interface");
        isExcludedFromFees[_vault] = true;
        isExcludedFromLimits[_vault] = true;
        address prevVault = stakingVault;
        stakingVault = _vault;
        if(address(prevVault) != address(0)){
            IStakingVault(prevVault).migrateTo(stakingVault);
        }
        emit StakingVaultUpdated(stakingVault);
    }

    function setWalletLimit(uint256 _maxWallet) external onlyOwner {
        require(_maxWallet > 1_000_000 * 10 ** decimals(), "Maximum wallet size too small");
        require(_maxWallet < 50_000_000_000 * 10 ** decimals(), "Maximum wallet size too large");
        maxWalletSize = _maxWallet;
        emit WalletLimitUpdated(maxWalletSize);
    }

    function setTxLimit(uint256 _maxTx) external onlyOwner {
        require(_maxTx > 1_000_000 * 10 ** decimals(), "Maximum transaction size too small");
        require(_maxTx < 10_000_000_000 * 10 ** decimals(), "Maximum transaction size too large");
        maxTxSize = _maxTx;
        emit TxLimitUpdated(maxTxSize);
    }

    function _isFeeExempt(address from, address to) internal view returns (bool) {
        return 
            isExcludedFromFees[from] 
            || isExcludedFromFees[to]
            || from == address(0) 
            || to == address(0);
    }

    function _isLimitExempt(address from, address to) internal view returns (bool) {
        return isExcludedFromLimits[from] 
            || isExcludedFromLimits[to];
    }

    function _update(address from, address to, uint256 amount) internal override whenNotPaused {

        if (_isFeeExempt(from, to)) {
            super._update(from, to, amount);
            return;
        }

        if(!_isLimitExempt(from, to)){
            require(amount <= maxTxSize, "Exceeds max transaction size");
            if (to != address(0)) {
                require(balanceOf(to) + amount <= maxWalletSize, "Exceeds max wallet size");
            }
        }

        // Calculate each slice
        uint256 burnAmount = (amount * BURN_FEE) / FEE_DENOMINATOR;
        uint256 charityAmount = (amount * CHARITY_FEE) / FEE_DENOMINATOR;
        uint256 rewardsAmount = (amount * REWARDS_FEE) / FEE_DENOMINATOR;

        // Now derive feeAmount exactly
        uint256 feeAmount = burnAmount + charityAmount + rewardsAmount;
        uint256 transferAmount = amount - feeAmount;
        
        // First deduct full amount from sender
        super._update(from, address(0), burnAmount); // Burn by sending to zero address
        super._update(from, to, transferAmount);
        super._update(from, charityVault, charityAmount);
        super._update(from, stakingVault, rewardsAmount);
        
        totalCharityDistributed += charityAmount;
        totalRewardsDistributed += rewardsAmount;

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
