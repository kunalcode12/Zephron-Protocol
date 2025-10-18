import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingProtocol } from "../target/types/lending_protocol";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createMint, 
  mintTo, 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { BankrunConnection } from "./bankrun-utils/bankrunConnection";

describe("Health Monitoring Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LendingProtocol as Program<LendingProtocol>;
  const connection = new BankrunConnection();

  let solMint: PublicKey;
  let usdcMint: PublicKey;
  let solBank: PublicKey;
  let usdcBank: PublicKey;
  let solBankTokenAccount: PublicKey;
  let usdcBankTokenAccount: PublicKey;
  let userAccount: PublicKey;
  let userSolTokenAccount: PublicKey;
  let userUsdcTokenAccount: PublicKey;
  let priceUpdate: PublicKey;

  const user = Keypair.generate();
  const authority = Keypair.generate();

  before(async () => {
    // Setup mints and accounts (similar to previous test)
    solMint = await createMint(connection, authority, authority.publicKey, null, 9);
    usdcMint = await createMint(connection, authority, authority.publicKey, null, 6);
    priceUpdate = Keypair.generate().publicKey;

    [solBank] = PublicKey.findProgramAddressSync([solMint.toBuffer()], program.programId);
    [usdcBank] = PublicKey.findProgramAddressSync([usdcMint.toBuffer()], program.programId);
    [solBankTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from("treasury"), solMint.toBuffer()], program.programId);
    [usdcBankTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from("treasury"), usdcMint.toBuffer()], program.programId);
    [userAccount] = PublicKey.findProgramAddressSync([user.publicKey.toBuffer()], program.programId);

    // Initialize banks and user
    await program.methods.initBank(new anchor.BN(8000), new anchor.BN(7500))
      .accounts({ signer: authority.publicKey, mint: solMint, bank: solBank, bankTokenAccount: solBankTokenAccount, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([authority]).rpc();

    await program.methods.initBank(new anchor.BN(8000), new anchor.BN(7500))
      .accounts({ signer: authority.publicKey, mint: usdcMint, bank: usdcBank, bankTokenAccount: usdcBankTokenAccount, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([authority]).rpc();

    await program.methods.initUser(usdcMint)
      .accounts({ signer: user.publicKey, userAccount: userAccount, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    userSolTokenAccount = await getAssociatedTokenAddress(solMint, user.publicKey);
    userUsdcTokenAccount = await getAssociatedTokenAddress(usdcMint, user.publicKey);

    await connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await mintTo(connection, authority, solMint, userSolTokenAccount, authority, 1000 * 1e9);
    await mintTo(connection, authority, usdcMint, userUsdcTokenAccount, authority, 10000 * 1e6);
  });

  it("Should demonstrate complete health monitoring workflow", async () => {
    console.log("🏥 Starting Health Monitoring Integration Test");

    // Step 1: Enable health monitoring with conservative settings
    console.log("📊 Enabling health monitoring...");
    await program.methods.enableHealthMonitoring()
      .accounts({ signer: user.publicKey, userAccount: userAccount, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    await program.methods.updateHealthThreshold(new anchor.BN(200), 1) // 2.0x threshold, 1 hour frequency
      .accounts({ signer: user.publicKey, userAccount: userAccount, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    // Step 2: Create initial healthy position
    console.log("💰 Creating initial position...");
    await program.methods.deposit(new anchor.BN(100 * 1e9)) // 100 SOL
      .accounts({
        signer: user.publicKey, mint: solMint, bank: solBank, bankTokenAccount: solBankTokenAccount,
        userAccount: userAccount, userTokenAccount: userSolTokenAccount, priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId
      }).signers([user]).rpc();

    let userData = await program.account.user.fetch(userAccount);
    console.log(`✅ Initial health factor: ${userData.healthFactor.toNumber() / 100}%`);
    expect(userData.isMonitoringEnabled).to.be.true;

    // Step 3: Create health snapshot
    console.log("📸 Creating health snapshot...");
    const [healthSnapshot] = PublicKey.findProgramAddressSync([
      Buffer.from("health_snapshot"), user.publicKey.toBuffer(), Buffer.from([0])
    ], program.programId);

    await program.methods.createHealthSnapshot()
      .accounts({ signer: user.publicKey, userAccount: userAccount, healthSnapshot: healthSnapshot, priceUpdate: priceUpdate, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    const snapshotData = await program.account.healthSnapshot.fetch(healthSnapshot);
    console.log(`📊 Snapshot health factor: ${snapshotData.healthFactor.toNumber() / 100}%`);

    // Step 4: Gradually increase risk to trigger alerts
    console.log("⚠️  Gradually increasing risk...");
    const borrowAmounts = [1000, 2000, 3000, 4000, 5000]; // USDC amounts
    
    for (let i = 0; i < borrowAmounts.length; i++) {
      const amount = borrowAmounts[i] * 1e6;
      console.log(`💸 Borrowing ${borrowAmounts[i]} USDC...`);
      
      await program.methods.borrow(new anchor.BN(amount))
        .accounts({
          signer: user.publicKey, mint: usdcMint, bank: usdcBank, bankTokenAccount: usdcBankTokenAccount,
          userAccount: userAccount, userTokenAccount: userUsdcTokenAccount, priceUpdate: priceUpdate,
          tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId
        }).signers([user]).rpc();

      userData = await program.account.user.fetch(userAccount);
      const healthFactorPercent = userData.healthFactor.toNumber() / 100;
      console.log(`📊 Health factor after borrowing ${borrowAmounts[i]} USDC: ${healthFactorPercent}%`);

      // Check if alert should be triggered
      if (healthFactorPercent < 200) { // Below 2.0x threshold
        console.log(`🚨 Health factor ${healthFactorPercent}% is below 200% threshold!`);
        
        // Manually trigger health check to simulate alert
        await program.methods.checkHealthFactor()
          .accounts({ signer: user.publicKey, userAccount: userAccount, priceUpdate: priceUpdate, systemProgram: SystemProgram.programId })
          .signers([user]).rpc();

        const updatedUserData = await program.account.user.fetch(userAccount);
        if (updatedUserData.lastAlertSent.toNumber() > 0) {
          console.log(`📢 Alert sent at timestamp: ${updatedUserData.lastAlertSent.toNumber()}`);
        }
      }
    }

    // Step 5: Demonstrate risk management
    console.log("🛡️  Demonstrating risk management...");
    
    // Check current health factor
    userData = await program.account.user.fetch(userAccount);
    const currentHealthFactor = userData.healthFactor.toNumber() / 100;
    console.log(`📊 Current health factor: ${currentHealthFactor}%`);

    if (currentHealthFactor < 150) { // Very risky position
      console.log("⚠️  Position is very risky! Demonstrating risk management...");
      
      // Option 1: Add more collateral
      console.log("💰 Adding more collateral...");
      await program.methods.deposit(new anchor.BN(50 * 1e9)) // 50 more SOL
        .accounts({
          signer: user.publicKey, mint: solMint, bank: solBank, bankTokenAccount: solBankTokenAccount,
          userAccount: userAccount, userTokenAccount: userSolTokenAccount, priceUpdate: priceUpdate,
          tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId
        }).signers([user]).rpc();

      userData = await program.account.user.fetch(userAccount);
      const improvedHealthFactor = userData.healthFactor.toNumber() / 100;
      console.log(`✅ Health factor improved to: ${improvedHealthFactor}%`);
    }

    // Step 6: Demonstrate recovery
    console.log("🔄 Demonstrating position recovery...");
    
    // Repay some debt to improve health factor
    const repayAmount = 2000 * 1e6; // 2000 USDC
    console.log(`💳 Repaying ${repayAmount / 1e6} USDC...`);
    
    await program.methods.repay(new anchor.BN(repayAmount))
      .accounts({
        signer: user.publicKey, mint: usdcMint, bank: usdcBank, bankTokenAccount: usdcBankTokenAccount,
        userAccount: userAccount, userTokenAccount: userUsdcTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId
      }).signers([user]).rpc();

    userData = await program.account.user.fetch(userAccount);
    const recoveredHealthFactor = userData.healthFactor.toNumber() / 100;
    console.log(`✅ Health factor after repayment: ${recoveredHealthFactor}%`);

    // Step 7: Create final health snapshot
    console.log("📸 Creating final health snapshot...");
    const [finalHealthSnapshot] = PublicKey.findProgramAddressSync([
      Buffer.from("health_snapshot"), user.publicKey.toBuffer(), Buffer.from([1])
    ], program.programId);

    await program.methods.createHealthSnapshot()
      .accounts({ signer: user.publicKey, userAccount: userAccount, healthSnapshot: finalHealthSnapshot, priceUpdate: priceUpdate, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    const finalSnapshotData = await program.account.healthSnapshot.fetch(finalHealthSnapshot);
    console.log(`📊 Final snapshot health factor: ${finalSnapshotData.healthFactor.toNumber() / 100}%`);

    // Verify health monitoring is working
    expect(userData.isMonitoringEnabled).to.be.true;
    expect(userData.alertThreshold.toNumber()).to.equal(200);
    expect(userData.healthHistoryCount).to.be.greaterThan(0);
    expect(userData.lastHealthCheck.toNumber()).to.be.greaterThan(0);

    console.log("✅ Health monitoring integration test completed successfully!");
  });

  it("Should handle edge cases and error conditions", async () => {
    console.log("🧪 Testing edge cases...");

    // Test with monitoring disabled
    const user2 = Keypair.generate();
    const [user2Account] = PublicKey.findProgramAddressSync([user2.publicKey.toBuffer()], program.programId);
    
    await program.methods.initUser(usdcMint)
      .accounts({ signer: user2.publicKey, userAccount: user2Account, systemProgram: SystemProgram.programId })
      .signers([user2]).rpc();

    // Should not send alerts when monitoring is disabled
    const user2Data = await program.account.user.fetch(user2Account);
    expect(user2Data.isMonitoringEnabled).to.be.false;

    // Test invalid threshold updates
    try {
      await program.methods.updateHealthThreshold(new anchor.BN(50), 12) // Too low
        .accounts({ signer: user.publicKey, userAccount: userAccount, systemProgram: SystemProgram.programId })
        .signers([user]).rpc();
      expect.fail("Should have rejected invalid threshold");
    } catch (error) {
      expect(error.message).to.include("InvalidThreshold");
    }

    // Test with zero debt (perfect health)
    console.log("🏆 Testing perfect health scenario...");
    await program.methods.checkHealthFactor()
      .accounts({ signer: user.publicKey, userAccount: userAccount, priceUpdate: priceUpdate, systemProgram: SystemProgram.programId })
      .signers([user]).rpc();

    const userData = await program.account.user.fetch(userAccount);
    console.log(`📊 Health factor: ${userData.healthFactor.toNumber()}`);

    console.log("✅ Edge case testing completed!");
  });
});
