use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use crate::constants::{MAXIMUM_AGE, SOL_USD_FEED_ID, USDC_USD_FEED_ID, BPS_DENOMINATOR};
use crate::state::*;
use crate::error::ErrorCode;
use super::interest::accrue_interest;

#[derive(Accounts)]
pub struct Borrow<'info> {
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
        init_if_needed, 
        payer = signer,
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

pub fn process_borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    accrue_interest(&mut ctx.accounts.bank)?;
    let bank = &mut ctx.accounts.bank;
    let user = &mut ctx.accounts.user_account;

    let price_update = &ctx.accounts.price_update;
    let mint_key = ctx.accounts.mint.key();
    let user_usdc = user.usdc_address;

    let total_collateral: u64;
    

    match mint_key {
        key if key == user_usdc => {
            let sol_feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)
                .map_err(|_| error!(ErrorCode::OracleError))?; 
            let sol_price = price_update
                .get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &sol_feed_id)
                .map_err(|_| error!(ErrorCode::OracleError))?;
            total_collateral = sol_price.price as u64 * user.deposited_sol;
        },
        _ => {
            let usdc_feed_id = get_feed_id_from_hex(USDC_USD_FEED_ID)
                .map_err(|_| error!(ErrorCode::OracleError))?;
            let usdc_price = price_update
                .get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &usdc_feed_id)
                .map_err(|_| error!(ErrorCode::OracleError))?;
            total_collateral = usdc_price.price as u64 * user.deposited_usdc;

        }
    }

    let borrowable_amount = total_collateral * bank.liquidation_threshold;

    if borrowable_amount < amount {
        return Err(ErrorCode::OverBorrowableAmount.into());
    }       

    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.bank_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.bank_token_account.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            b"treasury",
            mint_key.as_ref(),
            &[ctx.bumps.bank_token_account],
        ],
    ];
    let cpi_ctx = CpiContext::new(cpi_program, transfer_cpi_accounts).with_signer(signer_seeds);
    let decimals = ctx.accounts.mint.decimals;

    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    if bank.total_borrowed == 0 {
        bank.total_borrowed = amount;
        bank.total_borrowed_shares = amount;
    } 

    let borrow_ratio = amount.checked_div(bank.total_borrowed).ok_or(ErrorCode::OverBorrowableAmount)?;
    let users_shares = bank.total_borrowed_shares.checked_mul(borrow_ratio).ok_or(ErrorCode::OverBorrowableAmount)?;

    bank.total_borrowed += amount;
    bank.total_borrowed_shares += users_shares; 

    match ctx.accounts.mint.to_account_info().key() {
        key if key == user.usdc_address => {
            user.borrowed_usdc += amount;
            user.deposited_usdc_shares += users_shares;
        },
        _ => {
            user.borrowed_sol += amount;
            user.deposited_sol_shares += users_shares;
        }
    }

    // Update health factor after borrowing
    update_user_health_factor(user, &price_update)?;

    Ok(())
}

fn update_user_health_factor(user: &mut User, price_update: &PriceUpdateV2) -> Result<()> {
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

    // health factor
    user.health_factor = health_factor;
    user.last_health_check = Clock::get()?.unix_timestamp;

   
    if user.is_monitoring_enabled && health_factor < user.alert_threshold {
        let now = Clock::get()?.unix_timestamp;
        let hours_since_last_alert = (now - user.last_alert_sent) / 3600;
        
        if hours_since_last_alert >= user.alert_frequency_hours as i64 {
            user.last_alert_sent = now;
            
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