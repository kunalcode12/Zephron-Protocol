use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bank {
    pub authority: Pubkey,
    pub mint_address: Pubkey,
    pub total_deposits: u64,
    pub total_deposit_shares: u64,
    pub total_borrowed: u64,
    pub total_borrowed_shares: u64,
    pub liquidation_threshold: u64,
    pub liquidation_bonus: u64,
    pub liquidation_close_factor: u64,
    pub max_ltv: u64,
    pub last_updated: i64,
    pub interest_rate: u64,
    
    // Interest parameters and accrual
    pub base_rate_bps: u64,
    pub slope1_bps: u64,
    pub slope2_bps: u64,
    pub optimal_utilization_bps: u64,
    pub last_accrual_ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct User {
    pub owner: Pubkey,
    pub deposited_sol: u64,
    pub deposited_sol_shares: u64,
    pub borrowed_sol: u64,
    pub borrowed_sol_shares: u64, 
    pub deposited_usdc: u64,
    pub deposited_usdc_shares: u64, 
    pub borrowed_usdc: u64,
    pub borrowed_usdc_shares: u64, 
    pub usdc_address: Pubkey,
    pub health_factor: u64,
    pub last_updated: i64,

    // Health monitoring fields
    pub alert_threshold: u64,        
    pub last_health_check: i64,     
    pub health_history_count: u8,   
    pub is_monitoring_enabled: bool,
    pub last_alert_sent: i64,       
    pub alert_frequency_hours: u8, 
}

#[account]
#[derive(InitSpace)]
pub struct HealthSnapshot {
    pub user: Pubkey,
    pub health_factor: u64,
    pub total_collateral_value: u64,
    pub total_borrowed_value: u64,
    pub timestamp: i64,
    pub sol_price: u64,
    pub usdc_price: u64,
}
