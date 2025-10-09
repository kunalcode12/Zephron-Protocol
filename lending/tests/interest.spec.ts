import { describe, it } from "node:test";
import { BN, Program } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createAccount, createMint, mintTo, getAccount } from "spl-token-bankrun";
import { startAnchor, BanksClient, ProgramTestContext } from "solana-bankrun";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

// @ts-ignore
import IDL from "../target/idl/lending_protocol.json";
import { LendingProtocol } from "../target/types/lending_protocol";
import { BankrunContextWrapper } from "../bankrun-utils/bankrunConnection";

// This test verifies dynamic interest accrual by advancing the bankrun clock
// and ensuring that totalBorrowed grows beyond the newly borrowed principal.

describe("Lending - Dynamic Interest Accrual", async () => {
  let signer: Keypair;
  let solBankAccount: PublicKey;
  let solTreasuryAccount: PublicKey;
  let userAccount: PublicKey;
  let solTokenAccount: PublicKey;
  let provider: BankrunProvider;
  let program: Program<LendingProtocol>;
  let banksClient: BanksClient;
  let context: ProgramTestContext;
  let bankrunContextWrapper: BankrunContextWrapper;

  // Mints
  let mintSOL: PublicKey;

  // Pyth setup (devnet account pulled and injected into Bankrun)
  const PYTH_PRICE_FEED = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
  const SOL_PRICE_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

  // Setup Bankrun context with a real Pyth feed account cloned from devnet
  const devnetConnection = new Connection("https://api.devnet.solana.com");
  const pythAccountInfo = await devnetConnection.getAccountInfo(PYTH_PRICE_FEED);

  context = await startAnchor(
    "",
    [{ name: "lending", programId: new PublicKey(IDL.address) }],
    [
      {
        address: PYTH_PRICE_FEED,
        info: pythAccountInfo,
      },
    ]
  );

  provider = new BankrunProvider(context);
  bankrunContextWrapper = new BankrunContextWrapper(context);
  const connection = bankrunContextWrapper.connection.toConnection();

  // Derive the SOL/USD price update account address used by the program
  // Minimal deterministic derivation mirroring the test harness in other specs
  const solUsdPriceFeedAccount = PublicKey.findProgramAddressSync(
    [Buffer.from("pyth-price"), Buffer.from(SOL_PRICE_FEED_ID)],
    PYTH_PRICE_FEED
  )[0];

  // If the feed account exists on devnet, inject it (best-effort)
  try {
    const feedInfo = await devnetConnection.getAccountInfo(solUsdPriceFeedAccount);
    if (feedInfo) {
      context.setAccount(solUsdPriceFeedAccount, feedInfo);
    }
  } catch (_) {}

  program = new Program<LendingProtocol>(IDL as LendingProtocol, provider);
  banksClient = context.banksClient;
  signer = provider.wallet.payer;

  // Create SOL mint (9 decimals)
  mintSOL = await createMint(
    // @ts-ignore
    banksClient,
    signer,
    signer.publicKey,
    null,
    9
  );

  // Derive PDAs
  [solBankAccount] = PublicKey.findProgramAddressSync(
    [mintSOL.toBuffer()],
    program.programId
  );

  [solTreasuryAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mintSOL.toBuffer()],
    program.programId
  );

  [userAccount] = PublicKey.findProgramAddressSync(
    [signer.publicKey.toBuffer()],
    program.programId
  );

  it("init user", async () => {
    await program.methods
      .initUser(mintSOL) // use SOL mint as placeholder usdc_address
      .accounts({ signer: signer.publicKey })
      .rpc({ commitment: "confirmed" });
  });

  it("init SOL bank and fund treasury", async () => {
    await program.methods
      .initBank(new BN(80), new BN(75))
      .accounts({ signer: signer.publicKey, mint: mintSOL, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc({ commitment: "confirmed" });

    // Fund treasury with large liquidity
    const amount = new BN(1_000 * 10 ** 9); // 1000 SOL
    await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      solTreasuryAccount,
      signer,
      amount
    );
  });

  it("create user SOL ATA and deposit", async () => {
    solTokenAccount = await createAccount(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      signer.publicKey
    );

    // Give user SOL to deposit
    await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      solTokenAccount,
      signer,
      new BN(50 * 10 ** 9) // 50 SOL
    );

    // Deposit 10 SOL as collateral
    await program.methods
      .deposit(new BN(10 * 10 ** 9))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  });

  it("borrow, advance time, borrow again => interest accrued", async () => {
    // Initial borrow to create debt
    const firstBorrow = new BN(1 * 10 ** 9); // 1 SOL
    await program.methods
      .borrow(firstBorrow)
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
        priceUpdate: solUsdPriceFeedAccount,
      })
      .rpc({ commitment: "confirmed" });

    const before = await program.account.bank.fetch(solBankAccount);
    const totalBorrowedBefore = before.totalBorrowed.toNumber();

    // Advance ~3.65 days (~1% of a year) to accrue noticeable interest
    await bankrunContextWrapper.moveTimeForward(3153600);

    // Trigger accrual via a tiny additional borrow
    const secondBorrow = new BN(1_000_000); // 0.001 SOL
    await program.methods
      .borrow(secondBorrow)
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
        priceUpdate: solUsdPriceFeedAccount,
      })
      .rpc({ commitment: "confirmed" });

    const after = await program.account.bank.fetch(solBankAccount);
    const totalBorrowedAfter = after.totalBorrowed.toNumber();

    const principalAdded = firstBorrow.toNumber() + secondBorrow.toNumber();
    if (totalBorrowedAfter <= totalBorrowedBefore + (secondBorrow.toNumber())) {
      throw new Error("Interest did not accrue as expected");
    }

    // Soft assertion: growth should exceed only the second principal
    if (totalBorrowedAfter <= totalBorrowedBefore) {
      throw new Error("totalBorrowed did not increase");
    }
  });
});


