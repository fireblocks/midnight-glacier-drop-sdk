# Midnight Drop Fireblocks SDK

A TypeScript SDK and REST API for managing Midnight protocol token claims and transfers through Fireblocks custody services. This SDK provides secure multi-blockchain support for claiming NIGHT tokens and managing transfers on the Cardano network.

## Features

- **Multi-Blockchain Support**: Claim tokens across Bitcoin, Ethereum, Cardano, BNB Chain, Solana, and Avalanche networks
- **Fireblocks Integration**: Enterprise-grade custody and transaction signing via Fireblocks
- **Token Claims Management**: Check eligibility and execute NIGHT token claims
- **Cardano Transfers**: Transfer NIGHT tokens between Cardano addresses
- **REST API**: Fully documented REST API with Swagger/OpenAPI support

## Prerequisites

- Node.js 20 or higher
- Fireblocks account with API credentials
- Blockfrost project ID (for Cardano token transfers)
- Docker and Docker Compose (for containerized deployment)

## Installation

### Clone the Repository

```bash
git clone https://github.com/fireblocks/midnight-glacier-drop-sdk.git
cd midnight-glacier-drop-sdk
```

### Install Dependencies

```bash
npm install
```

### Environment Configuration

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=8000
# Interface to bind. Defaults to 127.0.0.1 (loopback only).
# HOST=127.0.0.1

# REST API authentication (required - the server refuses to start without it)
# Generate with: openssl rand -hex 32
API_AUTH_TOKEN=your_generated_token

# Fireblocks Configuration
FIREBLOCKS_API_KEY=your_fireblocks_api_key
FIREBLOCKS_SECRET_KEY_PATH=./secrets/fireblocks_secret.key
BASE_PATH=https://api.fireblocks.io

# Blockfrost Configuration (for Cardano tokens transfers)
BLOCKFROST_PROJECT_ID=your_blockfrost_project_id
```

### Fireblocks Secret Key Setup

Place your Fireblocks private key file in the `secrets` directory:

```bash
mkdir -p secrets
# Copy your fireblocks_secret.key to ./secrets/fireblocks_secret.key
```

## Local Development

### TypeScript/JavaScript Usage

#### 1. Direct SDK Usage in TypeScript

```typescript
import { FireblocksMidnightSDK } from "./src/FireblocksMidnightSDK";
import { SupportedBlockchains } from "./src/types";
import { ConfigurationOptions } from "@fireblocks/ts-sdk";

// Create SDK instance using the static create method
// The SDK will automatically initialize all required services internally
async function initializeSdk(
  fireblocksConfig: ConfigurationOptions,
  vaultAccountId: string,
  chain: SupportedBlockchains,
) {
  const sdk = await FireblocksMidnightSDK.create({
    fireblocksConfig,
    vaultAccountId,
    chain,
  });
  return sdk;
}

// Example: Check eligibility for claims
async function checkEligibility(
  vaultAccountId: string = "your-vault-id",
  chain: SupportedBlockchains = SupportedBlockchains.CARDANO,
) {
  // Initialize SDK for this vault and chain
  const sdk = await initializeSdk(vaultAccountId, chain);

  // Check if address exists in Provetree (returns amount if eligible)
  const amount = await sdk.checkAddressAllocation(chain);
  const isEligible = amount > 0;

  console.log(`Vault ${vaultAccountId} eligibility: ${isEligible}`);
  console.log(`Claimable amount: ${amount}`);
}

// Example: Get historical claims (hitorical)
async function getClaimsHistory(
  vaultAccountId: string = "your-vault-id",
  chain: SupportedBlockchains = SupportedBlockchains.ETHEREUM,
) {
  // Initialize SDK for this vault and chain
  const sdk = await initializeSdk(vaultAccountId, chain);

  // Get claims from the claims API
  const claims = await sdk.getClaimsHistory(chain);
  console.log("Available claims:", claims);
}

// Example: Execute claims
async function executeClaims(
  vaultAccountId: string = "your-vault-id",
  chain: SupportedBlockchains = SupportedBlockchains.CARDANO,
  destinationAddress: string = "addr1_destination_address", // Where to send claimed tokens
) {
  try {
    // Initialize SDK for this vault and chain
    const sdk = await initializeSdk(vaultAccountId, chain);

    // Make claims to the specified destination address
    const result = await sdk.makeClaims(chain, destinationAddress);
    console.log("Claims executed successfully:", result);
  } catch (error) {
    console.error("Claim execution failed:", error);
  }
}

