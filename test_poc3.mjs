import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";

const connection = new Connection("https://api.devnet.solana.com", {
	commitment: "confirmed",
});

const PUMP_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const GLOBAL_CONFIG = new PublicKey(
	"ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw",
);
const EVENT_AUTHORITY = new PublicKey(
	"7T6gqYCYexsMDNJqWLDx3moh8K7Wfj4Gob8BGWQjCExM",
);

// Helper to add delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findProgramLogsWithKeyword(keyword, program, limit = 10) {
	const sigs = await connection.getSignaturesForAddress(program, { limit });
	for (const sig of sigs) {
		await delay(500); // Rate limit backoff
		try {
			const tx = await connection.getTransaction(sig.signature, {
				maxSupportedTransactionVersion: 0,
			});
			if (tx?.meta?.logMessages) {
				for (const log of tx.meta.logMessages) {
					if (log.toLowerCase().includes(keyword.toLowerCase())) {
						return { sig: sig.signature, log, tx };
					}
				}
			}
		} catch (e) {}
	}
	return null;
}

async function main() {
	console.log("=== PoC 3: Buyback Optionality Test ===\n");

	console.log(
		"Searching for pump program buy transactions with buyback logs...\n",
	);

	// Search for error codes in recent transactions - sequential to avoid rate limiting
	console.log("Searching for error 6053 (BuybackFeeRecipientNotAuthorized)...");
	const r6053 = await findProgramLogsWithKeyword("6053", PUMP, 10);
	await delay(500);
	console.log("Searching for error 6057 (WrongBuybackFeeRecipientsCount)...");
	const r6057 = await findProgramLogsWithKeyword("6057", PUMP, 10);
	await delay(500);
	console.log("Searching for error 6058 (BuybackFeeRecipientMissing)...");
	const r6058 = await findProgramLogsWithKeyword("6058", PUMP, 10);
	await delay(500);
	console.log("Searching for error 6013 (InvalidProtocolFeeRecipient)...");
	const r6013 = await findProgramLogsWithKeyword("6013", PUMP_AMM, 10);
	await delay(500);
	console.log("Searching for error 6000 (FeeBasisPointsExceedsMaximum)...");
	const r6000 = await findProgramLogsWithKeyword("6000", PUMP_AMM, 10);
	await delay(500);
	console.log("Searching for buyback keyword in pump...");
	const rBuybackPump = await findProgramLogsWithKeyword("buyback", PUMP, 10);
	await delay(500);
	console.log("Searching for buyback keyword in pump_fees...");
	const rBuybackFees = await findProgramLogsWithKeyword(
		"buyback",
		PUMP_FEES,
		10,
	);

	console.log("\nError code search results:");
	console.log(
		"  6053 (BuybackFeeRecipientNotAuthorized):",
		r6053 ? `Found in ${r6053.sig}` : "Not found in recent 10 txs",
	);
	console.log(
		"  6057 (WrongBuybackFeeRecipientsCount):",
		r6057 ? `Found in ${r6057.sig}` : "Not found",
	);
	console.log(
		"  6058 (BuybackFeeRecipientMissing):",
		r6058 ? `Found in ${r6058.sig}` : "Not found",
	);
	console.log(
		"  6013 (InvalidProtocolFeeRecipient):",
		r6013 ? `Found in ${r6013.sig}` : "Not found",
	);
	console.log(
		"  6000 (FeeBasisPointsExceedsMaximum):",
		r6000 ? `Found in ${r6000.sig}` : "Not found",
	);
	console.log(
		"  buyback(pump):",
		rBuybackPump ? `Found in ${rBuybackPump.sig}` : "Not found",
	);
	console.log(
		"  buyback(pump_fees):",
		rBuybackFees ? `Found in ${rBuybackFees.sig}` : "Not found",
	);

	if (r6053) {
		console.log("\n--- Buyback Error Transaction Analysis ---");
		const tx = r6053.tx;
		console.log(`Signature: ${r6053.sig}`);
		if (tx?.meta?.logMessages) {
			tx.meta.logMessages.forEach((l) => console.log(`  ${l}`));
		}
		if (tx?.transaction?.message?.instructions) {
			const ix = tx.transaction.message.instructions[0];
			console.log(`\nProgram: ${ix.programId.toBase58()}`);
			console.log(`Accounts: ${ix.keys.length}`);
			console.log(`Data (hex): ${Buffer.from(ix.data).toString("hex")}`);
		}
	}

	// Test: Extract V1 buy instruction from a real transaction
	console.log("\n--- Analyzing Pump Program V1 vs V2 Instructions ---\n");

	await delay(1000);
	const pumpSigs = await connection.getSignaturesForAddress(PUMP, {
		limit: 10,
	});
	console.log(`Found ${pumpSigs.length} recent pump transactions`);

	let v1BuyFound = false;
	let v2BuyFound = false;

	for (const sig of pumpSigs) {
		await delay(500);
		try {
			const tx = await connection.getTransaction(sig.signature, {
				maxSupportedTransactionVersion: 0,
			});
			if (!tx) continue;

			for (const ix of tx.transaction.message.instructions) {
				if (ix.programId.equals(PUMP)) {
					const discriminator = Buffer.from(ix.data)
						.subarray(0, 8)
						.toString("hex");
					const accounts = ix.keys.length;

					console.log(
						`  TX ${sig.signature.substring(0, 8)}: disc=${discriminator}, accounts=${accounts}`,
					);

					if (accounts === 16) {
						v1BuyFound = true;
						console.log("  → V1 buy instruction!");
					}
					if (accounts === 27) {
						v2BuyFound = true;
						console.log("  → V2 buy instruction!");
					}
					if (accounts === 14) {
						console.log("  → V1 sell instruction!");
					}
					if (accounts === 26) {
						console.log("  → V2 sell instruction!");
					}
				}
			}
		} catch (e) {}
	}

	console.log(`\nV1 buy found: ${v1BuyFound}`);
	console.log(`V2 buy found: ${v2BuyFound}`);

	// Analyze the fee config from the pump fees program
	console.log("\n=== Fee Validation Analysis ===\n");

	const [feeConfigPda] = PublicKey.findProgramAddressSync(
		[Buffer.from("fee_config"), PUMP.toBuffer()],
		PUMP_FEES,
	);
	console.log(`FeeConfig PDA (pump): ${feeConfigPda.toBase58()}`);

	const [feeConfigPdaAmm] = PublicKey.findProgramAddressSync(
		[Buffer.from("fee_config"), PUMP_AMM.toBuffer()],
		PUMP_FEES,
	);
	console.log(`FeeConfig PDA (pump_amm): ${feeConfigPdaAmm.toBase58()}`);

	await delay(500);
	const feeConfigData = await connection.getAccountInfo(feeConfigPda);
	if (feeConfigData) {
		console.log(`\nFeeConfig found! Size: ${feeConfigData.data.length} bytes`);
		const view = new DataView(
			feeConfigData.data.buffer,
			feeConfigData.data.byteOffset,
			feeConfigData.data.byteLength,
		);
		console.log("\nScanning for fee values:");
		for (
			let offset = 8;
			offset < Math.min(feeConfigData.data.length - 8, 300);
			offset += 8
		) {
			const val = view.getBigUint64(offset, true);
			if (val > 0n && val < 100000n) {
				console.log(
					`  offset ${offset}: ${val.toString()} (0x${val.toString(16)})`,
				);
			}
		}
	} else {
		console.log("FeeConfig not found on Devnet");
	}

	const [feeProgramGlobalPda] = PublicKey.findProgramAddressSync(
		[Buffer.from("fee-program-global")],
		PUMP_FEES,
	);
	console.log(`\nFeeProgramGlobal PDA: ${feeProgramGlobalPda.toBase58()}`);
	await delay(500);
	const fpGlobalData = await connection.getAccountInfo(feeProgramGlobalPda);
	if (fpGlobalData) {
		console.log(`Size: ${fpGlobalData.data.length} bytes`);
		const view = new DataView(
			fpGlobalData.data.buffer,
			fpGlobalData.data.byteOffset,
			fpGlobalData.data.byteLength,
		);
		for (
			let offset = 8;
			offset < Math.min(fpGlobalData.data.length - 8, 100);
			offset += 8
		) {
			const val = view.getBigUint64(offset, true);
			if (val > 0n) {
				console.log(`  offset ${offset}: ${val.toString()}`);
			}
		}
	} else {
		console.log("FeeProgramGlobal not found");
	}

	console.log("\n=== PoC Complete ===");
}

main().catch(console.error);
