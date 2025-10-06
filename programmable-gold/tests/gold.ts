import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

// Helpers to derive PDAs
const seed = (s: string) => Buffer.from(s);

describe("gold", () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  anchor.setProvider(provider);

  const program = (anchor.workspace as any).Gold as any;

  const pythSolanaReceiver = new PythSolanaReceiver({ connection, wallet });
  const GOLD_PRICE_FEED_ID =
    "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
  const SOL_PRICE_FEED_ID =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
  
  const goldUsdPriceFeedAccount = pythSolanaReceiver
    .getPriceFeedAccountAddress(0, GOLD_PRICE_FEED_ID)
    .toBase58();
  const solUsdPriceFeedAccount = pythSolanaReceiver
    .getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID)
    .toBase58();

  console.log("GOLD/USD PriceUpdateV2 account:", goldUsdPriceFeedAccount, "https://explorer.solana.com/address/" + goldUsdPriceFeedAccount + "?cluster=devnet");
  console.log("SOL/USD PriceUpdateV2 account:", solUsdPriceFeedAccount, "https://explorer.solana.com/address/" + solUsdPriceFeedAccount + "?cluster=devnet");

  const [configAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [seed("config")],
    program.programId
  );
  const [mintAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [seed("mint")],
    program.programId
  );
  const [collateralAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [seed("collateral"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const [solAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [seed("sol"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const tokenAccount = getAssociatedTokenAddressSync(
    mintAccount,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const systemProgram = anchor.web3.SystemProgram.programId;
  const tokenProgram = TOKEN_2022_PROGRAM_ID;
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID;

  it("Is initialized!", async () => {
    const existing = await connection.getAccountInfo(configAccount);
    if (existing) {
      console.log("Config already initialized, skipping initializeConfig");
      return;
    }
    const tx = await program.methods
      .initializeConfig()
      .accounts({
        authority: wallet.publicKey,
        configAccount,
        mintAccount,
        tokenProgram,
        systemProgram,
      })
      .signers([])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Deposit Collateral and Mint GOLD", async () => {
    const amountCollateral = 1_000_000_000; // 1 SOL collateral
    const amountToMint = 100_000; // mint very small amount to satisfy health factor
    const tx = await program.methods
      .depositCollateralAndMint(new BN(amountCollateral), new BN(amountToMint))
      .accounts({
        depositor: wallet.publicKey,
        configAccount,
        collateralAccount,
        solAccount,
        mintAccount,
        goldPriceUpdate: goldUsdPriceFeedAccount,
        solPriceUpdate: solUsdPriceFeedAccount,
        tokenAccount,
        tokenProgram,
        associatedTokenProgram,
        systemProgram,
      })
      .signers([])
      .rpc();
    console.log("Your transaction signature", tx, "https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });

  it("Redeem Collateral and Burn GOLD", async () => {
    const amountCollateral = 50_000_000; // withdraw 0.05 SOL
    const amountToBurn = 50_000; // burn <= minted amount
    const tx = await program.methods
      .redeemCollateralAndBurnTokens(new BN(amountCollateral), new BN(amountToBurn))
      .accounts({
        depositor: wallet.publicKey,
        goldPriceUpdate: goldUsdPriceFeedAccount,
        solPriceUpdate: solUsdPriceFeedAccount,
        configAccount,
        collateralAccount,
        solAccount,
        mintAccount,
        tokenAccount,
        tokenProgram,
        systemProgram,
      })
      .signers([])
      .rpc();
    console.log("Your transaction signature", tx, "https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });

  // Increase minimum health threshold to test liquidate
  it("Update Config", async () => {
    // Set very high min_health_factor to force unhealthy state
    const tx = await program.methods
      .updateConfig(new BN(1_000_000_000))
      .accounts({ configAccount })
      .rpc();
    console.log("Your transaction signature", tx, "https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });

  it("Liquidate", async () => {
    const amountToBurn = 25_000; // keep burn small and <= remaining minted
    const tx = await program.methods
      .liquidate(new BN(amountToBurn))
      .accounts({
        liquidator: wallet.publicKey,
        goldPriceUpdate: goldUsdPriceFeedAccount,
        solPriceUpdate: solUsdPriceFeedAccount,
        configAccount,
        collateralAccount,
        solAccount,
        mintAccount,
        tokenAccount,
        tokenProgram,
        systemProgram,
      })
      .signers([])
      .rpc();
    console.log("Your transaction signature", tx, "https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });

  it("Update Config", async () => {
    const tx = await program.methods
      .updateConfig(new BN(1))
      .accounts({ configAccount })
      .rpc();
    console.log("Your transaction signature", tx, "https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  });
});
