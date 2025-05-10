// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPetToken {
    function charityVault() external view returns (address);
}

interface ICharityVault {
    function receiveFee(uint256 amount) external;
}

contract StakingVault is Ownable, ReentrancyGuard {
    IERC20 public immutable petToken;

    modifier onlyToken() {
        require(msg.sender == address(petToken), "Unauthorized: not token");
        _;
    }

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
    address[] public stakerList;

    uint256 public totalStaked;
    uint256 public totalFunded;
    bool public stakingPaused = false;
    uint256 public earlyWithdrawPenalty = 1000; // 10% penalty
    bool public isFinalized = false;
    
    event Staked(address indexed user, uint256 stakeId, uint256 amount, uint256 duration, uint256 rewardRate);
    event Claimed(address indexed user, uint256 stakeId, uint256 reward);
    event EarlyWithdrawn(address indexed user, uint256 stakeId, uint256 penaltyAmount);
    event VaultFunded(uint256 amount);
    event StakingPaused(bool paused);
    event PenaltyUpdated(uint256 newPenalty);
    event StakingFundsMigrated(address indexed to, uint256 amount);
    event VaultFinalized(uint256 stakersRemaining, uint256 reserve);



    constructor(address _petToken) Ownable(msg.sender) {
        require(_petToken != address(0), "Invalid token");
        petToken = IERC20(_petToken);
    }

    function stake(uint256 amount, Tier tier) external notPaused notFinalized nonReentrant {
        (uint256 duration, uint256 rate) = getTierParams(tier);
        require(duration > 0, "Invalid tier");
        require(amount > 0, "Amount must be > 0");

        require(petToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        if (!isStaker[msg.sender]) {
            isStaker[msg.sender] = true;
            stakerList.push(msg.sender);
        }

        userStakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            lockDuration: duration,
            rewardRate: rate,
            claimed: false
        }));

        totalStaked += amount;

        uint256 stakeId = userStakes[msg.sender].length - 1;
        emit Staked(msg.sender, stakeId, amount, duration, rate);
    }

    function claim(uint256 stakeId) external nonReentrant {
        Stake storage s = getUserStake(msg.sender, stakeId);
        require(!s.claimed, "Already claimed");
        require(block.timestamp >= s.startTime + s.lockDuration, "Still locked");

        uint256 reward = s.amount * s.rewardRate / 10000;
        uint256 payout = s.amount + reward;

        require(totalFunded >= reward, "Vault underfunded");

        s.claimed = true;
        totalStaked -= s.amount;
        totalFunded -= reward;

        require(petToken.transfer(msg.sender, payout), "Payout failed");
        
        cleanupStaker(msg.sender);

        emit Claimed(msg.sender, stakeId, reward);
    }

    function earlyWithdraw(uint256 stakeId) external nonReentrant {
        Stake storage s = getUserStake(msg.sender, stakeId);
        require(!s.claimed, "Already claimed");
        require(block.timestamp < s.startTime + s.lockDuration, "Already unlocked");

        uint256 reward = s.amount * s.rewardRate / 10000;
        uint256 penalty = s.amount * earlyWithdrawPenalty / 10000;
        uint256 refund = s.amount - penalty;

        s.claimed = true;
        totalStaked -= s.amount;

        uint256 toCharity = penalty;
        ICharityVault cVault = getCharityVault();
        if (isFinalized) {
            require(totalFunded >= reward, "Insufficient reserved funds");
            totalFunded -= reward;
            toCharity += reward;
        }

        require(petToken.transfer(msg.sender, refund), "Refund failed");
        require(petToken.transfer(address(cVault), toCharity), "Penalty transfer failed");
        cVault.receiveFee(penalty);

        cleanupStaker(msg.sender);

        emit EarlyWithdrawn(msg.sender, stakeId, toCharity);
    }

    function earned(address user, uint256 stakeId) external view returns (uint256) {
        Stake memory s = getUserStake(user, stakeId);
        if (s.claimed || block.timestamp < s.startTime + s.lockDuration) return 0;
        return s.amount * s.rewardRate / 10000;
    }

    function getStakeCount(address user) external view returns (uint256) {
        return userStakes[user].length;
    }

    function getStake(address user, uint256 stakeId) external view returns (Stake memory) {
        return getUserStake(user, stakeId);
    }

    function getUserStakes(address user) external view returns (Stake[] memory) {
        return userStakes[user];
    }

    function getUserStake(address user, uint256 stakeId) internal view returns (Stake storage) {
        require(stakeId < userStakes[user].length, "Invalid stake ID");
        return userStakes[user][stakeId];
    }

    function getUserSummary(address user) external view returns (
        uint256 totalStakedAmount,
        uint256 totalRewardsEarned,
        uint256 claimableNow
    ) {
        Stake[] storage stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (!s.claimed) {
                uint256 reward = s.amount * s.rewardRate / 10000;
                totalStakedAmount += s.amount;
                totalRewardsEarned += reward;

                if (block.timestamp >= s.startTime + s.lockDuration) {
                    claimableNow += s.amount + reward;
                }
            }
        }
    }

    function getTierParams(Tier tier) public pure returns (uint256 duration, uint256 rate) {
        if (tier == Tier.THIRTY) return (30 days, 200);         // 2%
        if (tier == Tier.NINETY) return (90 days, 500);         // 5%
        if (tier == Tier.ONE_EIGHTY) return (180 days, 1000);   // 10%
        if (tier == Tier.THREE_SIXTY_FIVE) return (365 days, 1500); // 15%
        return (0, 0); // NONE
    }

    function fundVault(uint256 amount) external {
        require(petToken.transferFrom(msg.sender, address(this), amount), "Funding failed");
        totalFunded += amount;
        emit VaultFunded(amount);
    }

    function receiveFee(uint256 amount) external {
        require(msg.sender == address(petToken), "Only token contract can fund");
        totalFunded += amount;
        emit VaultFunded(amount);
    }

    function getVaultStats() external view returns (
        uint256 _totalStaked,
        uint256 _totalFunded,
        uint256 _earlyWithdrawPenalty,
        address _charityVault,
        bool _stakingPaused
    ) {
        return (totalStaked, totalFunded, earlyWithdrawPenalty, address(getCharityVault()), stakingPaused);
    }

    function getUserOwed(address user) external view returns (uint256 total) {
        Stake[] storage stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (!s.claimed) {
                uint256 reward = s.amount * s.rewardRate / 10000;
                total += s.amount + reward;
            }
        }
    }

    function getAllStakers() external view returns (address[] memory) {
        return stakerList;
    }

    function pauseStaking(bool _pause) external onlyOwner {
        stakingPaused = _pause;
        emit StakingPaused(_pause);
    }


    function setEarlyWithdrawPenalty(uint256 newPenalty) external onlyOwner {
        require(newPenalty <= 2500, "Penalty too high");
        earlyWithdrawPenalty = newPenalty;
        emit PenaltyUpdated(newPenalty);
    }

    function getTotalLiabilities() external view returns (uint256 liabilities) {
        for (uint256 i = 0; i < stakerList.length; i++) {
            address user = stakerList[i];
            Stake[] storage stakes = userStakes[user];

            for (uint256 j = 0; j < stakes.length; j++) {
                Stake storage s = stakes[j];
                if (!s.claimed) {
                    liabilities += (s.amount * s.rewardRate) / 10000;
                }
            }
        }
    }

    function getVaultObligations() external view returns (uint256 requiredReserve) {
        requiredReserve = totalStaked + this.getTotalLiabilities();
    }

    function migrateTo(address newVault) external onlyToken {
        require(newVault != address(0), "Invalid vault address");

        IERC20 token = IERC20(petToken);
        uint256 reserve = this.getVaultObligations();
        uint256 balance = token.balanceOf(address(this));
        uint256 transferable = balance > reserve ? balance - reserve : 0;

        require(token.transfer(newVault, transferable), "Migration transfer failed");

        finalizeVault();
        emit StakingFundsMigrated(newVault, transferable);
    }

    function getCharityVault() internal view returns (ICharityVault) {
        return ICharityVault(IPetToken(address(petToken)).charityVault());
    }

    function finalizeVault() internal {
        isFinalized = true;
        emit VaultFinalized(stakerList.length, petToken.balanceOf(address(this)));
    }

    function cleanupStaker(address user) internal {
        Stake[] storage stakes = userStakes[user];
        bool hasActiveStake = false;

        for (uint256 i = 0; i < stakes.length; i++) {
            if (!stakes[i].claimed) {
                hasActiveStake = true;
                break;
            }
        }

        if (!hasActiveStake) {
            isStaker[user] = false;

            // Remove from stakerList
            for (uint256 i = 0; i < stakerList.length; i++) {
                if (stakerList[i] == user) {
                    stakerList[i] = stakerList[stakerList.length - 1];
                    stakerList.pop();
                    break;
                }
            }
        }
    }

}
