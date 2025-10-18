use anchor_lang::prelude::*;
use instructions::*;

mod state;
mod instructions;
mod error;
mod constants;

declare_id!("33s5M4sRp6LBV8mwHJz1EssyhQ3EHrHnDqQ94N1vy74q");

#[program]
pub mod lending_protocol {

    use super::*;

    pub fn init_bank(ctx: Context<InitBank>, liquidation_threshold: u64, max_ltv: u64) -> Result<()> {
        process_init_bank(ctx, liquidation_threshold, max_ltv)
    }

    pub fn init_user(ctx: Context<InitUser>, usdc_address: Pubkey) -> Result<()> {
        process_init_user(ctx, usdc_address)
    }

    pub fn deposit (ctx: Context<Deposit>, amount: u64) -> Result<()> {
        process_deposit(ctx, amount)
    }

    pub fn withdraw (ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        process_withdraw(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        process_borrow(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        process_repay(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        process_liquidate(ctx)
    }

    // Health monitoring
    pub fn enable_health_monitoring(ctx: Context<EnableHealthMonitoring>) -> Result<()> {
        process_enable_health_monitoring(ctx)
    }

    pub fn update_health_threshold(
        ctx: Context<UpdateHealthThreshold>, 
        new_threshold: u64,
        alert_frequency_hours: u8
    ) -> Result<()> {
        process_update_health_threshold(ctx, new_threshold, alert_frequency_hours)
    }

    pub fn check_health_factor(ctx: Context<CheckHealthFactor>) -> Result<()> {
        process_check_health_factor(ctx)
    }

    pub fn create_health_snapshot(ctx: Context<CreateHealthSnapshot>) -> Result<()> {
        process_create_health_snapshot(ctx)
    }
}