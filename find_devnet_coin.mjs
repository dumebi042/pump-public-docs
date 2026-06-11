import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const KNOWN = [
	"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
	"pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
	"pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
	"So11111111111111111111111111111111111111112",
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
	"11111111111111111111111111111111",
	"4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
	"FFWtrEQ4B4PKQoVuHYzZq8FabGkVatYzDpEVHsK5rrhF",
	"ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw",
	"metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
	"7T6gqYCYexsMDNJqWLDx3moh8K7Wfj4Gob8BGWQjCExM",
	"39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg",
].map((s) => new PublicKey(s).toBase58());

async function main() {
	console.log("Searching for pump program devnet transactions...\n");

	const sigs = await connection.getSignaturesForAddress(PUMP, { limit: 25 });
	console.log(`Found ${sigs.length} recent signatures\n`);

	for (const sigInfo of sigs) {
		try {
			const tx = await connection.getTransaction(sigInfo.signature, {
				maxSupportedTransactionVersion: 0,
			});
			if (!tx || !tx.meta) continue;

			const msg = tx.transaction.message;
			const accounts = msg.staticAccountKeys;

			const hasBuyOrSell = tx.meta.logMessages?.some(
				(l) =>
					l.includes("buy_v2") ||
					l.includes("sell_v2") ||
					l.includes("Instruction: Buy") ||
					l.includes("Instruction: Sell") ||
					l.includes("Instruction: Create"),
			);

			if (hasBuyOrSell && tx.meta.logMessages) {
				console.log(`\n═══════════════════════════════════════════`);
				console.log(`TX: ${sigInfo.signature}`);
				console.log(`Slot: ${tx.slot}`);
				console.log(`═══════════════════════════════════════════`);

				// Show instruction summary
				for (const log of tx.meta.logMessages) {
					if (log.includes("Instruction:") || log.includes("Program log:")) {
						console.log(`  ${log}`);
					}
				}

				// Find coin mints (accounts ending in "pump")
				const mints = accounts.filter((k) => {
					const b58 = k.toBase58();
					return (
						b58.endsWith("pump") && b58.length > 40 && !KNOWN.includes(b58)
					);
				});

				if (mints.length > 0) {
					console.log(`\n  → COIN MINTS:`);
					for (const m of mints) {
						console.log(`    ${m.toBase58()}`);
					}
				}

				// Show all non-obvious accounts
				console.log(`\n  Non-obvious accounts:`);
				for (const k of accounts) {
					const b58 = k.toBase58();
					if (
						!KNOWN.includes(b58) &&
						!b58.startsWith("Sysvar") &&
						!b58.startsWith("metaqbxx") &&
						!b58.startsWith("Compute")
					) {
						console.log(`    ${b58}`);
					}
				}
				console.log();
			}
		} catch (e) {
			// skip timed out txs
		}
	}
}

main().catch(console.error);
