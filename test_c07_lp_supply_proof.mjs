/**
 * C-07: AMM lp_supply divergence — Mathematical proof & devnet test
 *
 * Core question: Can direct LP burn → inflated lp_supply → cheaper deposit
 * create positive attacker PnL?
 *
 * Deposit formula (constant product):
 *   base_in = pool_base * lpTokenOut / Pool::lp_supply
 *   quote_in = pool_quote * lpTokenOut / Pool::lp_supply
 *
 * Withdraw formula:
 *   base_out = pool_base * lpTokenIn / Pool::lp_supply
 *   quote_out = pool_quote * lpTokenIn / Pool::lp_supply
 */

import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PUMP_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

// ═════════════════════════════════════════════════════════════════════════════
//  MATHEMATICAL PROOF
// ═════════════════════════════════════════════════════════════════════════════

function proveAttackUnprofitable() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  MATHEMATICAL PROOF: lp_supply divergence cannot be exploited");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// ── Initial pool state ──────────────────────────────────────────────────
	const B0 = 100_000n; // base reserves
	const Q0 = 100_000n; // quote reserves
	const S0 = 100_000n; // Pool::lp_supply

	console.log(`Initial pool: base=${B0}, quote=${Q0}, lp_supply=${S0}`);
	console.log(`k = ${B0 * Q0}\n`);

	// ── Step 1: Attacker deposits for lpOut LP tokens ──────────────────────
	const lpOut = 10_000n;
	const baseIn1 = (B0 * lpOut) / S0;
	const quoteIn1 = (Q0 * lpOut) / S0;
	const B1 = B0 + baseIn1;
	const Q1 = Q0 + quoteIn1;
	const S1 = S0 + lpOut;
	const cost1 = baseIn1 + quoteIn1;

	console.log(`── Step 1: Deposit for ${lpOut} LP ──`);
	console.log(`  base_in:  ${baseIn1}`);
	console.log(`  quote_in: ${quoteIn1}`);
	console.log(`  cost:     ${cost1}`);
	console.log(`  Pool: base=${B1}, quote=${Q1}, lp_supply=${S1}`);

	// Attacker has lpOut LP tokens worth:
	const lpValue1 = (B1 * lpOut) / S1 + (Q1 * lpOut) / S1;
	console.log(`  LP value: ${lpValue1} (B1*lpOut/S1 + Q1*lpOut/S1)\n`);

	// ── Step 2: Attacker burns X LP tokens directly ────────────────────────
	const lpBurn = 1_000n; // Burn 10% of LP
	// Pool::lp_supply does NOT change
	// lp_mint.supply decreases
	const B2 = B1;
	const Q2 = Q1;
	const S2 = S1; // UNCHANGED — this is the "divergence"
	const actualSupply = S1 - lpBurn;

	console.log(`── Step 2: Burn ${lpBurn} LP directly ──`);
	console.log(`  Pool::lp_supply: ${S2} (unchanged!)`);
	console.log(`  lp_mint.supply:  ${actualSupply} (decreased by ${lpBurn})`);
	console.log(
		`  Value burned: ${lpBurn} LP ≈ ${(lpValue1 * lpBurn) / lpOut} tokens\n`,
	);

	// ── Step 3: Deposit again for same lpOut LP tokens ─────────────────────
	// Using INFLATED Pool::lp_supply (S2, not actualSupply)
	const baseIn2 = (B2 * lpOut) / S2;
	const quoteIn2 = (Q2 * lpOut) / S2;
	// What it SHOULD cost with correct lp_supply:
	const baseIn2Correct = (B2 * lpOut) / actualSupply;
	const quoteIn2Correct = (Q2 * lpOut) / actualSupply;
	const cost2 = baseIn2 + quoteIn2;
	const cost2Correct = baseIn2Correct + quoteIn2Correct;
	const discount = cost2Correct - cost2;

	const B3 = B2 + baseIn2;
	const Q3 = Q2 + quoteIn2;
	const S3 = S2 + lpOut;
	// Actual lp_mint.supply = actualSupply + lpOut

	console.log(`── Step 3: Deposit for ${lpOut} LP (inflated lp_supply) ──`);
	console.log(`  base_in:       ${baseIn2}`);
	console.log(`  quote_in:      ${quoteIn2}`);
	console.log(`  cost:          ${cost2}`);
	console.log(`  Correct cost:  ${cost2Correct}`);
	console.log(`  Discount:      ${discount}`);
	console.log(`  Pool: base=${B3}, quote=${Q3}, lp_supply=${S3}\n`);

	// ── Step 4: Withdraw all LP (lpOut - lpBurn + lpOut = 2*lpOut - lpBurn) ──
	const lpToWithdraw = 2n * lpOut - lpBurn; // Remaining LP from step 1 (lpOut-lpBurn) + step 3 (lpOut)
	const baseOut = (B3 * lpToWithdraw) / S3;
	const quoteOut = (Q3 * lpToWithdraw) / S3;
	const received = baseOut + quoteOut;

	console.log(`── Step 4: Withdraw ${lpToWithdraw} LP ──`);
	console.log(`  base_out:  ${baseOut}`);
	console.log(`  quote_out: ${quoteOut}`);
	console.log(`  received:  ${received}\n`);

	// ── PnL ────────────────────────────────────────────────────────────────
	const totalCost = cost1 + cost2;
	const burnedValue = (cost1 * lpBurn) / lpOut; // Approximate value of burned LP
	const pnl = received - totalCost;

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  PnL ANALYSIS");
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log(`  Total spent (dep1 + dep2): ${totalCost}`);
	console.log(`  Value burned (${lpBurn} LP):   ${burnedValue}`);
	console.log(`  Total received (withdraw): ${received}`);
	console.log(`  Raw PnL (received - spent): ${pnl}`);
	console.log(
		`  True PnL (received + burned - spent): ${received + burnedValue - totalCost}`,
	);
	console.log(`  Discount gained:            ${discount}`);
	console.log(
		`  Burned > Discount?          ${burnedValue > discount ? "YES → KILL" : "NO → check further"}`,
	);
	console.log();

	// Show different burn percentages
	console.log("── Sensitivity: varying burn % ──\n");
	for (const burnPct of [0.001, 0.01, 0.05, 0.1, 0.25, 0.5]) {
		const lb = BigInt(Math.floor(Number(lpOut) * burnPct));
		const bv = (cost1 * lb) / lpOut;
		const bi2 = (B1 * lpOut) / S1; // Using S1 (unchanged)
		const qi2 = (Q1 * lpOut) / S1;
		const bi2c = (B1 * lpOut) / (S1 - lb);
		const qi2c = (Q1 * lpOut) / (S1 - lb);
		const disc = bi2c + qi2c - (bi2 + qi2);
		// Recalculate properly with actual pool state progression
		const B_a = B1;
		const Q_a = Q1;
		const S_a = S1;
		const bi2a = (B_a * lpOut) / S_a;
		const qi2a = (Q_a * lpOut) / S_a;
		const bi2ca = (B_a * lpOut) / (S_a - lb);
		const qi2ca = (Q_a * lpOut) / (S_a - lb);
		const discA = bi2ca + qi2ca - (bi2a + qi2a);
		console.log(
			`  Burn ${(burnPct * 100).toFixed(1)}% (${lb} LP): discount=${discA}, burned_val=${bv}, ratio=${(Number(bv) / Number(discA || 1n)).toFixed(2)}x loss`,
		);
	}
	console.log();

	// ── Edge case: burn 1 LP, redeposit N times ────────────────────────────
	console.log(
		"── Multi-cycle scenario (burn 1 LP, deposit/withdraw N times) ──\n",
	);
	for (const cycles of [1, 2, 5, 10, 100]) {
		let B_c = B0,
			Q_c = Q0,
			S_c = S0;
		const burnPerCycle = 1n;
		let totalSpent = 0n;
		let totalBurned = 0n;
		let totalReceived = 0n;

		for (let c = 0; c < cycles; c++) {
			// Deposit
			const bi = (B_c * lpOut) / S_c;
			const qi = (Q_c * lpOut) / S_c;
			totalSpent += bi + qi;
			B_c += bi;
			Q_c += qi;
			// Burn tiny amount
			// (after deposit, attacker has lpOut LP, burns burnPerCycle)
			const bv = ((bi + qi) * burnPerCycle) / lpOut;
			totalBurned += bv;
			S_c += lpOut; // lp_supply increases with deposit
			// Note: lp_supply does NOT decrease on burn
		}

		// Final withdraw of remaining LP
		const remainingLP = BigInt(cycles) * (lpOut - burnPerCycle);
		const baseOut_f = (B_c * remainingLP) / S_c;
		const quoteOut_f = (Q_c * remainingLP) / S_c;
		totalReceived = baseOut_f + quoteOut_f;

		const netPnl = totalReceived - totalSpent;
		console.log(
			`  ${cycles} cycles: spent=${totalSpent}, burned=${totalBurned}, received=${totalReceived}, net=${netPnl}`,
		);
	}
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEVENET TEST (if pool available)
// ═════════════════════════════════════════════════════════════════════════════

