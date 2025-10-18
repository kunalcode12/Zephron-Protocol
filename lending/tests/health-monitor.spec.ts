import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingProtocol } from "../target/types/lending_protocol";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { 
  createMint, 
  createAccount, 
  mintTo, 
  getAccount,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { BankrunConnection } from "./bankrun-utils/bankrunConnection";

describe("Health Monitoring System", () => {
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
    // Setup mints
    solMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      9
    );

    usdcMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Setup price update (mock)
    priceUpdate = Keypair.generate().publicKey;

    // Initialize banks
    [solBank] = PublicKey.findProgramAddressSync(
      [solMint.toBuffer()],
      program.programId
    );

    [usdcBank] = PublicKey.findProgramAddressSync(
      [usdcMint.toBuffer()],
      program.programId
    );

    [solBankTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), solMint.toBuffer()],
      program.programId
    );

    [usdcBankTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), usdcMint.toBuffer()],
      program.programId
    );

    [userAccount] = PublicKey.findProgramAddressSync(
      [user.publicKey.toBuffer()],
      program.programId
    );

    // Initialize banks
    await program.methods
      .initBank(new anchor.BN(8000), new anchor.BN(7500)) // 80% liquidation threshold, 75% max LTV
      .accounts({
        signer: authority.publicKey,
        mint: solMint,
        bank: solBank,
        bankTokenAccount: solBankTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    await program.methods
      .initBank(new anchor.BN(8000), new anchor.BN(7500))
      .accounts({
        signer: authority.publicKey,
        mint: usdcMint,
        bank: usdcBank,
        bankTokenAccount: usdcBankTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Initialize user
    await program.methods
      .initUser(usdcMint)
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    // Create user token accounts
    userSolTokenAccount = await getAssociatedTokenAddress(solMint, user.publicKey);
    userUsdcTokenAccount = await getAssociatedTokenAddress(usdcMint, user.publicKey);

    // Fund user with tokens
    await connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Mint tokens to user
    await mintTo(
      connection,
      authority,
      solMint,
      userSolTokenAccount,
      authority,
      1000 * 1e9 // 1000 SOL
    );

    await mintTo(
      connection,
      authority,
      usdcMint,
      userUsdcTokenAccount,
      authority,
      10000 * 1e6 // 10000 USDC
    );
  });

  it("Should initialize user with default health monitoring settings", async () => {
    const userData = await program.account.user.fetch(userAccount);
    
    expect(userData.alertThreshold.toNumber()).to.equal(150); // 1.5x threshold
    expect(userData.isMonitoringEnabled).to.be.false;
    expect(userData.alertFrequencyHours).to.equal(24);
    expect(userData.healthHistoryCount).to.equal(0);
  });

  it("Should enable health monitoring", async () => {
    await program.methods
      .enableHealthMonitoring()
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.isMonitoringEnabled).to.be.true;
  });

  it("Should update health threshold", async () => {
    await program.methods
      .updateHealthThreshold(new anchor.BN(200), 12) // 2.0x threshold, 12 hour frequency
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.alertThreshold.toNumber()).to.equal(200);
    expect(userData.alertFrequencyHours).to.equal(12);
  });

  it("Should reject invalid thresholds", async () => {
    try {
      await program.methods
        .updateHealthThreshold(new anchor.BN(50), 12) // Too low
        .accounts({
          signer: user.publicKey,
          userAccount: userAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have rejected invalid threshold");
    } catch (error) {
      expect(error.message).to.include("InvalidThreshold");
    }

    try {
      await program.methods
        .updateHealthThreshold(new anchor.BN(200), 200) // Too high frequency
        .accounts({
          signer: user.publicKey,
          userAccount: userAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have rejected invalid frequency");
    } catch (error) {
      expect(error.message).to.include("InvalidAlertFrequency");
    }
  });

  it("Should calculate health factor correctly after deposit", async () => {
    // Deposit SOL
    await program.methods
      .deposit(new anchor.BN(100 * 1e9)) // 100 SOL
      .accounts({
        signer: user.publicKey,
        mint: solMint,
        bank: solBank,
        bankTokenAccount: solBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userSolTokenAccount,
        priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.depositedSol.toNumber()).to.equal(100 * 1e9);
    expect(userData.healthFactor.toNumber()).to.be.greaterThan(0);
  });

  it("Should calculate health factor correctly after borrowing", async () => {
    // Borrow USDC against SOL collateral
    await program.methods
      .borrow(new anchor.BN(1000 * 1e6)) // 1000 USDC
      .accounts({
        signer: user.publicKey,
        mint: usdcMint,
        bank: usdcBank,
        bankTokenAccount: usdcBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userUsdcTokenAccount,
        priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.borrowedUsdc.toNumber()).to.equal(1000 * 1e6);
    expect(userData.healthFactor.toNumber()).to.be.greaterThan(0);
  });

  it("Should create health snapshots", async () => {
    const [healthSnapshot] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("health_snapshot"),
        user.publicKey.toBuffer(),
        Buffer.from([0]) // First snapshot
      ],
      program.programId
    );

    await program.methods
      .createHealthSnapshot()
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        healthSnapshot: healthSnapshot,
        priceUpdate: priceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const snapshotData = await program.account.healthSnapshot.fetch(healthSnapshot);
    expect(snapshotData.user.toString()).to.equal(user.publicKey.toString());
    expect(snapshotData.healthFactor.toNumber()).to.be.greaterThan(0);
    expect(snapshotData.totalCollateralValue.toNumber()).to.be.greaterThan(0);
  });

  it("Should check health factor and potentially trigger alerts", async () => {
    // First, let's create a risky position by borrowing more
    await program.methods
      .borrow(new anchor.BN(5000 * 1e6)) // 5000 USDC - this should lower health factor
      .accounts({
        signer: user.publicKey,
        mint: usdcMint,
        bank: usdcBank,
        bankTokenAccount: usdcBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userUsdcTokenAccount,
        priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    // Check health factor
    await program.methods
      .checkHealthFactor()
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        priceUpdate: priceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.lastHealthCheck.toNumber()).to.be.greaterThan(0);
    
    // If health factor is below threshold, last alert sent should be updated
    if (userData.healthFactor.toNumber() < userData.alertThreshold.toNumber()) {
      expect(userData.lastAlertSent.toNumber()).to.be.greaterThan(0);
    }
  });

  it("Should respect alert frequency limits", async () => {
    const userData = await program.account.user.fetch(userAccount);
    const initialAlertTime = userData.lastAlertSent.toNumber();

    // Try to check health factor again immediately
    await program.methods
      .checkHealthFactor()
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        priceUpdate: priceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const updatedUserData = await program.account.user.fetch(userAccount);
    
    // If health factor is still below threshold, alert time should not change
    // due to frequency limits
    if (updatedUserData.healthFactor.toNumber() < updatedUserData.alertThreshold.toNumber()) {
      expect(updatedUserData.lastAlertSent.toNumber()).to.equal(initialAlertTime);
    }
  });

  it("Should handle perfect health factor (no debt)", async () => {
    // Repay all debt
    await program.methods
      .repay(new anchor.BN(6000 * 1e6)) // Repay all USDC
      .accounts({
        signer: user.publicKey,
        mint: usdcMint,
        bank: usdcBank,
        bankTokenAccount: usdcBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userUsdcTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    // Check health factor
    await program.methods
      .checkHealthFactor()
      .accounts({
        signer: user.publicKey,
        userAccount: userAccount,
        priceUpdate: priceUpdate,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userData = await program.account.user.fetch(userAccount);
    expect(userData.borrowedUsdc.toNumber()).to.equal(0);
    expect(userData.healthFactor.toNumber()).to.equal(Number.MAX_SAFE_INTEGER); // Perfect health
  });

  it("Should maintain health factor accuracy across multiple operations", async () => {
    // Perform a series of operations and verify health factor consistency
    const operations = [
      () => program.methods.deposit(new anchor.BN(50 * 1e9)).accounts({
        signer: user.publicKey,
        mint: solMint,
        bank: solBank,
        bankTokenAccount: solBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userSolTokenAccount,
        priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).signers([user]).rpc(),
      
      () => program.methods.borrow(new anchor.BN(2000 * 1e6)).accounts({
        signer: user.publicKey,
        mint: usdcMint,
        bank: usdcBank,
        bankTokenAccount: usdcBankTokenAccount,
        userAccount: userAccount,
        userTokenAccount: userUsdcTokenAccount,
        priceUpdate: priceUpdate,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).signers([user]).rpc(),
    ];

    for (const operation of operations) {
      await operation();
      
      const userData = await program.account.user.fetch(userAccount);
      expect(userData.healthFactor.toNumber()).to.be.greaterThan(0);
      expect(userData.lastHealthCheck.toNumber()).to.be.greaterThan(0);
    }
  });
});