// Example: Transfer NIGHT tokens on Cardano
async function transferNightTokens(
  fromVaultId: string = "source-vault-id",
  recipientAddress: string = "addr1_destination_address",
  tokenPolicyId: string = "your_token_policy_id", // NIGHT token policy ID
  tokenAmount: string = 1000, // Amount of NIGHT tokens to transfer
  minRecipientLovelace?: number, // Minimum ADA for recipient (default: 1,200,000)
  minChangeLovelace?: number, // Minimum ADA for change (default: 1,200,000)
) {
  try {
    // Initialize SDK for Cardano
    const sdk = await initializeSdk(fromVaultId, SupportedBlockchains.CARDANO);

    // Transfer claims/tokens to recipient
    const result = await sdk.transferClaims(
      recipientAddress,
      tokenPolicyId,
      tokenAmount,
      minRecipientLovelace,
      minChangeLovelace,
    );
    console.log("Transfer successful:", result);
    console.log("Transaction hash:", result.txHash);
  } catch (error) {
    console.error("Transfer failed:", error);
  }
}

// Run examples
checkEligibility().catch(console.error);
getAvailableClaims().catch(console.error);
executeClaims().catch(console.error);
transferNightTokens().catch(console.error);
```

#### 2. Using the SDK Pool Manager

```typescript
import { SdkManager } from "./src/pool/sdkManager";
import { SupportedBlockchains } from "./src/types";
import { config } from ".src/utils/config.js";

const baseConfig = {
  apiKey: config.FIREBLOCKS.apiKey || "",
  secretKey: config.FIREBLOCKS.secretKey || "",
  basePath: (config.FIREBLOCKS.basePath as BasePath) || BasePath.US,
};

// Initialize SDK pool manager
const sdkManager = new SdkManager(baseConfig, {
  maxPoolSize: 100, // Maximum number of SDK instances
  idleTimeoutMs: 1800000, // 30 minutes idle timeout
  cleanupIntervalMs: 300000, // 5 minutes cleanup interval
  connectionTimeoutMs: 30000, // 30 seconds connection timeout
  retryAttempts: 3, // Number of retry attempts
});

// Get SDK instance from pool
async function performOperationsWithPool() {
  const vaultAccountId = "your-vault-id";
  const chain = SupportedBlockchains.ETHEREUM;

  // Get or create SDK instance for vault and chain
  // The pool automatically manages instance lifecycle
  const sdk = await sdkManager.getSdk(vaultAccountId, chain);

  // Perform operations
  const claims = await sdk.getClaimsHistory(chain);
  console.log("Claims:", claims);

  // SDK instance is automatically returned to pool after use
  // and can be reused for subsequent requests
}

// Cleanup on shutdown
process.on("SIGTERM", () => {
  sdkManager.cleanup();
  process.exit(0);
});
```

### Running the Development Server

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production server
npm start

# Generate documentation
npm run docs

# Run linter
npm run lint
```

## Docker Deployment

### Build and Run with Docker

```bash
# Build Docker image
docker build -t midnight-glacier-drop-sdk .

# Run container
docker run -d \
  --name midnight-glacier-drop-sdk \
  -p 127.0.0.1:8000:8000 \
  -v $(pwd)/secrets:/app/secrets:ro \
  -v $(pwd)/.env:/app/.env:ro \
  midnight-glacier-drop-sdk
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The `docker-compose.yml` configuration:

- Mounts the Fireblocks secret key from `./secrets`
- Loads environment variables from `.env`
- Publishes the API on `127.0.0.1:8000` only (loopback on the host). Put a reverse proxy or
  private network in front of it if other machines need access. Do not publish it on `0.0.0.0`.
- Includes automatic restart on failure

## REST API Usage

The SDK provides a REST API accessible at `http://localhost:8000`. Full API documentation is available at `http://localhost:8000/api-docs`.

### Authentication

Every endpoint except `GET /health` (including `/api-docs`, `/api-docs-json` and `/docs`) requires a
bearer token matching the server's `API_AUTH_TOKEN`:

```bash
curl -H "Authorization: Bearer $API_AUTH_TOKEN" "http://localhost:8000/api/check/cardano/vault-123"
```

| Situation                                                   | Result                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Missing or malformed `Authorization` header, or wrong token | `401`                                                                                                |
| `API_AUTH_TOKEN` not set                                    | Server refuses to start (and answers `503` if it somehow runs)                                       |
| `ALLOW_UNAUTHENTICATED=true`                                | Honoured **only** when `NODE_ENV=development` or `test`; refused at startup in any other environment |

