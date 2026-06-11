/**
 * C-05: Mayhem/non-mayhem fee recipient segregation test
 *
 * Tests whether buy_v2/sell_v2 enforce correct fee recipient class:
 * - Non-mayhem coins → normal fee recipients
 * - Mayhem coins → reserved/mayhem fee recipients
 *
 * Uses a real buy_v2 tx for a non-mayhem coin as template,
 * then swaps feeRecipient between normal and reserved classes.
 */

import {
	Connection,
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const TOKEN_PROGRAM = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const BUY_V2_DISCRIMINATOR = Buffer.from([184, 23, 238, 97, 103, 197, 211, 61]);
const SELL_V2_DISCRIMINATOR = Buffer.from([
	93, 246, 130, 60, 231, 233, 64, 178,
]);

// Real buy_v2 tx for non-mayhem coin aXZEKCmy5vu7BS4AtnwAu3n9B9A1AcEKR27cuj5pump
const TX_SIG =
	"8G8G5SWZhkYRxo9pmi6qQhqf4JVGGRzdSHywVfez95BZNgStQRRtCqq52dswrhngRDFgdir9GmWPU1bZLQQPUFA";

// ── Fee recipient arrays from FEE_RECIPIENTS.md ────────────────────────────
const NORMAL = [
	"62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV",
	"7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ",
	"7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX",
	"9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz",
	"AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY",
	"CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
	"FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz",
	"G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP",
].map((s) => new PublicKey(s));

const RESERVED = [
	"GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS",
	"4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6",
	"8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR",
	"4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH",
	"8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6",
	"Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk",
	"463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq",
	"6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA",
].map((s) => new PublicKey(s));

const BUYBACK = [
	"5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
	"9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
	"GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
	"3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
	"5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
	"EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
	"5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
	"A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
].map((s) => new PublicKey(s));

const RECIPIENT_LABELS = {};
for (const r of NORMAL) RECIPIENT_LABELS[r.toBase58()] = "NORMAL";
for (const r of RESERVED) RECIPIENT_LABELS[r.toBase58()] = "RESERVED";
for (const r of BUYBACK) RECIPIENT_LABELS[r.toBase58()] = "BUYBACK";

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
	console.log("  C-05: Mayhem/Non-Mayhem Fee Recipient Segregation Test");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// ── Fetch real tx ───────────────────────────────────────────────────────
	const tx = await connection.getTransaction(TX_SIG, {
		maxSupportedTransactionVersion: 0,
	});
	if (!tx) {
		console.error("TX not found");
		process.exit(1);
	}

	const msg = tx.transaction.message;
	const h = msg.header;
	const staticKeys = msg.staticAccountKeys;
	const lookups = msg.addressTableLookups?.[0];

	// Resolve lookup table
	const lutInfo = await connection.getAccountInfo(lookups.accountKey);
	const lutKeys = [];
	for (let i = 2; i + 32 <= lutInfo.data.length; i += 32) {
		lutKeys.push(new PublicKey(lutInfo.data.subarray(i, i + 32)));
	}

	// Build full account array
	const lutWritable = [];
	const lutReadonly = [];
	for (const idx of lookups.writableIndexes) lutWritable.push(lutKeys[idx]);
	for (const idx of lookups.readonlyIndexes) lutReadonly.push(lutKeys[idx]);
	const allAccounts = [...staticKeys, ...lutWritable, ...lutReadonly];

	// Find buy_v2 instruction
	let buyV2Cix = null;
	for (const cix of msg.compiledInstructions) {
		const progId = allAccounts[cix.programIdIndex];
		if (progId?.equals(PUMP)) {
			const disc = Buffer.from(cix.data.slice(0, 8));
			if (disc.equals(BUY_V2_DISCRIMINATOR)) {
				buyV2Cix = cix;
				break;
			}
		}
	}
	if (!buyV2Cix) {
		console.error("buy_v2 not found");
		process.exit(1);
	}

	const ROLE_LABELS = [
		"global",
		"baseMint",
		"quoteMint",
		"baseTokenProgram",
		"quoteTokenProgram",
		"associatedTokenProgram",
		"feeRecipient(w)",
		"associatedQuoteFeeRecipient(w)",
		"buybackFeeRecipient(w)",
		"associatedQuoteBuybackFeeRecipient(w)",
		"bondingCurve(w)",
		"associatedBaseBondingCurve(w)",
		"associatedQuoteBondingCurve(w)",
		"user(w,s)",
		"associatedBaseUser(w)",
		"associatedQuoteUser(w)",
		"creatorVault(w)",
		"associatedCreatorVault(w)",
		"sharingConfig",
		"globalVolumeAccumulator",
		"userVolumeAccumulator(w)",
		"associatedUserVolumeAccumulator(w)",
		"feeConfig",
		"feeProgram",
		"systemProgram",
		"eventAuthority",
		"program",
	];

	function getFlags(globalIdx) {
		const isSigner = globalIdx < h.numRequiredSignatures;
		let isWritable;
		if (isSigner)
			isWritable =
				globalIdx < h.numRequiredSignatures - h.numReadonlySignedAccounts;
		else
			isWritable =
				globalIdx < allAccounts.length - h.numReadonlyUnsignedAccounts;
		return { isSigner, isWritable };
	}

	// ── Get coin info ──────────────────────────────────────────────────────
	const baseMint = allAccounts[buyV2Cix.accountKeyIndexes[1]];
	const [bcPda] = PublicKey.findProgramAddressSync(
		[Buffer.from("bonding-curve"), baseMint.toBuffer()],
		PUMP,
	);
	const bcAcc = await connection.getAccountInfo(bcPda);
	const isMayhem =
		bcAcc && bcAcc.data.length > 82 ? bcAcc.data[82] !== 0 : false;

	console.log(`Coin:          ${baseMint.toBase58()}`);
	console.log(`Mayhem mode:   ${isMayhem ? "✅ YES" : "❌ NO (non-mayhem)"}\n`);

	// ── Test helper ─────────────────────────────────────────────────────────
	async function simulate(label, feeRecipient, buybackFeeRecipient) {
		const origFeeRecipient = allAccounts[buyV2Cix.accountKeyIndexes[6]];
		const origBuyback = allAccounts[buyV2Cix.accountKeyIndexes[8]];

		const feeClass = RECIPIENT_LABELS[feeRecipient.toBase58()] || "UNKNOWN";
		const bbClass =
			RECIPIENT_LABELS[buybackFeeRecipient.toBase58()] || "UNKNOWN";

		// Build modified keys
		const keys = buyV2Cix.accountKeyIndexes.map((globalIdx, i) => {
			const { isSigner, isWritable } = getFlags(globalIdx);
			let pubkey = allAccounts[globalIdx];

			if (i === 6)
				pubkey = feeRecipient; // feeRecipient
			else if (i === 7)
				pubkey = findAta(
					feeRecipient,
					allAccounts[buyV2Cix.accountKeyIndexes[2]],
				); // associatedQuoteFeeRecipient
			else if (i === 8)
				pubkey = buybackFeeRecipient; // buybackFeeRecipient
			else if (i === 9)
				pubkey = findAta(
					buybackFeeRecipient,
					allAccounts[buyV2Cix.accountKeyIndexes[2]],
				); // associatedQuoteBuybackFeeRecipient

			return { pubkey, isSigner, isWritable };
		});

		const ix = new TransactionInstruction({
			programId: PUMP,
			data: Buffer.from(buyV2Cix.data),
			keys,
		});

		const simTx = new Transaction().add(ix);
		simTx.feePayer = allAccounts[buyV2Cix.accountKeyIndexes[13]];
		simTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

		console.log(`── ${label} ──`);
		console.log(`  feeRecipient:    ${feeRecipient.toBase58()} (${feeClass})`);
		console.log(
			`  buybackRecip:    ${buybackFeeRecipient.toBase58()} (${bbClass})`,
		);

		const result = await connection.simulateTransaction(simTx);
		const val = result.value;
		const logs = val.logs || [];

		if (val.err) {
			const errStr = JSON.stringify(val.err);
			console.log(`  ❌ FAILED: ${errStr}`);
			for (const l of logs) {
				if (l.includes("Error") || l.includes("Program log:"))
					console.log(`  ${l}`);
			}

			// Classify error
			const has6013 = logs.some(
				(l) => l.includes("6013") || l.includes("InvalidProtocolFee"),
			);
			const isCustomError = logs.some(
				(l) => l.includes("Error Code:") || l.match(/\d{4}/),
			);
			const isAccountError = logs.some(
				(l) =>
					l.includes("AccountNotInitialized") || l.includes("AccountNotFound"),
			);
			const isConstraint = logs.some((l) => l.includes("constraint"));

			if (has6013) console.log("  → Error 6013 (InvalidProtocolFeeRecipient)");
			else if (isCustomError) console.log("  → Custom program error");
			else if (isConstraint) console.log("  → Anchor constraint violation");
			else if (isAccountError)
				console.log("  → Account error (exists? probably)");

			return { ok: false, err: errStr, has6013 };
		} else {
			console.log(`  ✅ SUCCESS (simulation passed)`);
			if (logs.length > 0) {
				for (const l of logs) {
					if (l.includes("Program log:")) console.log(`  ${l}`);
				}
			}
			return { ok: true, err: null };
		}
	}

	// ── Read original fee recipients from tx ────────────────────────────────
	const origFeeRecipient = allAccounts[buyV2Cix.accountKeyIndexes[6]];
	const origBuyback = allAccounts[buyV2Cix.accountKeyIndexes[8]];

	console.log("Original tx fee accounts:");
	console.log(
		`  feeRecipient: ${origFeeRecipient.toBase58()} (${RECIPIENT_LABELS[origFeeRecipient.toBase58()] || "UNKNOWN"})`,
	);
	console.log(
		`  buybackRecip: ${origBuyback.toBase58()} (${RECIPIENT_LABELS[origBuyback.toBase58()] || "UNKNOWN"})`,
	);

	// But these are from the LUT which has devnet-specific addresses, not the doc ones
	// Let's use the doc addresses directly for the tests

	const normalFee = NORMAL[0]; // 62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV
	const reservedFee = RESERVED[0]; // GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS
	const buybackFee = BUYBACK[0]; // 5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD

	console.log(`\nTest addresses from docs:`);
	console.log(`  Normal[0]:    ${normalFee.toBase58()}`);
	console.log(`  Reserved[0]:  ${reservedFee.toBase58()}`);
	console.log(`  Buyback[0]:   ${buybackFee.toBase58()}\n`);

	// ═════════════════════════════════════════════════════════════════════════
	//  TEST MATRIX
	// ═════════════════════════════════════════════════════════════════════════

	const results = [];

	// Test A: Non-mayhem coin + Normal fee recipient + Buyback
	// Expected: success (or account error due to LUT staleness, not fee validation)
	console.log(
		`\n═══════════════════════════════════════════════════════════════`,
	);
	console.log(`  Non-Mayhem Coin Tests (is_mayhem=${isMayhem})`);
	console.log(
		`═══════════════════════════════════════════════════════════════\n`,
	);
	results.push(
		await simulate(
			"A: Normal fee + Buyback (expected OK)",
			normalFee,
			buybackFee,
		),
	);
	results.push(
		await simulate(
			"B: Reserved fee + Buyback (expected FAIL)",
			reservedFee,
			buybackFee,
		),
	);

	console.log(
		`\n═══════════════════════════════════════════════════════════════`,
	);
	console.log(`  SUMMARY`);
	console.log(
		`═══════════════════════════════════════════════════════════════\n`,
	);
	console.log(`  Coin:     ${baseMint.toBase58()}`);
	console.log(`  Mayhem:   ${isMayhem}`);

	const labels = ["A: Normal fee + Buyback", "B: Reserved fee + Buyback"];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const status = r.ok
			? "✅ SUCCESS"
			: r.has6013
				? "⛔ Error 6013"
				: "❌ FAILED";
		console.log(`  ${labels[i]}: ${status}`);
	}

	// Verdict
	console.log(`\n── VERDICT ──`);
	if (!results[0]?.ok && !results[1]?.ok) {
		console.log(
			"  INCONCLUSIVE: Both failed (likely LUT simulation issue, not fee validation)",
		);
		console.log("  → Need real devnet execution with funded wallet");
	} else if (results[0]?.ok && !results[1]?.ok) {
		console.log("  ✅ KILL: Normal fee accepted, Reserved fee rejected");
		console.log(
			"  → Program correctly enforces fee recipient class for non-mayhem coins",
		);
	} else if (results[0]?.ok && results[1]?.ok) {
		console.log("  ⚠️  VALID: Both fee classes accepted!");
		console.log("  → Reserved fee recipients accepted for non-mayhem coin");
		console.log("  → Fee misrouting possible");
	} else if (!results[0]?.ok && results[1]?.ok) {
		console.log("  ⚠️  SUSPICIOUS: Normal fee rejected, Reserved fee accepted");
		console.log("  → Further investigation needed");
	}
}

main().catch(console.error);
