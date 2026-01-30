// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStakingVault {
    function receiveFee(uint256 amount) external;
    function migrateTo(address newVault) external;
    function setCharityVault(address newCharityVault) external;
}

interface ICharityVault {
    function receiveFee(uint256 amount) external;
    function migrateTo(address newVault) external;
}

interface ITreasuryVault {
    function migrateTo(address newVault) external;
}

interface IVault {
    function isVault() external view returns (bool);
}

/// @title CNU
/// @notice ERC20 token with fee routing, vault migrations, and transfer limits.
contract CNU is ERC20, Ownable, Pausable, ReentrancyGuard {
    uint256 private constant FEE_DENOMINATOR = 10000; // 100% in basis points

    uint256 public charityFee = 100;    // 1%
    uint256 public burnFee = 50;        // 0.5%
    uint256 public rewardsFee = 200;    // 2%

    uint256 public maxWalletSize;
    uint256 public maxTxSize;

    address public treasuryVault;
    address public charityVault;
    address public stakingVault;

    address[] private stakingVaultHistory;
    mapping(address => bool) private isStakingVaultInHistory;

    address[] private charityVaultHistory;
    mapping(address => bool) private isCharityVaultInHistory;

    address[] private treasuryVaultHistory;
    mapping(address => bool) private isTreasuryVaultInHistory;

    uint256 public totalCharityDistributed;
    uint256 public totalRewardsDistributed;

    mapping(address => bool) public isExcludedFromFees;
    mapping(address => bool) public isExcludedFromLimits;

    event FeesTaken(address indexed from, uint256 charity, uint256 burn, uint256 rewards);
    event FeesUpdated(uint256 burnFee, uint256 charityFee, uint256 rewardsFee);
    event FeeExclusionUpdated(address indexed user, bool isExcluded);
    event LimitExclusionUpdated(address indexed user, bool isExcluded);
    event StakingVaultUpdated(address newVault);
    event StakingVaultHistoryAdded(address indexed vault);
    event CharityVaultHistoryAdded(address indexed vault);
    event TreasuryVaultHistoryAdded(address indexed vault);
    event TreasuryVaultUpdated(address newVault);
    event CharityVaultUpdated(address newVault);
    event TxLimitUpdated(uint256 txLimit);
    event WalletLimitUpdated(uint256 walletLimit);

    constructor(uint256 initialSupply) ERC20("Companion Network Unit", "CNU") Ownable(msg.sender) {
        // uint256 initialSupply = 1_000_000_000_000 * 10 ** decimals(); // 1 trillion
        _mint(msg.sender, initialSupply);
        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;
        isExcludedFromLimits[msg.sender] = true;
        isExcludedFromLimits[address(this)] = true;
    }

    /**
     * @notice Return the full history of staking vaults.
     */
    function getStakingVaultHistory() external view returns (address[] memory) {
        return stakingVaultHistory;
    }

    /**
     * @notice Return the full history of charity vaults.
     */
    function getCharityVaultHistory() external view returns (address[] memory) {
        return charityVaultHistory;
    }

    /**
     * @notice Return the full history of treasury vaults.
     */
    function getTreasuryVaultHistory() external view returns (address[] memory) {
        return treasuryVaultHistory;
    }

    function _recordStakingVault(address vault) internal {
        if (vault == address(0) || isStakingVaultInHistory[vault]) return;
        isStakingVaultInHistory[vault] = true;
        stakingVaultHistory.push(vault);
        emit StakingVaultHistoryAdded(vault);
    }

    function _recordCharityVault(address vault) internal {
        if (vault == address(0) || isCharityVaultInHistory[vault]) return;
        isCharityVaultInHistory[vault] = true;
        charityVaultHistory.push(vault);
        emit CharityVaultHistoryAdded(vault);
    }

    function _recordTreasuryVault(address vault) internal {
        if (vault == address(0) || isTreasuryVaultInHistory[vault]) return;
        isTreasuryVaultInHistory[vault] = true;
        treasuryVaultHistory.push(vault);
        emit TreasuryVaultHistoryAdded(vault);
    }

    /**
     * @notice Exempt or include an address in transfer fees.
     */
    function excludeFromFees(address account, bool excluded) external onlyOwner {
        isExcludedFromFees[account] = excluded;
        emit FeeExclusionUpdated(account, excluded);
    }

    /**
     * @notice Exempt or include an address in transfer limits.
     */
    function excludeFromLimits(address account, bool excluded) external onlyOwner {
        isExcludedFromLimits[account] = excluded;
        emit LimitExclusionUpdated(account, excluded);
    }

    /**
     * @notice Update fee basis points for burns, charity, and rewards.
     */
    function setFees(uint256 newBurnFee, uint256 newCharityFee, uint256 newRewardsFee) external onlyOwner {
        uint256 totalFeeBps = newBurnFee + newCharityFee + newRewardsFee;
        require(totalFeeBps <= 700, "Total fee exceeds limit");

        burnFee = newBurnFee;
        charityFee = newCharityFee;
        rewardsFee = newRewardsFee;

        emit FeesUpdated(burnFee, charityFee, rewardsFee);
    }

    /// @dev Best-effort interface check to prevent non-vault upgrades.
    function isVault(address _maybeVault) internal view returns (bool) {
        try IVault(_maybeVault).isVault() returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @notice Set the active charity vault and migrate from the previous vault.
     */
    function setCharityVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid charity vault address");
        require(_vault != charityVault, "Same charity vault address");
        require(_vault.code.length > 0, "Vault must be a contract");
        require(isVault(_vault), "Invalid vault interface");
        isExcludedFromFees[_vault] = true;
        isExcludedFromLimits[_vault] = true;
        address prevVault = charityVault;
        charityVault = _vault;
        _recordCharityVault(charityVault);
        if(address(prevVault) != address(0)){
            ICharityVault(prevVault).migrateTo(charityVault);
        }
        emit CharityVaultUpdated(charityVault);
    }

    /**
     * @notice Set the active treasury vault and migrate from the previous vault.
     */
    function setTreasuryVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid treasury vault address");
        require(_vault != treasuryVault, "Same treasury vault address");
        require(_vault.code.length > 0, "Vault must be a contract");
        require(isVault(_vault), "Invalid vault interface");
        isExcludedFromFees[_vault] = true;
        isExcludedFromLimits[_vault] = true;
        address prevVault = treasuryVault;
        treasuryVault = _vault;
        _recordTreasuryVault(treasuryVault);
        if(address(prevVault) != address(0)){
            ITreasuryVault(prevVault).migrateTo(treasuryVault);
        }
        emit TreasuryVaultUpdated(treasuryVault);
    }

    /**
     * @notice Set the active staking vault and migrate from the previous vault.
     */
    function setStakingVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid staking vault address");
        require(_vault != stakingVault, "Same staking vault address");
        require(_vault.code.length > 0, "Vault must be a contract");
        require(isVault(_vault), "Invalid vault interface");
        isExcludedFromFees[_vault] = true;
        isExcludedFromLimits[_vault] = true;
        address prevVault = stakingVault;
        stakingVault = _vault;
        _recordStakingVault(stakingVault);
        if(address(prevVault) != address(0)){
            IStakingVault(prevVault).migrateTo(stakingVault);
        }
        emit StakingVaultUpdated(stakingVault);
    }

    /**
     * @notice Configure the maximum wallet balance.
     * @dev Only enforces a minimum; owner must choose a reasonable cap.
     */
    function setWalletLimit(uint256 _maxWallet) external onlyOwner {
        require(_maxWallet > 50_000_000 * 10 ** decimals(), "Maximum wallet size too small");
        maxWalletSize = _maxWallet;
        emit WalletLimitUpdated(maxWalletSize);
    }

    /**
     * @notice Configure the maximum transaction amount.
     * @dev Only enforces a minimum; owner must choose a reasonable cap.
     */
    function setTxLimit(uint256 _maxTx) external onlyOwner {
        require(_maxTx > 10_000_000 * 10 ** decimals(), "Maximum transaction size too small");
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

    function _update(address from, address to, uint256 amount) internal override whenNotPaused nonReentrant {
        // ---- 1) Fee-exempt & mint/burn passthroughs ----
        if (_isFeeExempt(from, to)) {
            super._update(from, to, amount);
            return;
        }

        // ---- 2) Compute total fee first (captures rounding remainder) ----
        uint256 totalFeeBps = burnFee + charityFee + rewardsFee;
        uint256 feeAmount = (amount * totalFeeBps) / FEE_DENOMINATOR;

        uint256 burnAmount    = (amount * burnFee)    / FEE_DENOMINATOR;
        uint256 charityAmount = (amount * charityFee) / FEE_DENOMINATOR;
        // Assign any rounding remainder to rewards so totals always balance.
        uint256 rewardsAmount = feeAmount - burnAmount - charityAmount;

        uint256 transferAmount = amount - feeAmount;

        // ---- 3) Limits ----
        // Enforce max-tx on the user's original intent (full 'amount').
        if (!_isLimitExempt(from, to)) {
            require(amount <= maxTxSize, "Exceeds max transaction size");

            // Max-wallet should consider only actual incoming tokens
            // and should skip system sinks (zero address, vaults).
            bool checkMaxWallet = (
                to != address(0) &&
                to != charityVault &&
                to != stakingVault &&
                to != treasuryVault
            );
            if (checkMaxWallet) {
                require(balanceOf(to) + transferAmount <= maxWalletSize, "Exceeds max wallet size");
            }
        }

        // ---- 4) Apply fees (supply & accounting) ----
        // Burn reduces total supply
        if (burnAmount > 0) {
            // Equivalent: _burn(from, burnAmount);
            super._update(from, address(0), burnAmount);
        }

        // Route fee transfers directly FROM 'from' (do NOT mint from address(0))
        if (charityAmount > 0 && charityVault != address(0)) {
            super._update(from, charityVault, charityAmount);
            totalCharityDistributed += charityAmount;
        }
        if (rewardsAmount > 0 && stakingVault != address(0)) {
            super._update(from, stakingVault, rewardsAmount);
            totalRewardsDistributed += rewardsAmount;
        }

        // ---- 5) Net transfer ----
        if (transferAmount > 0) {
            super._update(from, to, transferAmount);
        }

        emit FeesTaken(from, charityAmount, burnAmount, rewardsAmount);
    }
    

    /**
     * @notice Pause all token transfers.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause token transfers.
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
