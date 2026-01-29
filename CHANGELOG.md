# Changelog

This changelog tracks the UniV2-based mainline. UniV3 functionality remains on its own branch and is not reflected here.

## [Post-audit hardening] - 2026-01-28

Changes
- Oracle correctness and safety: the Uniswap V2 TWAP feed now supports base/quote orientation, computes counterfactual TWAPs between updates, uses wrapping arithmetic for cumulatives/timestamps, and requires non-zero reserves (with deploy tooling enforcing liquidity first).
- Access gating naming cleanup: USD-centric names were replaced with quote/value terminology across AccessGating, tests, status output, and README.
- Token limits and pre-deployment cleanup: removed upper bounds on `maxWalletSize` and `maxTxSize`, removed unused CharityVault `feeForwarders`, removed some unessesary require's, added confirmation waits in deploy scripts, and added Chiado RPC placeholder.
- Documentation and audit artifacts: staking rewards are described as fixed-per-lock-period rewards and preliminary audit PDF was added.

## [HashLock audit submission] - fea887c13d8ebaf06356bd8053df79e828276641

This commit represents the first code snapshot submitted to HashLock for audit. It includes the core CNU token, vault system, access gating, and Uniswap V2 integration as the baseline for review.

Changes
- Initial production-intent contract set for token, vaults, access gating, and Uniswap V2 plumbing.
- Baseline tasks, tests, and docs used for the audit submission.