Notes:

- Generate the token with `openssl rand -hex 32` and keep it in a secrets manager or the git-ignored `.env`. Never commit it.
- Claims, transfers and scavenger-hunt donations sign a message containing a destination address taken from the request.
  Anyone holding the token can choose that address, so treat the token like a signing credential.
- This token authenticates callers to this service. Which vaults the service can sign for is governed by Fireblocks:
  use a dedicated API user restricted to the vaults it needs, with a Transaction Authorization Policy (TAP).
- In Swagger UI (`/api-docs`), use **Authorize** and paste the token.

### API Endpoints

#### 1. Check Address in Provetree

```bash
# Check if an address is eligible for claims
curl -X GET "http://localhost:8000/api/check/cardano/vault-123" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

Response:

```json
{
  "value": 1000000000 // NIGHT alocation value
}
```

#### 2. Get Available Claims

```bash
# Get all available claims for a vault
curl -X GET "http://localhost:8000/api/claims/avax/vault-123" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

Response:

```json
[
  {
    "address": "0x1e538dacdb32ef8d5728a50fe27d3fb25f78f0cb",
    "amount": 2134677,
    "blockchain": "avax",
    "claim_id": "d1c8dc2f-7a02-850d-173d-b67959e78085",
    "confirmation_blocks": null,
    "failure": null,
    "leaf_index": 31225197,
    "status": "queued",
    "transaction_id": null
  }
]
```

#### 3. Execute Claims

```bash
# Execute claims for a specific chain
curl -X POST "http://localhost:8000/api/claims/cardano" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{
  "originVaultAccountId": "vault-123",
  "destinationAddress": "0x1234567890abcdef1234567890abcdef12345678"
}'
```

Response:

```json
[
  {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "amount": "1000000000",
    "claim_id": "abc123",
    "dest_address": "0x0987654321abcdef0987654321abcdef87654321"
  }
]
```

#### 4. Transfer NIGHT Tokens

```bash
# Transfer NIGHT tokens between addresses
curl -X POST "http://localhost:8000/api/claim/transfer" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceVaultId": "vault-123",
    "destinationVaultId": "addr1_destination_address",
    "claimId": "abc123"
  }'
```

Response:

```json
{
  "transactionHash": "tx_hash_456",
  "senderAddress": "addr1_sender_address",
  "tokenName": "NIGHT"
}
```

#### 5. Get Fireblocks Vault Addresses

```bash
# Get deposit addresses for a vault
curl -X GET "http://localhost:8000/api/vaults/bitcoin/vault-123" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

Response:

```json
{
  "addresses": [
    {
      "assetId": "BTC",
      "address": "btc1q_example_address",
      "description": "",
      "tag": "",
      "type": "Permanent",
      "addressFormat": "SEGWIT",
      "legacyAddress": "btc1NZ_example_address",
      "enterpriseAddress": "",
      "bip44AddressIndex": 0,
      "userDefined": false
    }
  ],
  ...
}
```

#### 6. Health Check

```bash
# Check service health
curl -X GET "http://localhost:8000/health"
```

Response:

```json
Alive
```

### Supported Blockchains

The SDK supports the following blockchain networks:

| Chain     | Network         | Token | Fireblocks Asset ID |
| --------- | --------------- | ----- | ------------------- |
| BITCOIN   | Mainnet         | BTC   | BTC / BTC_TEST      |
| ETHEREUM  | Mainnet         | ETH   | ETH                 |
| CARDANO   | Mainnet/Preprod | ADA   | ADA / ADA_TEST      |
| BNB       | BNB Smart Chain | BNB   | BNB_BSC             |
| SOLANA    | Mainnet/Devnet  | SOL   | SOL / SOL_TEST      |
| AVALANCHE | C-Chain         | AVAX  | AVAX                |

## API Documentation

### Swagger Documentation

Access the interactive API documentation at:

- Swagger UI: `http://localhost:8000/api-docs`
- OpenAPI JSON: `http://localhost:8000/api-docs-json`

### TypeDoc Documentation

Generate and view TypeScript documentation:

```bash
# Generate documentation
npm run docs

# Open docs/index.html in your browser
open docs/index.html
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [Midnight Protocol](https://midnight.network)
- [Fireblocks Documentation](https://developers.fireblocks.com)
- [Blockfrost Documentation](https://docs.blockfrost.io)
- [API Documentation](http://localhost:8000/api-docs)
