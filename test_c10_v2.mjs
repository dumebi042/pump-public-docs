/**
 * C-10: buy_v2 quoteMint validation — Test V2
 *
 * Uses a real buy_v2 transaction from devnet as template, replacing the
 * quoteMint with a fake mint and all derived quote ATAs.
 *
 * We don't need a funded wallet because we're SIMULATING a transaction
 * that was ALREADY SIGNED by the original user.
 */

import {
	Connection,
	PublicKey,
	Keypair,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const TOKEN_PROGRAM = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const BUY_V2_DISCRIMINATOR = Buffer.from([184, 23, 238, 97, 103, 197, 211, 61]);

// Real buy_v2 tx on devnet
const TX_SIG =
	"8G8G5SWZhkYRxo9pmi6qQhqf4JVGGRzdSHywVfez95BZNgStQRRtCqq52dswrhngRDFgdir9GmWPU1bZLQQPUFA";

// Known addresses from the LUT resolved above
const LUT_QUOTE_MINT = new PublicKey(
	"68eLT8kiFUQAY4VPFYBt78AaVveL5PDCNuBWfa9ECGKo",
);
const LUT_FEE_RECIPIENT = new PublicKey(
	"DVXhcWHyCeUmCmyR211dHwEfCAYWwU2EizmgnFoCWAG6",
);
const LUT_ASSOC_QUOTE_FEE_RECIPIENT = new PublicKey(
	"8Ryd9rXJF7rX7BrwD1gA9ey9irpZuALDnxZuUz24DxRo",
);
const LUT_BUYBACK_FEE_RECIPIENT = new PublicKey(
	"GAFuYLMfwsUbnrgvy7F49UgWFDN8vmuRr4fjaRmMxWtc",
);
const LUT_ASSOC_CREATOR_VAULT = new PublicKey(
	"8gdPMZrXdwWrTHq6tqZS28UFasZN3jxnurvcdpq749Gx",
);

// The fake mint — a random ed25519 pubkey that has no real tokens
const FAKE_MINT = Keypair.generate().publicKey;

function findAta(owner, mint) {
	return PublicKey.findProgramAddressSync(
		[owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
		ASSOCIATED_TOKEN_PROGRAM,
	)[0];
}

async function main() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  C-10 V2: buy_v2 quoteMint Validation (real tx template)");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const tx = await connection.getTransaction(TX_SIG, {
		maxSupportedTransactionVersion: 0,
	});
	if (!tx) {
		console.error("❌ Transaction not found");
		process.exit(1);
	}

	const msg = tx.transaction.message;
	const h = msg.header;
	const allAccounts = [...msg.staticAccountKeys];

	// Resolve lookup table
	const lutAcc = msg.addressTableLookups?.[0];
	if (!lutAcc) {
		console.error("❌ No lookup table found");
		process.exit(1);
	}
	const lutInfo = await connection.getAccountInfo(lutAcc.accountKey);
	if (!lutInfo) {
		console.error("❌ LUT not found");
		process.exit(1);
	}
	const lutKeys = [];
	for (let i = 2; i + 32 <= lutInfo.data.length; i += 32) {
		lutKeys.push(new PublicKey(lutInfo.data.subarray(i, i + 32)));
	}

	// Build full account array: static keys + LUT keys
	const fullAccounts = [...allAccounts, ...lutKeys];

	// Find the buy_v2 compiled instruction
	let buyV2Cix = null;
	for (const cix of msg.compiledInstructions) {
		const progId = fullAccounts[cix.programIdIndex];
		if (progId?.equals(PUMP)) {
			const disc = Buffer.from(cix.data.slice(0, 8));
			if (disc.equals(BUY_V2_DISCRIMINATOR)) {
				buyV2Cix = cix;
				break;
			}
		}
	}
	if (!buyV2Cix) {
		console.error("❌ buy_v2 instruction not found");
		process.exit(1);
	}

	// Get signer/writable flags helper
	function getFlags(globalIdx) {
		const isSigner = globalIdx < h.numRequiredSignatures;
		let isWritable;
		if (isSigner) {
			isWritable =
				globalIdx < h.numRequiredSignatures - h.numReadonlySignedAccounts;
		} else {
			isWritable =
				globalIdx < fullAccounts.length - h.numReadonlyUnsignedAccounts;
		}
		return { isSigner, isWritable };
	}

	// IDL account roles for buy_v2 (27 accounts)
	const ROLE_LABELS = [
		"global",
		"baseMint",
		"quoteMint",
		"baseTokenProgram",
		"quoteTokenProgram",
		"associatedTokenProgram",
		"feeRecipient",
		"associatedQuoteFeeRecipient",
		"buybackFeeRecipient",
		"associatedQuoteBuybackFeeRecipient",
		"bondingCurve",
		"associatedBaseBondingCurve",
		"associatedQuoteBondingCurve",
		"user",
		"associatedBaseUser",
		"associatedQuoteUser",
		"creatorVault",
		"associatedCreatorVault",
		"sharingConfig",
		"globalVolumeAccumulator",
		"userVolumeAccumulator",
		"associatedUserVolumeAccumulator",
		"feeConfig",
		"feeProgram",
		"systemProgram",
		"eventAuthority",
		"program",
	];

	// Build key arrays for two scenarios
	function buildKeys(quoteMint) {
		return buyV2Cix.accountKeyIndexes.map((globalIdx, i) => {
			const pk = fullAccounts[globalIdx];
			const role = ROLE_LABELS[i];
			const { isSigner, isWritable: origWritable } = getFlags(globalIdx);

			let pubkey = pk;

			// For the WRONG quote mint test, replace:
			// - quoteMint (index 2)
			// - all ATAs derived from quoteMint
			if (i === 2) {
				// Replace quoteMint
				pubkey = quoteMint;
			} else if (i === 7) {
				// associatedQuoteFeeRecipient: ATA(feeRecipient, quoteTP, quoteMint)
				const feeRecipientAddr = fullAccounts[buyV2Cix.accountKeyIndexes[6]];
				pubkey = findAta(feeRecipientAddr, quoteMint);
			} else if (i === 9) {
				// associatedQuoteBuybackFeeRecipient: ATA(buybackFeeRecipient, quoteTP, quoteMint)
				const buybackAddr = fullAccounts[buyV2Cix.accountKeyIndexes[8]];
				pubkey = findAta(buybackAddr, quoteMint);
			} else if (i === 12) {
				// associatedQuoteBondingCurve: ATA(bondingCurve, quoteTP, quoteMint)
				const bcAddr = fullAccounts[buyV2Cix.accountKeyIndexes[10]];
				pubkey = findAta(bcAddr, quoteMint);
			} else if (i === 15) {
				// associatedQuoteUser: ATA(user, quoteTP, quoteMint)
				const userAddr = fullAccounts[buyV2Cix.accountKeyIndexes[13]];
				pubkey = findAta(userAddr, quoteMint);
			} else if (i === 17) {
				// associatedCreatorVault: ATA(creatorVault, quoteTP, quoteMint)
				const creatorVaultAddr = fullAccounts[buyV2Cix.accountKeyIndexes[16]];
				pubkey = findAta(creatorVaultAddr, quoteMint);
			} else if (i === 21) {
				// associatedUserVolumeAccumulator: ATA(userVolAcc, quoteTP, quoteMint)
				const userVolAccAddr = fullAccounts[buyV2Cix.accountKeyIndexes[20]];
				pubkey = findAta(userVolAccAddr, quoteMint);
			}

			return { pubkey, isSigner, isWritable: origWritable };
		});
	}

	// ─── Test A: Original (CORRECT quoteMint) ──────────────────────────────
	console.log("── Test A: Original quoteMint (correct) ──\n");
	console.log(`Original quoteMint: ${LUT_QUOTE_MINT.toBase58()}\n`);

	const origKeys = buildKeys(LUT_QUOTE_MINT);
	const origIx = new TransactionInstruction({
		programId: PUMP,
		data: Buffer.from(buyV2Cix.data),
		keys: origKeys,
	});

	const origTx = new Transaction().add(origIx);
	origTx.feePayer = fullAccounts[buyV2Cix.accountKeyIndexes[13]];
	origTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	console.log("Simulating ORIGINAL tx...");
	const origSim = await connection.simulateTransaction(origTx);
	const origOk = !origSim.value.err;
	console.log(
		`  Result: ${origOk ? "✅ SUCCESS" : `❌ FAILED: ${JSON.stringify(origSim.value.err)}`}`,
	);
	if (origSim.value.logs) {
		for (const l of origSim.value.logs) {
			if (l.includes("Program log:") || l.includes("Error"))
				console.log(`  ${l}`);
		}
	}

	// ─── Test B: Wrong quoteMint ──────────────────────────────────────────
	console.log("\n── Test B: FAKE quoteMint ──\n");
	console.log(`Fake quoteMint: ${FAKE_MINT.toBase58()}\n`);

	// Show what the wrong ATAs resolve to
	const userAddr = fullAccounts[buyV2Cix.accountKeyIndexes[13]];
	const bcAddr = fullAccounts[buyV2Cix.accountKeyIndexes[10]];
	const feeRecip = fullAccounts[buyV2Cix.accountKeyIndexes[6]];
	const buyback = fullAccounts[buyV2Cix.accountKeyIndexes[8]];
	const creatorVaultAddr = fullAccounts[buyV2Cix.accountKeyIndexes[16]];
	const userVolAddr = fullAccounts[buyV2Cix.accountKeyIndexes[20]];

	console.log("Wrong-mint ATA resolution:");
	console.log(
		`  associatedQuoteFeeRecipient:        ${findAta(feeRecip, FAKE_MINT).toBase58()}`,
	);
	console.log(
		`  associatedQuoteBuybackFeeRecipient: ${findAta(buyback, FAKE_MINT).toBase58()}`,
	);
	console.log(
		`  associatedQuoteBondingCurve:        ${findAta(bcAddr, FAKE_MINT).toBase58()}`,
	);
	console.log(
		`  associatedQuoteUser:                ${findAta(userAddr, FAKE_MINT).toBase58()}`,
	);
	console.log(
		`  associatedCreatorVault:             ${findAta(creatorVaultAddr, FAKE_MINT).toBase58()}`,
	);
	console.log(
		`  associatedUserVolumeAccumulator:    ${findAta(userVolAddr, FAKE_MINT).toBase58()}\n`,
	);

	const fakeKeys = buildKeys(FAKE_MINT);
	const fakeIx = new TransactionInstruction({
		programId: PUMP,
		data: Buffer.from(buyV2Cix.data),
		keys: fakeKeys,
	});

	const fakeTx = new Transaction().add(fakeIx);
	fakeTx.feePayer = fullAccounts[buyV2Cix.accountKeyIndexes[13]];
	fakeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	console.log("Simulating FAKE quoteMint tx...");
	const fakeSim = await connection.simulateTransaction(fakeTx);
	const fakeOk = !fakeSim.value.err;

	if (fakeOk) {
		console.log(`  ⚠️  SUCCESS — VALID FINDING!`);
		console.log(`  Units: ${fakeSim.value.unitsConsumed}`);
		if (fakeSim.value.logs) {
			for (const l of fakeSim.value.logs) {
				if (l.includes("Program log:")) console.log(`  ${l}`);
			}
		}
	} else {
		const errStr = JSON.stringify(fakeSim.value.err);
		console.log(`  ❌ FAILED: ${errStr}`);

		// Identify what killed it
		const logs = fakeSim.value.logs || [];
		for (const l of logs) {
			if (
				l.includes("Error") ||
				l.includes("Program log:") ||
				l.includes("constraint")
			) {
				console.log(`  ${l}`);
			}
		}

		// Check if it's a PDA constraint error
		const pdaError = logs.find((l) =>
			l.includes("A seeds constraint was violated"),
		);
		const accountError = logs.find(
			(l) =>
				l.includes("AccountNotInitialized") || l.includes("AccountNotFound"),
		);
		const customError = logs.find((l) => l.includes("Error Code:"));
		const programError = logs.find((l) => l.match(/Program log: Error/));

		console.log();
		if (pdaError) {
			console.log("  → KILL: Anchor PDA constraint caught wrong quote mint");
			console.log(`  ${pdaError}`);
		} else if (customError) {
			console.log(`  → KILL: Program custom error: ${customError}`);
		} else if (programError) {
			console.log(`  → KILL: Program rejected: ${programError}`);
		} else if (accountError) {
			console.log(
				`  → KILL: Account doesn't exist for wrong mint: ${accountError}`,
			);
		} else {
			console.log("  → Full logs:");
			logs.forEach((l, i) => console.log(`  [${i}] ${l}`));
		}
	}

	// ─── Verdict ──────────────────────────────────────────────────────────
	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("  VERDICT");
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);

	if (origOk && fakeOk) {
		console.log("  VALID: Both original AND fake quoteMint succeeded.");
		console.log(
			"  → The program does NOT validate quoteMint against bonding curve.",
		);
		console.log("  → Fee routing can be manipulated by changing quoteMint.");
	} else if (origOk && !fakeOk) {
		console.log("  KILL: Original succeeds, fake fails.");
		console.log("  → The program validates quoteMint.");
	} else if (!origOk) {
		console.log("  INCONCLUSIVE: Original tx also failed to simulate.");
		console.log("  → Cannot determine if validation exists.");
	}
}

main().catch(console.error);
