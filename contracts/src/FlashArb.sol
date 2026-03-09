// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ─── Minimal Uniswap V3 SwapRouter Interface ────────────────────────────────
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}

/// @title FlashArb — Atomic Flash Loan Arbitrage via Aave V3
/// @author W3 Terminal
/// @notice Borrows an asset via Aave V3 flash loan, swaps on DEX A → DEX B,
///         repays the loan + premium, and retains the profit.
/// @dev All execution is atomic: if the arb is unprofitable the entire tx reverts,
///      costing only the failed gas. No user capital is at risk.
contract FlashArb is FlashLoanSimpleReceiverBase, Ownable {
    using SafeERC20 for IERC20;

    // ── Immutable DEX routers ───────────────────────────────────────────────
    /// @notice The router used for the first swap (borrow asset → intermediate)
    ISwapRouter public immutable routerA;

    /// @notice The router used for the second swap (intermediate → borrow asset)
    ISwapRouter public immutable routerB;

    // ── Events ──────────────────────────────────────────────────────────────
    event FlashArbExecuted(
        address indexed asset,
        uint256 borrowed,
        uint256 premium,
        uint256 profit,
        address routerA,
        address routerB
    );

    event TokensWithdrawn(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // ── Errors ──────────────────────────────────────────────────────────────
    error ArbUnprofitable(uint256 required, uint256 received);
    error ZeroAddress();
    error ZeroAmount();

    // ── Constructor ─────────────────────────────────────────────────────────
    /// @param _addressesProvider Aave V3 PoolAddressesProvider (mainnet: 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e)
    /// @param _routerA DEX A swap router (e.g., Uniswap V3 SwapRouter)
    /// @param _routerB DEX B swap router (e.g., SushiSwap V3 SwapRouter)
    constructor(
        address _addressesProvider,
        address _routerA,
        address _routerB
    )
        FlashLoanSimpleReceiverBase(
            IPoolAddressesProvider(_addressesProvider)
        )
        Ownable(msg.sender)
    {
        if (_routerA == address(0) || _routerB == address(0)) {
            revert ZeroAddress();
        }
        routerA = ISwapRouter(_routerA);
        routerB = ISwapRouter(_routerB);
    }

    // ── External: Trigger a flash loan ──────────────────────────────────────
    /// @notice Initiates a flash loan to execute an arbitrage
    /// @param asset The ERC-20 token to borrow (e.g., USDC)
    /// @param amount The amount to borrow (in token decimals)
    /// @param intermediateToken The token to swap through (e.g., WETH)
    /// @param feeA Pool fee tier for DEX A swap (e.g., 500 = 0.05%)
    /// @param feeB Pool fee tier for DEX B swap (e.g., 3000 = 0.3%)
    /// @param minProfit Minimum profit required or the tx reverts (slippage guard)
    function requestFlashLoan(
        address asset,
        uint256 amount,
        address intermediateToken,
        uint24 feeA,
        uint24 feeB,
        uint256 minProfit
    ) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (asset == address(0) || intermediateToken == address(0)) {
            revert ZeroAddress();
        }

        // Encode swap parameters for the callback
        bytes memory params = abi.encode(
            intermediateToken,
            feeA,
            feeB,
            minProfit
        );

        // Request flash loan from Aave V3 Pool
        // referralCode 0 = no referral
        POOL.flashLoanSimple(
            address(this), // receiver
            asset,          // token to borrow
            amount,         // amount
            params,         // passed to executeOperation
            0               // referralCode
        );
    }

    // ── Callback: Aave calls this after sending the borrowed funds ──────────
    /// @notice Aave V3 flash loan callback — executes the two-leg arb swap
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Security: only the Aave Pool can call this
        require(msg.sender == address(POOL), "FlashArb: caller not Pool");
        require(initiator == address(this), "FlashArb: initiator mismatch");

        // Decode swap parameters
        (
            address intermediateToken,
            uint24 feeA,
            uint24 feeB,
            uint256 minProfit
        ) = abi.decode(params, (address, uint24, uint24, uint256));

        // Total debt = borrowed amount + Aave premium (0.05% on V3)
        uint256 totalDebt = amount + premium;

        // ── Swap 1: asset → intermediateToken on DEX A ──────────────────
        IERC20(asset).safeIncreaseAllowance(address(routerA), amount);

        uint256 intermediateAmount = routerA.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: asset,
                tokenOut: intermediateToken,
                fee: feeA,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: 0, // slippage checked at final balance
                sqrtPriceLimitX96: 0
            })
        );

        // ── Swap 2: intermediateToken → asset on DEX B ──────────────────
        IERC20(intermediateToken).safeIncreaseAllowance(
            address(routerB),
            intermediateAmount
        );

        uint256 finalAmount = routerB.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: intermediateToken,
                tokenOut: asset,
                fee: feeB,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: intermediateAmount,
                amountOutMinimum: totalDebt, // revert if can't cover loan
                sqrtPriceLimitX96: 0
            })
        );

        // ── Profitability check ─────────────────────────────────────────
        // If the arb didn't generate enough to cover loan + premium + minProfit,
        // revert the entire transaction (no funds lost, only gas)
        if (finalAmount < totalDebt + minProfit) {
            revert ArbUnprofitable(totalDebt + minProfit, finalAmount);
        }

        uint256 profit = finalAmount - totalDebt;

        // ── Repay Aave: approve the Pool to pull totalDebt ──────────────
        IERC20(asset).safeIncreaseAllowance(address(POOL), totalDebt);

        emit FlashArbExecuted(
            asset,
            amount,
            premium,
            profit,
            address(routerA),
            address(routerB)
        );

        return true;
    }

    // ── Owner: withdraw accumulated profits ─────────────────────────────────
    /// @notice Withdraws any ERC-20 token balance to the owner
    /// @param token The token to withdraw
    /// @param amount The amount to withdraw (use type(uint256).max for full balance)
    function withdrawTokens(
        address token,
        uint256 amount
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toSend = amount > balance ? balance : amount;

        if (toSend == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(owner(), toSend);

        emit TokensWithdrawn(token, owner(), toSend);
    }

    // ── Prevent accidental ETH sends ────────────────────────────────────────
    receive() external payable {
        // Accept ETH (needed for WETH unwrapping scenarios)
    }
}
