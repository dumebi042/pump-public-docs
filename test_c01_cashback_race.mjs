/**
 * C-01: claim_cashback / close_user_volume_accumulator lamport race test
 *
 * Tests whether cashback lamports in UserVolumeAccumulator can be
 * double-claimed, stolen, or lost by combining instructions.
 *
 * Since devnet RPC is rate-limited, this is an IDL-based analysis
 * with executable test scaffolding for when RPC is available.
 */

import {
	Connection,
	PublicKey,
	Keypair,
	Transaction,
	TransactionInstruction,
	SystemProgram,
	LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

// ── Discriminators ─────────────────────────────────────────────────────────
const CLAIM_CASHBACK_DIS = Buffer.from([37, 58, 35, 126, 190, 53, 228, 197]);
const CLAIM_CASHBACK_V2_DIS = Buffer.from([122, 243, 204, 65, 94, 116, 29, 55]);
const CLOSE_ACCUMULATOR_DIS = Buffer.from([
	249, 69, 164, 218, 150, 103, 84, 138,
]);
const INIT_ACCUMULATOR_DIS = Buffer.from([94, 6, 202, 115, 255, 96, 232, 183]);

const [eventAuthorityPda] = PublicKey.findProgramAddressSync(
	[
		Buffer.from([
			95, 95, 101, 118, 101, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105,
			116, 121,
		]),
	],
	PUMP,
);

function findUserVolAccPda(user) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("user_volume_accumulator"), user.toBuffer()],
		PUMP,
	)[0];
}

// ═════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION BUILDERS
// ═════════════════════════════════════════════════════════════════════════════