async function devnetTest() {
	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("  DEVENET TEST (requires existing pool + funded wallet)");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const poolStr = process.argv[2];
	const secretStr = process.argv[3];
	if (!poolStr || !secretStr) {
		console.log(
			"  Usage: node test_c07_lp_supply_proof.mjs <POOL_ADDRESS> <SECRET_KEY_JSON>",
		);
		console.log("  Or run without args for mathematical proof only.\n");
		return;
	}

	const poolAddr = new PublicKey(poolStr);
	const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretStr)));

	console.log(`Pool:   ${poolAddr.toBase58()}`);
	console.log(`Wallet: ${wallet.publicKey.toBase58()}\n`);

	// Fetch pool
	const poolAcc = await connection.getAccountInfo(poolAddr);
	if (!poolAcc) {
		console.log("Pool not found");
		return;
	}

	// Decode pool (discriminator 8 + fields)
	const view = new DataView(
		poolAcc.data.buffer,
		poolAcc.data.byteOffset,
		poolAcc.data.byteLength,
	);
	const poolBump = view.getUint8(8);
	const index = view.getUint16(9, true);
	const creator = new PublicKey(poolAcc.data.subarray(11, 43));
	const baseMint = new PublicKey(poolAcc.data.subarray(43, 75));
	const quoteMint = new PublicKey(poolAcc.data.subarray(75, 107));
	const lpMint = new PublicKey(poolAcc.data.subarray(107, 139));
	const poolBaseTA = new PublicKey(poolAcc.data.subarray(139, 171));
	const poolQuoteTA = new PublicKey(poolAcc.data.subarray(171, 203));
	const lpSupply = view.getBigUint64(203, true);
	const coinCreator = new PublicKey(poolAcc.data.subarray(211, 243));

	console.log(`Pool state:`);
	console.log(`  index:      ${index}`);
	console.log(`  creator:    ${creator.toBase58()}`);
	console.log(`  baseMint:   ${baseMint.toBase58()}`);
	console.log(`  quoteMint:  ${quoteMint.toBase58()}`);
	console.log(`  lpMint:     ${lpMint.toBase58()}`);
	console.log(`  lpSupply:   ${lpSupply}`);
	console.log(`  coinCreator:${coinCreator.toBase58()}\n`);

	// Get actual LP mint supply
	const lpMintAcc = await connection.getTokenSupply(lpMint);
	console.log(`Actual lp_mint supply: ${lpMintAcc.value.uiAmount}\n`);

	const lpActual = lpMintAcc.value.uiAmount;
	if (
		lpSupply ===
		BigInt(Math.floor((lpActual || 0) * 10 ** lpMintAcc.value.decimals))
	) {
		console.log("✅ Pool::lp_supply == lp_mint.supply (no divergence)");
	} else {
		console.log(
			`⚠️  DIVERGENCE: Pool::lp_supply (${lpSupply}) ≠ lp_mint.supply (${lpMintAcc.value.uiAmount})`,
		);
	}
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════

proveAttackUnprofitable();
await devnetTest();
