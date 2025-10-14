use anchor_lang::prelude::*;
use crate::state::Bank;
use crate::constants::{BPS_DENOMINATOR, SECONDS_PER_YEAR};

// Compute utilization = total_borrowed / total_deposits (in bps), guarding zeros
#[inline(always)]
fn compute_utilization_bps(bank: &Bank) -> u64 {
    if bank.total_deposits == 0 { 
        return 0; 
    }
    if bank.total_borrowed >= bank.total_deposits { 
        return BPS_DENOMINATOR; 
    }
    ((bank.total_borrowed as u128)
        .saturating_mul(BPS_DENOMINATOR as u128)
        .checked_div(bank.total_deposits as u128)
        .unwrap_or(0)) as u64
}

// Kinked utilization model
#[inline(always)]
fn current_borrow_rate_bps(bank: &Bank) -> u64 {
    let u_bps = compute_utilization_bps(bank);
    if u_bps <= bank.optimal_utilization_bps {
        // base + slope1 * (u / optimal)
        let slope_contrib = (bank.slope1_bps as u128)
            .saturating_mul(u_bps as u128)
            .checked_div(bank.optimal_utilization_bps.max(1) as u128)
            .unwrap_or(0) as u64;
        bank.base_rate_bps.saturating_add(slope_contrib)
        
    } else {
        // base + slope1 + slope2 * ((u - optimal)/(1 - optimal))
        let over_bps = u_bps.saturating_sub(bank.optimal_utilization_bps);
        let denom = BPS_DENOMINATOR.saturating_sub(bank.optimal_utilization_bps).max(1);
        let slope2_contrib = (bank.slope2_bps as u128)
            .saturating_mul(over_bps as u128)
            .checked_div(denom as u128)
            .unwrap_or(0) as u64;
        bank.base_rate_bps
            .saturating_add(bank.slope1_bps)
            .saturating_add(slope2_contrib)
    }
}

// Accrue interest on total_borrowed based on elapsed time and current borrow APR.
pub fn accrue_interest(bank: &mut Bank) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    if bank.last_accrual_ts == 0 { 
        bank.last_accrual_ts = now; 
        return Ok(()); 
    }
    if now <= bank.last_accrual_ts { 
        return Ok(()); 
    }

    let elapsed: i64 = now - bank.last_accrual_ts;
    if elapsed <= 0 { 
        return Ok(()); 
    }
    if bank.total_borrowed == 0 { 
        bank.last_accrual_ts = now; 
        return Ok(()); 
    }

    let apr_bps = current_borrow_rate_bps(bank);

    // interest = total_borrowed * apr_bps/10_000 * elapsed/seconds_per_year
    let interest = ((bank.total_borrowed as u128)
        .saturating_mul(apr_bps as u128)
        .checked_div(BPS_DENOMINATOR as u128)
        .unwrap_or(0))
        .saturating_mul(elapsed as u128)
        .checked_div(SECONDS_PER_YEAR as u128)
        .unwrap_or(0) as u64;

    if interest > 0 {
        bank.total_borrowed = bank.total_borrowed.saturating_add(interest);
        // Keep shares constant; value per share increases implicitly.
    }

    bank.last_accrual_ts = now;
    Ok(())
}

// Expose helpers for testing/inspection
#[inline(always)]
pub fn get_utilization_bps(bank: &Bank) -> u64 { compute_utilization_bps(bank) }
#[inline(always)]
pub fn get_borrow_rate_bps(bank: &Bank) -> u64 { current_borrow_rate_bps(bank) }


