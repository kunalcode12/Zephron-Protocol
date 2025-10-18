use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use crate::constants::{MAXIMUM_AGE, SOL_USD_FEED_ID, USDC_USD_FEED_ID, BPS_DENOMINATOR};
use crate::state::*;
use crate::error::ErrorCode;
use super::interest::accrue_interest;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut, 
        seeds = [mint.key().as_ref()],
        bump,
    )]  
    pub bank: Account<'info, Bank>,
    #[account(
        mut, 
        seeds = [b"treasury", mint.key().as_ref()],
        bump, 
    )]  
    pub bank_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [signer.key().as_ref()],
        bump,
    )]  
    pub user_account: Account<'info, User>,
    #[account( 
        mut,
        associated_token::mint = mint, 
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>, 
    pub price_update: Account<'info, PriceUpdateV2>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    // Accrue interest before state mutations
    accrue_interest(&mut ctx.accounts.bank)?;
    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.user_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.bank_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi_accounts);
    let decimals = ctx.accounts.mint.decimals;

    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    let bank = &mut ctx.accounts.bank;
    let mint_key = ctx.accounts.mint.key();

    if bank.total_deposits == 0 {
        bank.total_deposits = amount;
        bank.total_deposit_shares = amount;
    }
    
    let deposit_ratio = amount.checked_div(bank.total_deposits).ok_or(ErrorCode::InsufficientFunds)?;
    let users_shares = bank.total_deposit_shares.checked_mul(deposit_ratio).ok_or(ErrorCode::InsufficientFunds)?;
    
    let user = &mut ctx.accounts.user_account;
    let user_usdc = user.usdc_address;
    
    match mint_key {
        key if key == user_usdc => {
            user.deposited_usdc += amount;
            user.deposited_usdc_shares += users_shares;
        },
        _ => {
            user.deposited_sol += amount;
            user.deposited_sol_shares += users_shares; 
        }
    }


    bank.total_deposits += amount;
    bank.total_deposit_shares += users_shares;

    user.last_updated = Clock::get()?.unix_timestamp;

    // Update health factor after depositing
    update_user_health_factor(&mut ctx.accounts.user_account, &ctx.accounts.price_update)?;

    Ok(())
}

// Helper function to update user health factor
fn update_user_health_factor(user: &mut User, price_update: &PriceUpdateV2) -> Result<()> {
    // Get current prices
    let sol_feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)
        .map_err(|_| error!(ErrorCode::OracleError))?;
    let usdc_feed_id = get_feed_id_from_hex(USDC_USD_FEED_ID)
        .map_err(|_| error!(ErrorCode::OracleError))?;

    let sol_price = price_update
        .get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &sol_feed_id)
        .map_err(|_| error!(ErrorCode::OracleError))?;
    let usdc_price = price_update
        .get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &usdc_feed_id)
        .map_err(|_| error!(ErrorCode::OracleError))?;

    // Calculate total collateral and borrowed values
    let total_collateral_value = (sol_price.price as u64)
        .saturating_mul(user.deposited_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.deposited_usdc));
    
    let total_borrowed_value = (sol_price.price as u64)
        .saturating_mul(user.borrowed_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.borrowed_usdc));

    // Calculate health factor
    let health_factor = if total_borrowed_value == 0 {
        u64::MAX // Perfect health if no debt
    } else {
        (total_collateral_value as u128)
            .saturating_mul(BPS_DENOMINATOR as u128)
            .checked_div(total_borrowed_value as u128)
            .unwrap_or(0) as u64
    };

    // Update user health factor
    user.health_factor = health_factor;
    user.last_health_check = Clock::get()?.unix_timestamp;

    // Check if alert should be sent
    if user.is_monitoring_enabled && health_factor < user.alert_threshold {
        let now = Clock::get()?.unix_timestamp;
        let hours_since_last_alert = (now - user.last_alert_sent) / 3600;
        
        if hours_since_last_alert >= user.alert_frequency_hours as i64 {
            user.last_alert_sent = now;
            
            // Emit health alert event
            emit!(crate::instructions::health_monitor::HealthAlertEvent {
                user: user.owner,
                health_factor,
                total_collateral_value,
                total_borrowed_value,
                sol_price: sol_price.price as u64,
                usdc_price: usdc_price.price as u64,
                timestamp: now,
            });
            
            msg!("HEALTH ALERT: User {} health factor {} below threshold {}", 
                 user.owner, health_factor, user.alert_threshold);
        }
    }

    Ok(())
}