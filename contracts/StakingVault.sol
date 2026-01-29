// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ICNUVaults.sol";
import "./VaultBase.sol";

/// @title StakingVault
/// @notice Locks CNU for fixed tiers and tracks rewards/penalties.
contract StakingVault is VaultBase {

    modifier notFinalized() {
        require(!isFinalized, "Vault is finalized");
        _;
    }

    modifier notPaused() {
        require(!stakingPaused, "Staking is paused");
        _;
    }

    enum Tier { NONE, THIRTY, NINETY, ONE_EIGHTY, THREE_SIXTY_FIVE }

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 lockDuration;
        uint256 rewardRate; // basis points, 100 = 1%
        bool claimed;
    }

    mapping(address => Stake[]) public userStakes;
    mapping(address => bool) public isStaker;
    mapping(address => uint256) public activeStakeCount;
    mapping(address => uint256) public userTotalStaked;
    mapping(address => uint256) public userTotalRewards;
    mapping(address => uint256) public userTotalOwed;
    mapping(address => uint256) private stakerIndex;
    address[] public stakerList;

    uint256 public totalStaked;
    uint256 public totalLiabilities;
    bool public stakingPaused = false;
    uint256 public earlyWithdrawPenalty = 1000; // 10% penalty
    bool public isFinalized = false;
    
    event Staked(address indexed user, uint256 stakeId, uint256 amount, uint256 duration, uint256 rewardRate);
    event Claimed(address indexed user, uint256 stakeId, uint256 reward);
    event EarlyWithdrawn(address indexed user, uint256 stakeId, uint256 penaltyAmount);
    event StakingPaused(bool paused);
    event PenaltyUpdated(uint256 newPenalty);
    event StakingFundsMigrated(address indexed to, uint256 amount);



    constructor(address _cnuToken) VaultBase(_cnuToken) {
        require(_cnuToken != address(0), "Invalid token");
    }

    /**
     * @notice Stake CNU into a tiered lockup with fixed reward rate.
     */
    function stake(uint256 amount, Tier tier) external nonReentrant notPaused notFinalized {
        (uint256 duration, uint256 rate) = getTierParams(tier);
        require(duration > 0, "Invalid tier");
        require(amount > 0, "Amount must be > 0");
        require(rate > 0, "Invalid tier");
        require(amount <= type(uint256).max / rate, "Stake amount too large");

        uint256 reward = (amount * rate) / 10000;
        uint256 balance = cnuToken.balanceOf(address(this));
        require(balance >= totalStaked + totalLiabilities + reward, "Insufficient reward reserves");
        totalLiabilities += reward;

        if (!isStaker[msg.sender]) {
            isStaker[msg.sender] = true;
            stakerIndex[msg.sender] = stakerList.length;
            stakerList.push(msg.sender);
        }

        activeStakeCount[msg.sender] += 1;
        userTotalStaked[msg.sender] += amount;
        userTotalRewards[msg.sender] += reward;
        userTotalOwed[msg.sender] += amount + reward;

        userStakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            lockDuration: duration,
            rewardRate: rate,
            claimed: false
        }));

        totalStaked += amount;

        require(cnuToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        uint256 stakeId = userStakes[msg.sender].length - 1;
        emit Staked(msg.sender, stakeId, amount, duration, rate);
    }

    /**
     * @notice Claim a matured stake and its reward.
     */
    function claim(uint256 stakeId) external nonReentrant {
        Stake storage s = getUserStake(msg.sender, stakeId);
        require(!s.claimed, "Already claimed");
        require(block.timestamp >= s.startTime + s.lockDuration, "Still locked");

        uint256 reward = s.amount * s.rewardRate / 10000;
        uint256 payout = s.amount + reward;

        s.claimed = true;
        totalStaked -= s.amount;
        if (reward > 0) totalLiabilities -= reward;
        activeStakeCount[msg.sender] -= 1;
        userTotalStaked[msg.sender] -= s.amount;
        userTotalRewards[msg.sender] -= reward;
        userTotalOwed[msg.sender] -= payout;
        cleanupStaker(msg.sender);

        require(cnuToken.transfer(msg.sender, payout), "Payout failed");

        emit Claimed(msg.sender, stakeId, reward);
    }

    /**
     * @notice Withdraw before maturity and pay the configured penalty.
     */
    function earlyWithdraw(uint256 stakeId) external nonReentrant {
        Stake storage s = getUserStake(msg.sender, stakeId);
        require(!s.claimed, "Already claimed");
        require(block.timestamp < s.startTime + s.lockDuration, "Already unlocked");

        address charityVault = getCharityVault();

        uint256 reward = s.amount * s.rewardRate / 10000;
        uint256 penalty = s.amount * earlyWithdrawPenalty / 10000;
        uint256 refund = s.amount - penalty;

        bool finalized = isFinalized;
        uint256 toCharity = penalty;
        if (finalized) {
            toCharity += reward;
        }

        s.claimed = true;
        totalStaked -= s.amount;
        if (reward > 0) totalLiabilities -= reward;
        activeStakeCount[msg.sender] -= 1;
        userTotalStaked[msg.sender] -= s.amount;
        userTotalRewards[msg.sender] -= reward;
        userTotalOwed[msg.sender] -= (s.amount + reward);
        cleanupStaker(msg.sender);

        require(cnuToken.transfer(msg.sender, refund), "Refund failed");
        require(cnuToken.transfer(charityVault, toCharity), "Penalty transfer failed");

        emit EarlyWithdrawn(msg.sender, stakeId, toCharity);
    }

    /**
     * @notice Return earned rewards for a stake if fully matured.
     */
    function earned(address user, uint256 stakeId) external view returns (uint256) {
        Stake memory s = getUserStake(user, stakeId);
        if (s.claimed || block.timestamp < s.startTime + s.lockDuration) return 0;
        return s.amount * s.rewardRate / 10000;
    }

    /**
     * @notice Return the number of stakes for a user.
     */
    function getStakeCount(address user) external view returns (uint256) {
        return userStakes[user].length;
    }

    /**
     * @notice Return a single stake for a user.
     */
    function getStake(address user, uint256 stakeId) external view returns (Stake memory) {
        return getUserStake(user, stakeId);
    }

    /**
     * @notice Return all stakes for a user.
     */
    function getUserStakes(address user) external view returns (Stake[] memory) {
        return userStakes[user];
    }

    function getUserStake(address user, uint256 stakeId) internal view returns (Stake storage) {
        require(stakeId < userStakes[user].length, "Invalid stake ID");
        return userStakes[user][stakeId];
    }

    /**
     * @notice Return total staked, total rewards expected from those stakes, and the currently claimable amount.
     */
    function getUserSummary(address user) external view returns (
        uint256 totalStakedAmount,
        uint256 totalRewardsExpected,
        uint256 claimableNow
    ) {
        totalStakedAmount = userTotalStaked[user];
        totalRewardsExpected = userTotalRewards[user];
        Stake[] storage stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (!s.claimed) {
                if (block.timestamp >= s.startTime + s.lockDuration) {
                    uint256 reward = s.amount * s.rewardRate / 10000;
                    claimableNow += s.amount + reward;
                }
            }
        }
    }

    /**
     * @notice Return lock duration and reward rate for a tier.
     */
    function getTierParams(Tier tier) public pure returns (uint256 duration, uint256 rate) {
        if (tier == Tier.THIRTY) return (30 days, 100);         // 1%
        if (tier == Tier.NINETY) return (90 days, 300);         // 3%
        if (tier == Tier.ONE_EIGHTY) return (180 days, 700);   // 7%
        if (tier == Tier.THREE_SIXTY_FIVE) return (365 days, 1500); // 15%
        return (0, 0); // NONE
    }

    /**
     * @notice Return vault-level stats for UI and monitoring.
     */
    function getVaultStats() external view returns (
        uint256 _totalStaked,
        uint256 _earlyWithdrawPenalty,
        address _charityVault,
        bool _stakingPaused
    ) {
        return (totalStaked, earlyWithdrawPenalty, address(getCharityVault()), stakingPaused);
    }

    /**
     * @notice Return total owed (principal + rewards) for a user.
     */
    function getUserOwed(address user) external view returns (uint256 total) {
        return userTotalOwed[user];
    }

    /**
     * @notice Return claimable amount for a range of stake entries.
     */
    function getUserClaimableNow(address user, uint256 offset, uint256 limit) external view returns (uint256 claimable, uint256 nextOffset) {
        require(limit > 0, "Limit must be > 0");
        require(limit <= 200, "Limit too high");

        Stake[] storage stakes = userStakes[user];
        uint256 length = stakes.length;
        if (offset >= length) return (0, length);

        uint256 end = offset + limit;
        if (end > length) end = length;

        for (uint256 i = offset; i < end; i++) {
            Stake storage s = stakes[i];
            if (!s.claimed && block.timestamp >= s.startTime + s.lockDuration) {
                uint256 reward = s.amount * s.rewardRate / 10000;
                claimable += s.amount + reward;
            }
        }
        return (claimable, end);
    }

    /**
     * @notice Return claimable amount across all stakes.
     */
    function getUserClaimableNowAll(address user) external view returns (uint256 claimable) {
        Stake[] storage stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (!s.claimed && block.timestamp >= s.startTime + s.lockDuration) {
                uint256 reward = s.amount * s.rewardRate / 10000;
                claimable += s.amount + reward;
            }
        }
    }

    /**
     * @notice Return the current staker list.
     */
    function getAllStakers() external view returns (address[] memory) {
        return stakerList;
    }

    /**
     * @notice Return a slice of stakers for pagination.
     */
    function getStakers(uint256 offset, uint256 limit) external view returns (address[] memory) {
        require(limit > 0, "Limit must be > 0");
        require(limit <= 200, "Limit too high");

        uint256 length = stakerList.length;
        if (offset >= length) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = stakerList[i];
        }
        return result;
    }

    /**
     * @notice Pause or unpause new staking.
     */
    function pauseStaking(bool _pause) external onlyOwner {
        stakingPaused = _pause;
        emit StakingPaused(_pause);
    }


    /**
     * @notice Update the early withdrawal penalty (basis points).
     */
    function setEarlyWithdrawPenalty(uint256 newPenalty) external onlyOwner {
        require(newPenalty <= 2500, "Penalty too high");
        earlyWithdrawPenalty = newPenalty;
        emit PenaltyUpdated(newPenalty);
    }

    /**
     * @notice Return the total outstanding reward liabilities.
     */
    function getTotalLiabilities() public view returns (uint256 liabilities) {
        return totalLiabilities;
    }

    /**
     * @notice Return the reserve required to cover all stakes and rewards.
     */
    function getVaultObligations() public view returns (uint256 requiredReserve) {
        requiredReserve = totalStaked + getTotalLiabilities();
    }

    /**
     * @notice Migrate excess funds to a new vault, preserving obligations.
     */
    function migrateTo(address newVault) external onlyToken notFinalized nonReentrant {
        require(newVault != address(0), "Invalid vault address");

        isFinalized = true;

        IERC20 token = cnuToken;
        uint256 reserve = getVaultObligations();
        uint256 balance = token.balanceOf(address(this));
        uint256 transferable = balance > reserve ? balance - reserve : 0;

        if (transferable > 0){
            require(token.transfer(newVault, transferable), "Migration transfer failed");
        }
        emit StakingFundsMigrated(newVault, transferable);
    }

    function getCharityVault() internal view returns (address) {
        return ICNUVaults(address(cnuToken)).charityVault();
    }

    function cleanupStaker(address user) internal {
        if (activeStakeCount[user] != 0) return;
        if (!isStaker[user]) return;

        uint256 listLength = stakerList.length;
        if (listLength == 0) {
            isStaker[user] = false;
            delete stakerIndex[user];
            return;
        }

        uint256 index = stakerIndex[user];
        if (index >= listLength || stakerList[index] != user) return;

        uint256 lastIndex = listLength - 1;

        if (index != lastIndex) {
            address lastUser = stakerList[lastIndex];
            stakerList[index] = lastUser;
            stakerIndex[lastUser] = index;
        }

        stakerList.pop();
        delete stakerIndex[user];
        isStaker[user] = false;
    }

}
