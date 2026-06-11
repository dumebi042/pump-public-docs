/**
 * Analyze a real buy_v2 tx from devnet with proper LUT resolution.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_V2_DISCRIMINATOR = Buffer.from([184, 23, 238, 97, 103, 197, 211, 61]);

async function main() {
	const txSig = process.argv[2];
	if (!txSig) {
		console.error("Usage: node analyze_buyv2_tx.mjs <TX_SIGNATURE>");
		process.exit(1);
	}

	const tx = await connection.getTransaction(txSig, {
		maxSupportedTransactionVersion: 0,
	});
	if (!tx) throw new Error("TX not found");

	const msg = tx.transaction.message;
	const staticKeys = msg.staticAccountKeys;
	const h = msg.header;

	// Resolve LUT properly
	// Combined accounts = staticKeys + [writable LUT entries] + [readonly LUT entries]
	const lutWritable = [];
	const lutReadonly = [];

	for (const lookup of msg.addressTableLookups || []) {
		const lutInfo = await connection.getAccountInfo(lookup.accountKey);
		if (!lutInfo) continue;
		const keys = [];
		for (let i = 2; i + 32 <= lutInfo.data.length; i += 32) {
			keys.push(new PublicKey(lutInfo.data.subarray(i, i + 32)));
		}
		for (const idx of lookup.writableIndexes) {
			lutWritable.push(keys[idx]);
		}
		for (const idx of lookup.readonlyIndexes) {
			lutReadonly.push(keys[idx]);
		}
	}

	const allAccounts = [...staticKeys, ...lutWritable, ...lutReadonly];

	console.log(`TX: ${txSig}`);
	console.log(`Static keys: ${staticKeys.length}`);
	console.log(`LUT writable: ${lutWritable.length}`);
	console.log(`LUT readonly: ${lutReadonly.length}`);
	console.log(`Total accounts: ${allAccounts.length}\n`);

	// Print all static keys with global index
	console.log("Static accounts:");
	staticKeys.forEach((k, i) => console.log(`  [${i}] ${k.toBase58()}`));
	console.log();

	if (lutWritable.length > 0) {
		console.log("LUT writable entries:");
		lutWritable.forEach((k, i) =>
			console.log(`  [${staticKeys.length + i}] ${k.toBase58()}`),
		);
		console.log();
	}
	if (lutReadonly.length > 0) {
		console.log("LUT readonly entries:");
		lutReadonly.forEach((k, i) =>
			console.log(
				`  [${staticKeys.length + lutWritable.length + i}] ${k.toBase58()}`,
			),
		);
		console.log();
	}

	// Find the Pump program compiled instruction
	for (let cixIdx = 0; cixIdx < msg.compiledInstructions.length; cixIdx++) {
		const cix = msg.compiledInstructions[cixIdx];
		const progId = allAccounts[cix.programIdIndex];

		if (!progId || !progId.equals(PUMP)) continue;

		const disc = Buffer.from(cix.data.slice(0, 8));
		const isBuyV2 = disc.equals(BUY_V2_DISCRIMINATOR);
		if (!isBuyV2) continue;

		console.log(`═══ BuyV2 Instruction ═══`);
		console.log(
			`Args: amount=${cix.data.readBigUInt64LE(8)}, maxSolCost=${cix.data.readBigUInt64LE(16)}`,
		);

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

		console.log(`\nAccounts (${cix.accountKeyIndexes.length}):`);
		for (let i = 0; i < cix.accountKeyIndexes.length; i++) {
			const globalIdx = cix.accountKeyIndexes[i];
			const pk = allAccounts[globalIdx];
			const isSigner = globalIdx < h.numRequiredSignatures;
			const label = ROLE_LABELS[i] || `unknown_${i}`;
			const signerStr = isSigner ? " (S)" : "";
			console.log(
				`  [${i}] ${pk?.toBase58() || "???"}${signerStr}  ← ${label}`,
			);
		}
	}
}

main().catch(console.error);
