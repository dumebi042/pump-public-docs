import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

// ── Devnet RPC ──────────────────────────────────────────────────────────────
const connection = new Connection("https://api.devnet.solana.com");
console.log("RPC connected:", connection.rpcEndpoint);

// ── Program IDs ─────────────────────────────────────────────────────────────
const PUMP_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const PUMP_FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

// ── PDAs ───────────────────────────────────────────────────────────────────
const [globalConfigPda] = PublicKey.findProgramAddressSync(
	[Buffer.from("global_config")],
	PUMP_AMM,
);
console.log(`\nGlobalConfig PDA : ${globalConfigPda.toBase58()}`);

// ── Anchor discriminator for GlobalConfig (from IDL) ───────────────────────
// sha256("account:GlobalConfig")[0..8] = [149, 8, 156, 202, 160, 252, 176, 217]
const GLOBAL_CONFIG_DISCRIMINATOR = Buffer.from([
	149, 8, 156, 202, 160, 252, 176, 217,
]);

// ── Known addresses from docs ──────────────────────────────────────────────
const KNOWN_NORMAL_FEE_RECIPIENTS = [
	"62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV",
	"7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ",
	"7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX",
	"9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz",
	"AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY",
	"CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
	"FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz",
	"G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP",
];

const KNOWN_RESERVED_FEE_RECIPIENTS = [
	"GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS",
	"4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6",
	"8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR",
	"4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH",
	"8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6",
	"Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk",
	"463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq",
	"6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA",
];

const KNOWN_BUYBACK_FEE_RECIPIENTS = [
	"5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
	"9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
	"GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
	"3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
	"5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
	"EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
	"5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
	"A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
];

// ── Helper: decode a Borsh pubkey at offset ────────────────────────────────
function readPubkey(buf, offset) {
	return new PublicKey(buf.subarray(offset, offset + 32));
}

function readU64(buf, offset) {
	return buf.readBigUInt64LE(offset);
}

function readU8(buf, offset) {
	return buf.readUInt8(offset);
}

// ── Decode GlobalConfig ────────────────────────────────────────────────────
function decodeGlobalConfig(data) {
	// Verify discriminator
	const disc = data.subarray(0, 8);
	if (!disc.equals(GLOBAL_CONFIG_DISCRIMINATOR)) {
		console.error("❌ Discriminator mismatch!");
		console.error(
			"   Expected:",
			Buffer.from(GLOBAL_CONFIG_DISCRIMINATOR).toString("hex"),
		);
		console.error("   Got:     ", Buffer.from(disc).toString("hex"));
		return null;
	}
	console.log("✅ Discriminator verified\n");

	let offset = 8;

	const admin = readPubkey(data, offset);
	offset += 32;
	const lpFeeBps = readU64(data, offset);
	offset += 8;
	const protocolFeeBps = readU64(data, offset);
	offset += 8;
	const disableFlags = readU8(data, offset);
	offset += 1;

	// protocol_fee_recipients: [pubkey; 8]
	const protocolFeeRecipients = [];
	for (let i = 0; i < 8; i++) {
		protocolFeeRecipients.push(readPubkey(data, offset));
		offset += 32;
	}

	const coinCreatorFeeBps = readU64(data, offset);
	offset += 8;
	const adminSetCoinCreatorAuthority = readPubkey(data, offset);
	offset += 32;
	const whitelistPda = readPubkey(data, offset);
	offset += 32;
	const reservedFeeRecipient = readPubkey(data, offset);
	offset += 32;
	const mayhemModeEnabled = readU8(data, offset) !== 0;
	offset += 1;

	// reserved_fee_recipients: [pubkey; 7]
	const reservedFeeRecipients = [];
	for (let i = 0; i < 7; i++) {
		reservedFeeRecipients.push(readPubkey(data, offset));
		offset += 32;
	}

	const isCashbackEnabled = readU8(data, offset) !== 0;
	offset += 1;

	// buyback_fee_recipients: [pubkey; 8]
	const buybackFeeRecipients = [];
	for (let i = 0; i < 8; i++) {
		buybackFeeRecipients.push(readPubkey(data, offset));
		offset += 32;
	}

	const buybackBasisPoints = readU64(data, offset);
	offset += 8;

	return {
		admin,
		lpFeeBps,
		protocolFeeBps,
		disableFlags,
		protocolFeeRecipients,
		coinCreatorFeeBps,
		adminSetCoinCreatorAuthority,
		whitelistPda,
		reservedFeeRecipient,
		mayhemModeEnabled,
		reservedFeeRecipients,
		isCashbackEnabled,
		buybackFeeRecipients,
		buybackBasisPoints,
	};
}