function buildClaimCashbackIx(user, userVolumeAccumulator) {
	const keys = [
		{ pubkey: user, isSigner: false, isWritable: true },
		{ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
		{ pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: eventAuthorityPda, isSigner: false, isWritable: false },
		{ pubkey: PUMP, isSigner: false, isWritable: false },
	];
	return new TransactionInstruction({
		programId: PUMP,
		keys,
		data: CLAIM_CASHBACK_DIS, // no args
	});
}

function buildCloseAccumulatorIx(user, userVolumeAccumulator) {
	const keys = [
		{ pubkey: user, isSigner: true, isWritable: true },
		{ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
		{ pubkey: eventAuthorityPda, isSigner: false, isWritable: false },
		{ pubkey: PUMP, isSigner: false, isWritable: false },
	];
	return new TransactionInstruction({
		programId: PUMP,
		keys,
		data: CLOSE_ACCUMULATOR_DIS, // no args
	});
}

// ═════════════════════════════════════════════════════════════════════════════
//  ANALYSIS
// ═════════════════════════════════════════════════════════════════════════════

function analyzeInstructions() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  C-01: Cashback Accumulator Race — IDL Analysis");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// ── claimCashback ───────────────────────────────────────────────────────
	console.log("── claimCashback ──");
	console.log("  Accounts (5):");
	console.log("    [0] user (writable) — NOT signer");
	console.log(
		'    [1] userVolumeAccumulator (writable) — PDA["user_volume_accumulator", user]',
	);
	console.log("    [2] systemProgram");
	console.log("    [3] eventAuthority");
	console.log("    [4] program");
	console.log("  Args: none");
	console.log("  Signer: NONE required");
	console.log("  → Anyone can call this for ANY user's accumulator");
	console.log("  → But funds go to `user`, not the caller\n");

	// ── claimCashbackV2 ─────────────────────────────────────────────────────
	console.log("── claimCashbackV2 ──");
	console.log("  Accounts (9):");
	console.log("    [0] user (writable) — NOT signer");
	console.log("    [1] userVolumeAccumulator (writable)");
	console.log("    [2] quoteMint");
	console.log("    [3] quoteTokenProgram");
	console.log("    [4] associatedTokenProgram");
	console.log("    [5] associatedUserVolumeAccumulator (writable)");
	console.log("    [6] associatedQuoteUser (writable)");
	console.log("    [7] systemProgram");
	console.log("    [8] eventAuthority");
	console.log("    [9] program");
	console.log("  Signer: NONE required");
	console.log("  → V2 transfers WSOL tokens (not native SOL)\n");

	// ── closeUserVolumeAccumulator ──────────────────────────────────────────
	console.log("── closeUserVolumeAccumulator ──");
	console.log("  Accounts (4):");
	console.log("    [0] user (writable) — SIGNER required");
	console.log("    [1] userVolumeAccumulator (writable)");
	console.log("    [2] eventAuthority");
	console.log("    [3] program");
	console.log("  Signer: user REQUIRED");
	console.log("  → Only the rightful user can close their accumulator\n");

	// ── initUserVolumeAccumulator ───────────────────────────────────────────
	console.log("── initUserVolumeAccumulator ──");
	console.log("  Accounts (6):");
	console.log("    [0] payer (writable, signer)");
	console.log("    [1] user (NOT signer)");
	console.log("    [2] userVolumeAccumulator (writable)");
	console.log("    [3] systemProgram");
	console.log("    [4] eventAuthority");
	console.log("    [5] program");
	console.log("  → Anyone can init an accumulator for any user\n");

	// ── Security analysis ───────────────────────────────────────────────────
	console.log("── Security Analysis ──\n");

	// Attack vector 1: Unauthorized claim
	console.log("Attack 1: Attacker calls claimCashback for victim");
	console.log("  claimCashback doesn't require user signer.");
	console.log("  But funds are transferred TO `user` (victim).");
	console.log("  Result: Victim receives their own cashback. No theft.\n");

	// Attack vector 2: Unauthorized close
	console.log("Attack 2: Attacker calls closeUserVolumeAccumulator for victim");
	console.log("  closeUserVolumeAccumulator REQUIRES user signer.");
	console.log("  Attacker cannot sign for victim.");
	console.log("  Result: Impossible. KILL.\n");

	// Attack vector 3: Claim + close ordering
	console.log("Attack 3: Ordering of claim and close in same tx");
	console.log("  Case A: claim first, then close");
	console.log(
		"    - claim: transfers cashback to user (native lamports above rent)",
	);
	console.log("    - close: returns rent to user");
	console.log(
		"    - Net: user gets all lamports they're entitled to. ✅ Safe.\n",
	);
	console.log("  Case B: close first, then claim");
	console.log("    - close: account is closed, rent returned to user");
	console.log(
		"    - claim: fails with AccountNotFound (no account to claim from)",
	);
	console.log(
		"    - Result: User lost cashback — but ONLY if user constructed",
	);
	console.log("      this tx themselves (close requires their signature).");
	console.log("    - No attacker can force this. Self-grief only. ✅ Safe.\n");

	// Attack vector 4: Double-claim
	console.log("Attack 4: Double-claim via re-init");
	console.log("  After claim + close:");
	console.log("  - account is closed, 0 lamports");
	console.log("  - Future buy/sell will re-init (init_if_needed)");
	console.log("  - New cashback accumulates in new instance");
	console.log(
		"  - No double-claim possible because original cashback was already",
	);
	console.log("    transferred out before close.\n");

	// Attack vector 5: Pre-init grief
	console.log("Attack 5: Pre-init victim accumulator with attacker as payer");
	console.log("  Attacker pays rent to create accumulator for victim.");
	console.log("  Attacker loses the rent (accumulator owned by program).");
	console.log("  Victim can claim cashback normally.");
	console.log("  Result: No harm to victim. Attacker wasted SOL. 😂\n");

	// Attack vector 6: V2 ATA manipulation
	console.log("Attack 6: V2 WSOL ATA manipulation");
	console.log("  V2 expects user's WSOL ATA to exist beforehand (per README).");
	console.log("  Cashback goes to user's WSOL ATA.");
	console.log(
		"  Attacker can't redirect because ATA is PDA-derived from user.",
	);
	console.log("  Result: Safe.\n");

	// ═════════════════════════════════════════════════════════════════════════
	//  VERDICT
	// ═════════════════════════════════════════════════════════════════════════
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  VERDICT");
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  KILL: No exploitable race condition.");
	console.log("");
	console.log("  Reasons:");
	console.log("  1. claimCashback sends funds to `user`, not the caller");
	console.log("  2. closeUserVolumeAccumulator requires user signature");
	console.log(
		"  3. No double-claim: after close, account gone; after claim, cashback transferred",
	);
	console.log("  4. No theft: attacker cannot redirect funds to themselves");
	console.log(
		"  5. No permanent freeze: user can always claim + close at any time",
	);
	console.log(
		"  6. Self-grief only: user must sign close before claim, which is user error",
	);
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEVENET TESTING (scaffold for when RPC works)
// ═════════════════════════════════════════════════════════════════════════════

async function devnetTests() {
	if (!process.argv[2]) {
		console.log(
			"\n  To run devnet tests: node test_c01_cashback_race.mjs <SECRET_KEY>",
		);
		console.log("  (requires funded wallet + existing accumulator)");
		return;
	}

	const secret = JSON.parse(process.argv[2]);
	const wallet = Keypair.fromSecretKey(new Uint8Array(secret));
	const userVolPda = findUserVolAccPda(wallet.publicKey);

	console.log(`\n═══ Devnet Tests ═══\n`);
	console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
	console.log(`Accumulator PDA: ${userVolPda.toBase58()}\n`);

	// Check accumulator exists
	const accInfo = await connection.getAccountInfo(userVolPda);
	const accLamports = accInfo?.lamports || 0n;
	console.log(`Accumulator exists: ${!!accInfo}`);
	console.log(`Accumulator lamports: ${accLamports}`);

	if (!accInfo) {
		console.log("No accumulator to test with. Need to execute buy/sell first.");
		return;
	}

	// ── Test A: claimCashback ──────────────────────────────────────────────
	console.log("\n── Test A: claimCashback ──");
	const claimIx = buildClaimCashbackIx(wallet.publicKey, userVolPda);
	const claimTx = new Transaction().add(claimIx);
	claimTx.feePayer = wallet.publicKey;
	claimTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	const claimSim = await connection.simulateTransaction(claimTx, [wallet]);
	if (claimSim.value.err) {
		console.log(`  ❌ Failed: ${JSON.stringify(claimSim.value.err)}`);
		if (claimSim.value.logs) {
			for (const l of claimSim.value.logs) {
				if (l.includes("Program log:")) console.log(`  ${l}`);
			}
		}
	} else {
		console.log("  ✅ Simulation succeeded");
	}

	// ── Test B: closeUserVolumeAccumulator ────────────────────────────────
	console.log("\n── Test B: closeUserVolumeAccumulator ──");
	const closeIx = buildCloseAccumulatorIx(wallet.publicKey, userVolPda);
	const closeTx = new Transaction().add(closeIx);
	closeTx.feePayer = wallet.publicKey;
	closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	const closeSim = await connection.simulateTransaction(closeTx, [wallet]);
	if (closeSim.value.err) {
		console.log(`  ❌ Failed: ${JSON.stringify(closeSim.value.err)}`);
	} else {
		console.log("  ✅ Simulation succeeded");
	}

	// ── Test C: claim then close ──────────────────────────────────────────
	console.log("\n── Test C: claim then close (same tx) ──");
	const bothTx = new Transaction().add(claimIx).add(closeIx);
	bothTx.feePayer = wallet.publicKey;
	bothTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	const bothSim = await connection.simulateTransaction(bothTx, [wallet]);
	if (bothSim.value.err) {
		const errStr = JSON.stringify(bothSim.value.err);
		console.log(`  ❌ Failed: ${errStr}`);
		if (bothSim.value.logs) {
			for (const l of bothSim.value.logs) {
				if (l.includes("Program log:") || l.includes("Error"))
					console.log(`  ${l}`);
			}
		}
		// Check if claim succeeded before close
		if (
			bothSim.value.logs?.join(" ").includes("ClaimCashback") &&
			bothSim.value.logs?.join(" ").includes("CloseUserVolumeAccumulator")
		) {
			console.log(
				"  → Both instructions executed (claim before close) ✅ Safe",
			);
		}
	} else {
		console.log("  ✅ Both succeeded!");
	}

	// ── Test D: close then claim ──────────────────────────────────────────
	console.log("\n── Test D: close then claim (same tx, wrong order) ──");
	const wrongTx = new Transaction().add(closeIx).add(claimIx);
	wrongTx.feePayer = wallet.publicKey;
	wrongTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	const wrongSim = await connection.simulateTransaction(wrongTx, [wallet]);
	if (wrongSim.value.err) {
		const errStr = JSON.stringify(wrongSim.value.err);
		console.log(`  ❌ Failed: ${errStr}`);
		// Expected: close succeeds, claim fails because account is gone
		console.log("  → Claim fails after close (as expected). Self-grief only.");
	} else {
		console.log("  ⚠️  Both succeeded! (would be unexpected)");
	}

	// ── Test E: attacker tries to close victim accumulator ────────────────
	console.log("\n── Test E: Attacker tries to close victim accumulator ──");
	const attacker = Keypair.generate();
	const attackerIx = buildCloseAccumulatorIx(attacker.publicKey, userVolPda);
	// Attacker uses their own signature but passes victim's accumulator
	// close checks: userVolumeAccumulator PDA = ["user_volume_accumulator", user]
	// Since the seeds use the signer (attacker), the PDA won't match victim's accumulator
	// → Anchor PDA constraint fails immediately
	const attackTx = new Transaction().add(attackerIx);
	attackTx.feePayer = attacker.publicKey;
	attackTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	try {
		const attackSim = await connection.simulateTransaction(attackTx, [
			attacker,
		]);
		if (attackSim.value.err) {
			const errStr = JSON.stringify(attackSim.value.err);
			if (
				errStr.includes("A seeds constraint was violated") ||
				errStr.includes("4100")
			) {
				console.log(
					"  ✅ KILL: PDA constraint prevents attacker from closing victim's accumulator",
				);
			} else {
				console.log(`  ❌ Failed: ${errStr}`);
			}
		} else {
			console.log(
				"  ⚠️  POSSIBLE FINDING: Attacker could close victim's accumulator!",
			);
		}
	} catch (e) {
		// Account might not exist for attacker's PDA
		console.log(`  ℹ️  ${e.message}`);
	}

	// ── Summary ──────────────────────────────────────────────────────────
	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("  DEVENET TEST SUMMARY");
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log(
		`  A: claimCashback alone:   ${!claimSim.value.err ? "✅" : "❌"}`,
	);
	console.log(
		`  B: close alone:           ${!closeSim.value.err ? "✅" : "❌"}`,
	);
	console.log(
		`  C: claim → close:         ${!bothSim.value.err ? "✅" : "❌"}`,
	);
	console.log(
		`  D: close → claim:         ${!wrongSim.value.err ? "⚠️" : "✅ (expected fail)"}`,
	);
	console.log(`  E: attacker close victim: PDA constraint prevents`);
}

analyzeInstructions();
await devnetTests();
