import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";

const connection = new Connection("https://api.devnet.solana.com", {
	commitment: "confirmed",
});

const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	console.log(
		"=== PoC 4: Buyback Fee Recipient Validation in Pump Program ===\n",
	);

	// Get the Global account
	const [globalPda] = PublicKey.findProgramAddressSync(
		[Buffer.from("global")],
		PUMP,
	);

	await delay(500);
	const globalData = await connection.getAccountInfo(globalPda);
	if (!globalData) {
		console.log("Global account not found");
		return;
	}

	console.log(`Global account: ${globalPda.toBase58()}`);
	console.log(`Size: ${globalData.data.length} bytes`);

	const view = new DataView(
		globalData.data.buffer,
		globalData.data.byteOffset,
		globalData.data.byteLength,
	);

	console.log("\nGlobal account fields (non-zero u64):");
	for (
		let offset = 8;
		offset < Math.min(globalData.data.length - 8, 300);
		offset += 8
	) {
		const val = view.getBigUint64(offset, true);
		if (val > 0n && val < 100000n) {
			console.log(`  offset ${offset}: ${val.toString()}`);
		}
	}

	// Check for buyback_fee_recipients array (8 pubkeys = 256 bytes)
	console.log("\nLooking for buyback_fee_recipients (8 pubkeys)...");
	let foundBuybackRecipients = false;
	for (let offset = 8; offset <= globalData.data.length - 32; offset += 1) {
		const keyBytes = globalData.data.subarray(offset, offset + 32);
		const isNonZero = keyBytes.some((b) => b !== 0);
		if (isNonZero) {
			const pk = new PublicKey(keyBytes);
			const pkStr = pk.toBase58();
			const knownBuybackRecipients = [
				"5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
				"9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
				"GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
				"3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
				"5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
				"EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
				"5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
				"A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
			];
			if (knownBuybackRecipients.includes(pkStr)) {
				console.log(`  → BUYBACK RECIPIENT at offset ${offset}: ${pkStr}`);
				foundBuybackRecipients = true;
			}
		}
	}

	if (!foundBuybackRecipients) {
		console.log("\nAll non-zero pubkeys in Global:");
		const checkedOffsets = new Set();
		for (let offset = 8; offset <= globalData.data.length - 32; offset += 1) {
			const keyBytes = globalData.data.subarray(offset, offset + 32);
			const isNonZero = keyBytes.some((b) => b !== 0);
			if (isNonZero) {
				const pk = new PublicKey(keyBytes);
				const pkStr = pk.toBase58();
				const roundedOffset = Math.floor(offset / 32) * 32;
				if (!checkedOffsets.has(roundedOffset)) {
					checkedOffsets.add(roundedOffset);
					console.log(`  offset ${roundedOffset}: ${pkStr}`);
				}
			}
		}
	}

	// Now check recent transactions to see V2 buy/sell with buyback
	console.log("\n=== Checking Pump Program V2 Transactions ===\n");
	await delay(1000);
	const pumpSigs = await connection.getSignaturesForAddress(PUMP, {
		limit: 15,
	});

	let v2BuyCount = 0;
	let v2SellCount = 0;

	for (const sig of pumpSigs) {
		await delay(500);
		try {
			const tx = await connection.getTransaction(sig.signature, {
				maxSupportedTransactionVersion: 0,
			});
			if (!tx?.meta?.logMessages) continue;

			for (const log of tx.meta.logMessages) {
				if (log.includes("buy_v2") || log.includes("Instruction: BuyV2")) {
					v2BuyCount++;
				}
				if (log.includes("sell_v2") || log.includes("Instruction: SellV2")) {
					v2SellCount++;
				}
				if (log.includes("buyback")) {
					console.log(`  [${sig.signature.substring(0, 12)}] ${log}`);
				}
				if (
					log.includes("6057") ||
					log.includes("6053") ||
					log.includes("6058")
				) {
					console.log(
						`  [${sig.signature.substring(0, 12)}] BUYBACK ERROR: ${log}`,
					);
				}
			}
		} catch (e) {}
	}

	console.log(`\nV2 buy transactions found: ${v2BuyCount}`);
	console.log(`V2 sell transactions found: ${v2SellCount}`);

	console.log("\n=== PoC Complete ===");
}

main().catch(console.error);