// ── Compare on-chain recipients with known addresses ────────────────────────
function compareRecipients(label, onChainAddrs, knownAddrs) {
	console.log(`\n── ${label} ──`);
	let allMatch = true;
	for (let i = 0; i < onChainAddrs.length; i++) {
		const onChain = onChainAddrs[i].toBase58();
		const known = knownAddrs[i];
		const match = onChain === known;
		if (!match) allMatch = false;
		console.log(
			`  [${i}] on-chain: ${onChain}` +
				`\n       doc:     ${known}` +
				`  ${match ? "✅" : "❌ MISMATCH"}`,
		);
	}
	console.log(
		allMatch ? "\n  ✅ All match!" : "\n  ⚠️  Some mismatches found!",
	);
	return allMatch;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("  PoC: Pump.fun Protocol Fee Recipient Validation (Error 6013)");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// ─── 1. Fetch & decode GlobalConfig ────────────────────────────────────────
	console.log("── Step 1: Fetch GlobalConfig ──");
	const globalConfigData = await connection.getAccountInfo(globalConfigPda);
	if (!globalConfigData) {
		console.log("❌ GlobalConfig not found on Devnet");
		return;
	}
	console.log(`   Data length: ${globalConfigData.data.length} bytes\n`);

	const config = decodeGlobalConfig(globalConfigData.data);
	if (!config) return;

	console.log(`   Admin                        : ${config.admin.toBase58()}`);
	console.log(`   LP Fee (bps)                 : ${config.lpFeeBps}`);
	console.log(`   Protocol Fee (bps)           : ${config.protocolFeeBps}`);
	console.log(`   Disable Flags                : ${config.disableFlags}`);
	console.log(`   Coin Creator Fee (bps)       : ${config.coinCreatorFeeBps}`);
	console.log(
		`   Admin Set Coin Creator Auth  : ${config.adminSetCoinCreatorAuthority.toBase58()}`,
	);
	console.log(
		`   Whitelist PDA                : ${config.whitelistPda.toBase58()}`,
	);
	console.log(
		`   Reserved Fee Recipient       : ${config.reservedFeeRecipient.toBase58()}`,
	);
	console.log(`   Mayhem Mode                  : ${config.mayhemModeEnabled}`);
	console.log(`   Cashback Enabled             : ${config.isCashbackEnabled}`);
	console.log(`   Buyback Basis Points         : ${config.buybackBasisPoints}`);

	// ─── 2. Compare protocol_fee_recipients ────────────────────────────────────
	compareRecipients(
		"Normal Protocol Fee Recipients (protocol_fee_recipients[8])",
		config.protocolFeeRecipients,
		KNOWN_NORMAL_FEE_RECIPIENTS,
	);

	// ─── 3. Compare reserved_fee_recipients ────────────────────────────────────
	compareRecipients(
		"Reserved Fee Recipients (reserved_fee_recipients[7])",
		config.reservedFeeRecipients,
		KNOWN_RESERVED_FEE_RECIPIENTS.slice(0, 7), // only 7 in on-chain, 8 in docs
	);

	// ─── 4. Compare buyback_fee_recipients ─────────────────────────────────────
	compareRecipients(
		"Buyback Fee Recipients (buyback_fee_recipients[8])",
		config.buybackFeeRecipients,
		KNOWN_BUYBACK_FEE_RECIPIENTS,
	);

	// ─── 5. Check AMM pool accounts on Devnet ──────────────────────────────────
	console.log(`\n── Step 2: Query AMM Pool Accounts ──`);
	try {
		const poolAccounts = await connection.getProgramAccounts(PUMP_AMM, {
			filters: [{ dataSize: 277 }], // Pool account size (estimated)
			limit: 5,
		});
		console.log(`   Found ${poolAccounts.length} pool accounts`);
		for (const acc of poolAccounts) {
			console.log(
				`   Pool: ${acc.pubkey.toBase58()}, lamports: ${acc.account.lamports}`,
			);
		}
	} catch (err) {
		console.log(`   getProgramAccounts error: ${err.message}`);
		console.log(
			`   (This is normal if Devnet RPC restricts getProgramAccounts)`,
		);
	}

	// ─── 6. Check global_config authority / admin ──────────────────────────────
	console.log(
		`\n── Step 3: Error 6013 (InvalidProtocolFeeRecipient) Analysis ──`,
	);
	console.log(`   Error 6013 in pump_amm = InvalidProtocolFeeRecipient`);
	console.log(
		`   This occurs when a buy/sell tx passes a fee recipient that is`,
	);
	console.log(`   NOT in the on-chain protocol_fee_recipients array.`);

	// Check if the 8th reserved recipient (index 7) from docs matches
	const docReserved7 = new PublicKey(KNOWN_RESERVED_FEE_RECIPIENTS[7]);
	const docNormal = config.protocolFeeRecipients.map((p) => p.toBase58());
	const docReserved = config.reservedFeeRecipients.map((p) => p.toBase58());
	const docBuyback = config.buybackFeeRecipients.map((p) => p.toBase58());

	console.log(`\n   On-chain protocol_fee_recipients (${docNormal.length}):`);
	docNormal.forEach((a, i) => console.log(`     [${i}] ${a}`));
	console.log(`   On-chain reserved_fee_recipients (${docReserved.length}):`);
	docReserved.forEach((a, i) => console.log(`     [${i}] ${a}`));
	console.log(`   On-chain buyback_fee_recipients (${docBuyback.length}):`);
	docBuyback.forEach((a, i) => console.log(`     [${i}] ${a}`));

	// Summary
	console.log(
		`\n═══════════════════════════════════════════════════════════════`,
	);
	console.log(`  SUMMARY`);
	console.log(
		`═══════════════════════════════════════════════════════════════`,
	);
	console.log(`  GlobalConfig found    : ✅ yes`);
	console.log(
		`  Protocol fee recipients : ${config.protocolFeeRecipients.length}`,
	);
	console.log(
		`  Reserved fee recipients : ${config.reservedFeeRecipients.length}`,
	);
	console.log(
		`  Buyback fee recipients  : ${config.buybackFeeRecipients.length}`,
	);
	console.log(`  Discriminator match     : ✅ yes`);
	console.log(
		`  SOL balance needed?     : ❌ not required (read-only RPC calls)`,
	);
	console.log(``);
}

main().catch(console.error);
