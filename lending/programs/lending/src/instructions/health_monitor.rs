use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use crate::constants::{MAXIMUM_AGE, SOL_USD_FEED_ID, USDC_USD_FEED_ID, BPS_DENOMINATOR};
use crate::state::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct EnableHealthMonitoring<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateHealthThreshold<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckHealthFactor<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateHealthSnapshot<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,
    #[account(
        init,
        payer = signer,
        space = 8 + HealthSnapshot::INIT_SPACE,
        seeds = [b"health_snapshot", signer.key().as_ref(), &user_account.health_history_count.to_le_bytes()],
        bump,
    )]
    pub health_snapshot: Account<'info, HealthSnapshot>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

pub fn process_enable_health_monitoring(ctx: Context<EnableHealthMonitoring>) -> Result<()> {
    let user = &mut ctx.accounts.user_account;
    user.is_monitoring_enabled = true;
    user.last_health_check = Clock::get()?.unix_timestamp;
    
    msg!("Health monitoring enabled for user: {}", user.owner);
    Ok(())
}

pub fn process_update_health_threshold(
    ctx: Context<UpdateHealthThreshold>, 
    new_threshold: u64,
    alert_frequency_hours: u8
) -> Result<()> {
    let user = &mut ctx.accounts.user_account;
    
    require!(new_threshold >= 110, ErrorCode::InvalidThreshold);
    require!(new_threshold <= 300, ErrorCode::InvalidThreshold);
    require!(alert_frequency_hours >= 1 && alert_frequency_hours <= 168, ErrorCode::InvalidAlertFrequency);
    
    user.alert_threshold = new_threshold;
    user.alert_frequency_hours = alert_frequency_hours;
    
    msg!("Health threshold updated to: {} bps, alert frequency: {} hours", new_threshold, alert_frequency_hours);
    Ok(())
}

pub fn process_check_health_factor(ctx: Context<CheckHealthFactor>) -> Result<()> {
    let user = &mut ctx.accounts.user_account;
    let price_update = &ctx.accounts.price_update;

    //current prices
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

    // total collateral and borrowed values
    let total_collateral_value = (sol_price.price as u64)
        .saturating_mul(user.deposited_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.deposited_usdc));
    
    let total_borrowed_value = (sol_price.price as u64)
        .saturating_mul(user.borrowed_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.borrowed_usdc));

    // health factor
    let health_factor = if total_borrowed_value == 0 {
        u64::MAX // Perfect health if no debt
    } else {
        (total_collateral_value as u128)
            .saturating_mul(BPS_DENOMINATOR as u128)
            .checked_div(total_borrowed_value as u128)
            .unwrap_or(0) as u64
    };

    user.health_factor = health_factor;
    user.last_health_check = Clock::get()?.unix_timestamp;

    if user.is_monitoring_enabled && health_factor < user.alert_threshold {
        let now = Clock::get()?.unix_timestamp;
        let hours_since_last_alert = (now - user.last_alert_sent) / 3600;
        
        if hours_since_last_alert >= user.alert_frequency_hours as i64 {
            user.last_alert_sent = now;
            
            emit!(HealthAlertEvent {
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

    msg!("Health factor updated: {} bps", health_factor);
    Ok(())
}

pub fn process_create_health_snapshot(ctx: Context<CreateHealthSnapshot>) -> Result<()> {
    let user = &mut ctx.accounts.user_account;
    let health_snapshot = &mut ctx.accounts.health_snapshot;
    let price_update = &ctx.accounts.price_update;

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

    let total_collateral_value = (sol_price.price as u64)
        .saturating_mul(user.deposited_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.deposited_usdc));
    
    let total_borrowed_value = (sol_price.price as u64)
        .saturating_mul(user.borrowed_sol)
        .saturating_add((usdc_price.price as u64).saturating_mul(user.borrowed_usdc));

    let health_factor = if total_borrowed_value == 0 {
        u64::MAX
    } else {
        (total_collateral_value as u128)
            .saturating_mul(BPS_DENOMINATOR as u128)
            .checked_div(total_borrowed_value as u128)
            .unwrap_or(0) as u64
    };

    let now = Clock::get()?.unix_timestamp;
    health_snapshot.user = user.owner;
    health_snapshot.health_factor = health_factor;
    health_snapshot.total_collateral_value = total_collateral_value;
    health_snapshot.total_borrowed_value = total_borrowed_value;
    health_snapshot.timestamp = now;
    health_snapshot.sol_price = sol_price.price as u64;
    health_snapshot.usdc_price = usdc_price.price as u64;

    user.health_history_count = user.health_history_count.saturating_add(1);

    msg!("Health snapshot created for user: {}, health factor: {} bps", user.owner, health_factor);
    Ok(())
}

#[event]
pub struct HealthAlertEvent {
    pub user: Pubkey,
    pub health_factor: u64,
    pub total_collateral_value: u64,
    pub total_borrowed_value: u64,
    pub sol_price: u64,
    pub usdc_price: u64,
    pub timestamp: i64,
}
