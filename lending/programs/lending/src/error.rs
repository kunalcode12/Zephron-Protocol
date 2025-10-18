use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Borrowed amount exceeds the maximum LTV.")]
    OverLTV,
    #[msg("Borrowed amount results in an under collateralized loan.")]
    UnderCollateralized,
    #[msg("Insufficient funds to withdraw.")]
    InsufficientFunds,
    #[msg("Attempting to repay more than borrowed.")]
    OverRepay,
    #[msg("Attempting to borrow more than allowed.")]
    OverBorrowableAmount,
    #[msg("User is not undercollateralized.")]
    NotUndercollateralized,
    #[msg("Oracle price error")] 
    OracleError,
    #[msg("Invalid health factor threshold. Must be between 110-300 bps.")]
    InvalidThreshold,
    #[msg("Invalid alert frequency. Must be between 1-168 hours.")]
    InvalidAlertFrequency,
}