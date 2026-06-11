import {
	Connection,
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PUMP_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

// Real buy tx on Devnet
const BUY_TX_SIG =
	"2wy1wsCG7sE8wm5XWqTkqMm6HVdkvAdX4QawScRYbbNY2hkFMV1DhYLjo1AAzDdVCWMna1ArmvMy783y2ge5V62T";

const VALID_RECIPIENTS = [
	"12e2F4DKkD3Lff6WPYsU7Xd76SHPEyN9T8XSsTJNF8oT",
	"2Ej38XSkmpvXzoUg5ZLma7Y9rCiZVgxzTdvE3Kph5juM",
	"3PAxmkxnM2vHno9amWQCsaaFjYnPGcD87HZGx1ChVjPj",
	"4QZqaBNm2F7viBDhhs8AQ5wC9FshgLJEiLLFGoxZZrTn",
	"9xvDPD6G7NRCEu7W2M9vCLeo8we23Ww7pzQEhXcuJAmA",
	"CdkG7sp1LT9YLsDaTWREaQcX6W4gZySk3o1eSjoL2uTh",
	"Freijj9xKLefjrb5fHgT6KMbYG1XBP2mA83tqeXYUMYM",
	"Hxzab4UjjVH2KjsdAqzdxGdYUpNN5FKhpu7iikB869uH",
].map((s) => new PublicKey(s));

const INVALID_RECIPIENT = new PublicKey("11111111111111111111111111111111");

async function main() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  PoC 2: Pump.fun Error 6013 Simulation Test");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// ─── Extract account layout from real buy tx ─────────────────────────────
	const result = await connection.getTransaction(BUY_TX_SIG, {
		maxSupportedTransactionVersion: 0,
	});
	if (!result) {
		console.log("❌ Tx not found");
		process.exit(1);
	}

	const msg = result.transaction.message;
	const h = msg.header;

	// Determine writable/signer from header
	function getFlags(idx) {
		const isSigner = idx < h.numRequiredSignatures;
		let isWritable;
		if (isSigner) {
			isWritable = idx < h.numRequiredSignatures - h.numReadonlySignedAccounts;
		} else {
			isWritable =
				idx < msg.staticAccountKeys.length - h.numReadonlyUnsignedAccounts;
		}
		return { isSigner, isWritable };
	}

	// Find AMM compiled instruction
	let ammCix = null;
	for (const cix of msg.compiledInstructions || []) {
		if (msg.staticAccountKeys[cix.programIdIndex]?.equals(PUMP_AMM)) {
			ammCix = cix;
			break;
		}
	}
	if (!ammCix) {
		console.log("❌ No AMM ix");
		process.exit(1);
	}

	const ATA_PROG = new PublicKey(
		"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
	);
	const TOKEN_PROG = new PublicKey(
		"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
	);
	const quoteMint = msg.staticAccountKeys[ammCix.accountKeyIndexes[4]];

	// USE THE FEE RECIPIENT'S WSOL ATA as user_quote_token_account
	// This account EXISTS and is a valid TokenAccount (owned by Token program)
	// Anchor will deserialize it successfully, letting us reach the instruction body
	const EXISTING_WSOL_ATA = new PublicKey(
		"2daQRytJgLzLLziPNQBNJ7w1Ltz3XqZG4dZxBamLAf7v",
	);

	function buildKeys(feeRecipient) {
		// Compute new fee recipient ATA using the fee recipient's own WSOL ATA
		// (since we're using the existing one as a proxy, we need a different one for the fee)
		const [newFeeRecipientAta] = PublicKey.findProgramAddressSync(
			[feeRecipient.toBuffer(), TOKEN_PROG.toBuffer(), quoteMint.toBuffer()],
			ATA_PROG,
		);

		return ammCix.accountKeyIndexes.map((globalIdx, i) => {
			const { isSigner, isWritable: origWritable } = getFlags(globalIdx);
			let pubkey = msg.staticAccountKeys[globalIdx];

			// Replace fee recipient (ix index 9) and its ATA (ix index 10)
			if (i === 9) pubkey = feeRecipient;
			if (i === 10) pubkey = newFeeRecipientAta;

			// KEY TRICK: Replace user_quote_token_account (ix index 6) with an EXISTING WSOL ATA
			// This is the fee recipient's own WSOL ATA - it exists and is a valid TokenAccount
			if (i === 6) pubkey = EXISTING_WSOL_ATA;

			return { pubkey, isSigner, isWritable: origWritable };
		});
	}

	// ─── Simulate ────────────────────────────────────────────────────────────
	async function simulate(label, feeRecipient) {
		const keys = buildKeys(feeRecipient);
		const ix = new TransactionInstruction({
			programId: PUMP_AMM,
			data: Buffer.from(ammCix.data),
			keys,
		});

		const userPubkey = msg.staticAccountKeys[ammCix.accountKeyIndexes[1]];
		const tx = new Transaction().add(ix);
		tx.feePayer = userPubkey;
		const { blockhash } = await connection.getLatestBlockhash();
		tx.recentBlockhash = blockhash;

		console.log(`── ${label} ──`);
		console.log(`   Fee recipient: ${feeRecipient.toBase58()}`);

		try {
			const simResult = await connection.simulateTransaction(tx);
			const val = simResult.value;

			if (val.err) {
				const errStr = JSON.stringify(val.err);
				console.log(`   ⛔ FAILED: ${errStr}`);
				if (val.logs) {
					val.logs.forEach((l) => {
						if (l.includes("Error") || l.includes("Program log:"))
							console.log(`   📝 ${l}`);
					});
					// Check for 6013 in ANY log
					const has6013 = val.logs.some(
						(l) => l.includes("6013") || l.includes("InvalidProtocolFee"),
					);
					if (has6013)
						console.log(
							`   ✅ CONFIRMED: Error 6013 (InvalidProtocolFeeRecipient)!`,
						);
					console.log(`   📝 ${val.logs.length} log lines`);
				}
			} else {
				console.log(`   ✅ SUCCESS`);
				if (val.logs) console.log(`   📝 ${val.logs.length} log lines`);
			}
			return val;
		} catch (e) {
			console.log(`   ❌ EXCEPTION: ${e.message}`);
			return null;
		}
	}

	// ─── Run tests ─────────────────────────────────────────────────────────
	const origRecipient = msg.staticAccountKeys[ammCix.accountKeyIndexes[9]];
	const rA = await simulate("A: Buy+VALID(orig)", origRecipient);
	console.log();
	await new Promise((r) => setTimeout(r, 1000));
	const rB = await simulate("B: Buy+VALID(diff)", VALID_RECIPIENTS[1]);
	console.log();
	await new Promise((r) => setTimeout(r, 1000));
	const rC = await simulate("C: Buy+INVALID", INVALID_RECIPIENT);

	// ─── Results ─────────────────────────────────────────────────────────────
	console.log("\n" + "═".repeat(66));
	console.log("\n── RESULTS ──\n");

	function analyze(r) {
		if (!r) return { l: "❌ NO RESULT", e: false };
		if (!r.err) return { l: "✅ SUCCESS", e: false };
		const has6013 = r.logs
			? r.logs.some(
					(l) => l.includes("6013") || l.includes("InvalidProtocolFee"),
				)
			: false;
		const s = JSON.stringify(r.err);
		return { l: has6013 ? "⛔ Error 6013" : `⛔ ${s}`, e: has6013, has6013 };
	}

	const results = [
		["A (orig valid)", rA],
		["B (other valid)", rB],
		["C (INVALID)", rC],
	];
	for (const [name, r] of results)
		console.log(`  ${name.padEnd(22)} ${analyze(r).l}`);

	const rCcls = analyze(rC);
	console.log("\n── VERDICT ──");
	if (rCcls.has6013) {
		console.log("  ✅ PASS: AMM ENFORCES protocol_fee_recipient validation!");
		console.log("  Invalid fee recipient triggers Error 6013.");
	} else {
		console.log("  ⚠️  INCONCLUSIVE");
	}

	console.log("\n── ALL LOGS ──\n");
	for (const [name, r] of [
		["A", rA],
		["B", rB],
		["C", rC],
	]) {
		if (r?.logs) {
			console.log(`[${name}]`);
			r.logs.forEach((l, i) => console.log(`  ${i}: ${l}`));
			console.log();
		}
	}
}

main().catch(console.error);
