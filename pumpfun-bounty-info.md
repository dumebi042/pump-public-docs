# pump-fun

[Instructions](https://cantina.xyz/?overviewTab=0&assetGroup=1)  
[Scope](https://cantina.xyz/?overviewTab=1&assetGroup=1)  
Pump.fun is a platform where anyone can launch a fair-launch coin, meaning everyone has equal access to buy and sell when the coin is created. Security is critical to us, and we appreciate your contributions to keeping our platform safe.

## Program Overview

We welcome responsible disclosure of vulnerabilities that could impact:

* User funds  
* User data  
* System integrity

Even if the vulnerability lies outside our defined scope, if it presents a real risk, please report it, we review these on a case-by-case basis.

## Scope of the Program

### In-Scope Assets

Web & Infrastructure

* \*.pump.fun  
* \*.padre.gg  
* Any production infrastructure confirmed to be owned by Pump.fun

Client-Side Applications

* [iOS App](https://apps.apple.com/fr/app/pump-fun/id6717572591?l=en-GB)  
* [Android App](https://play.google.com/store/apps/details?id=com.batonresearch.pump)

Smart Contracts

| Program Name | Devnet Address | IDL File |
| ----- | ----- | ----- |
| Pump | 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P | [View IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json) |
| Pump Fees | pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ | [View IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_fees.json) |
| Pump AMM | pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA | [View IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json) |

⚠️ Only Devnet deployments of these smart contracts are in-scope.

## What We’re Looking For

### Primary Focus Areas

We are especially interested in vulnerabilities related to:

* Theft of user funds  
* Leakage of sensitive information  
* Unauthorized access to build pipelines, environments, or internal processes

### Vulnerability Types

Any security or privacy-related issue that affects in-scope assets is eligible for submission.

## Disclosure Requirements

All reports must include:

* Clear vulnerability description and potential impact  
* Video demonstration to clearly show the vulnerability’s impact.  
* Reproduction steps or proof-of-concept  
* Environment details (browser, device, OS, etc.)  
* Potential real-world consequences  
* Anchor test script (.ts or .rs) OR Manual reproduction using Solana CLI or equivalent  
* Any necessary test wallets, accounts, or mocked data

Submit within 24 hours of discovery, if possible.

## Eligibility Requirements

To be eligible for a reward:

* Be first to report a previously unknown, in-scope vulnerability  
* Provide sufficient detail for reproduction and remediation  
* Refrain from malicious exploitation or disclosure  
* Be legally permitted to participate (not a resident of embargoed countries, and of legal age)  
* Be available to assist in verifying the fix if needed

## Severity & Rewards

Vulnerabilities are scored based on:

* Impact (Critical → Low)  
* Likelihood (High → Low)

### Severity Matrix

| Likelihood \\ Impact | Critical | High | Medium | Low |
| ----- | ----- | ----- | ----- | ----- |
| High | Critical | High | Medium | Low |
| Medium | High | High | Medium | Low |
| Low | Medium | Medium | Low | Informational |

### Impact Levels

* Critical – Loss of user funds, systemic disruption, major compromise  
* High – Substantial harm, moderate trust erosion  
* Medium – Contained financial impact or moderate exploitability  
* Low / Info – Minimal or best-practice-level concerns

#### Smart Contract–Specific Impact Guidance

* Critical Impact  
  For smart contract bugs: An issue that results in losses (by stealing, wasting, or permanently freezing) amounting to 20%–100% of the total TVL across pump.fun's bonding curves or AMM liquidity pools.  
  Other considerations: Issues that could impact large groups of users across multiple tokens, undermine trust in pump.fun as a platform, or create severe reputational, legal, or systemic financial risk.  
* High Impact  
  For smart contract bugs: An issue that results in losses (by stealing, wasting, or permanently freezing) amounting to 0.5%–20% of the total TVL across pump.fun's bonding curves or AMM liquidity pools.  
  Other considerations: Issues that significantly harm individual users or small groups of traders, where exploitation would result in moderate financial damage or reputational/legal risk to pump.fun or its ecosystem.  
* Medium Impact  
  For smart contract bugs: Issues leading to smaller losses (by stealing, wasting, or permanently freezing) that affect individual users, specific tokens, or isolated liquidity pools.  
  Other considerations: Bugs that do not pose systemic risk but degrade user experience, reliability, or create exploitable inefficiencies (e.g., incorrect slippage calculation on a bonding curve trade that allows an attacker to repeatedly skim small profits).

### Likelihood Levels

* High – Easy to exploit / attractive for attackers  
* Medium – Requires some conditions  
* Low – Hard to execute or reproduce

### Payout Guidelines

Please refer to the [Scope](https://cantina.xyz/code/253a4e11-c99c-49e9-83f7-d076d8804475/overview?overviewTab=1&assetGroup=0) section for payout information.

📝 Final reward is determined at Pump.fun’s sole discretion and depends on report quality, completeness, and exploitability.

## Out of Scope

The following are generally not eligible, but may be reviewed if risk is demonstrated:

* Attacks needing MITM, physical access, or a compromised device  
* Low-severity UI issues (e.g. clickjacking without sensitive action)  
* Known libraries without PoC or not patched upstream  
* SSL/TLS misconfigurations  
* Email best practices (e.g., missing SPF/DKIM/DMARC)  
* Content spoofing without vector  
* DDoS, social engineering, or brute-force on non-auth endpoints  
* Tabnabbing, third-party integrations (case-by-case)  
* Exfiltrating data after RCE

## Prohibited Actions

Please follow these important restrictions:

* ❌ No Public Disclosure Without Permission  
  Do not disclose any findings publicly until resolved and explicitly approved by our team.  
* ❌ No Exploitation or Exfiltration  
  Do not go beyond proof-of-concept. Accessing real user data, performing DoS, or testing social engineering is forbidden.  
* ❌ No Conflict of Interest  
  Current or former Pump.fun employees and contributors to the codebase are not eligible.

## Legal Terms & Discretion

By submitting a report, you grant Pump.fun the rights to:

* Investigate, mitigate, and publicly disclose the vulnerability  
* Determine your eligibility and reward at its sole discretion

Note: The program terms, scope, and rewards may change at any time. Please check for updates before reporting.

* 

