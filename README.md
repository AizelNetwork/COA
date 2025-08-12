# COA (Currency Operations Automation)

Natural language triggers the logic of currency transfer using blockchain and AI inference.

## Overview

COA is a system that allows users to perform token transfers using natural language commands. The process involves:

1. **Token Authorization**: User approves tokens for the spender address
2. **Prompt Upload**: Natural language command is uploaded to MinIO storage
3. **AI Inference**: COA model processes the command on-chain
4. **Relayer Processing**: Background relayer executes the transfer
5. **Result Retrieval**: Final result and report are retrieved from MinIO

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Required
PRIVATE_KEY=your_wallet_private_key_here

# Optional (will use defaults if not set)
RPC_URL=https://mainnet.infura.io/v3/your-project-id
TOKEN_ADDRESS=0x... # ERC20 token contract address
SPENDER_ADDRESS=0x... # Address to approve for spending tokens
INFERENCE_ADDRESS=0x... # Inference contract address
```

## Usage

### Basic Usage

```javascript
const COAApplication = require('./index.js');

const app = new COAApplication();

// Execute complete flow
const result = await app.execute(
    "我要给0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6发送10个USDT",
    ethers.parseEther("10"), // Amount to approve
    "COA", // Model name
    true // Wait for result
);
```

### Step-by-Step Usage

```javascript
const app = new COAApplication();

// 1. Check balances
const ethBalance = await app.getBalance();
const tokenBalance = await app.getTokenBalance();

// 2. Check if COA model is supported
const isSupported = await app.isModelSupported("COA");

// 3. Approve tokens
await app.approveTokens(ethers.parseEther("10"));

// 4. Upload prompt to MinIO
const objectKey = await app.uploadPrompt("我要给0x...发送10个USDT");

// 5. Call inference
const inferenceResult = await app.callInference(objectKey, "COA");

// 6. Wait for relayer to process
const finalResult = await app.waitForInferenceResult(inferenceResult.requestId);

// 7. Get request details
const details = await app.getRequestDetails(inferenceResult.requestId);
```

## API Reference

### COAApplication Class

#### Constructor
```javascript
new COAApplication(config)
```

#### Methods

##### `execute(prompt, amount, model, waitForResult)`
Main execution flow that handles the complete process.

- `prompt` (string): Natural language command
- `amount` (BigNumber): Amount to approve for transfer
- `model` (string): Model name (default: "COA")
- `waitForResult` (boolean): Whether to wait for inference result (default: true)

##### `approveTokens(amount)`
Approve tokens for the spender address.

##### `uploadPrompt(prompt)`
Upload prompt to MinIO storage.

##### `callInference(objectKey, model)`
Call inference function on the blockchain.

##### `waitForInferenceResult(requestId, maxWaitTime, checkInterval)`
Wait for inference result and retrieve final data.

##### `getRequestDetails(requestId)`
Get request details from the blockchain.

##### `isModelSupported(model)`
Check if a model is supported.

##### `getBalance()`
Get ETH balance.

##### `getTokenBalance()`
Get token balance.

## Contract Integration

The system integrates with the following smart contracts:

### Inference Contract
- `requestCall(model, promptHash)`: Request AI inference
- `submitResult(requestId, resultHash, reportHash)`: Submit inference results
- `models(model)`: Check if model is supported

### ERC20 Token Contract
- `approve(spender, amount)`: Approve token spending
- `allowance(owner, spender)`: Check current allowance
- `balanceOf(owner)`: Get token balance

## Flow Diagram

```
User Input (Natural Language)
           ↓
    Token Approval
           ↓
   Upload to MinIO
           ↓
   Call Inference Contract
           ↓
   Relayer Processes Request
           ↓
   Transfer Agent Executes
           ↓
   Results Stored in MinIO
           ↓
   Retrieve Final Results
```

## Error Handling

The application includes comprehensive error handling for:

- Network connectivity issues
- Contract interaction failures
- MinIO upload/download errors
- Timeout scenarios
- Invalid model requests

## Development

```bash
# Install dependencies
npm install

# Test connection and contract status
npm test

# Run the application
npm start

# Deploy contracts (requires bytecode)
npm run deploy

# Run with nodemon for development
npx nodemon index.js
```

## Troubleshooting

### Contract Not Deployed Error
If you see "Contract is not deployed" errors:

1. **Check contract addresses**: Verify the addresses in your `.env` file
2. **Deploy contracts**: Use `npm run deploy` to deploy contracts
3. **Test connection**: Use `npm test` to verify blockchain connection

### Model Not Supported Error
If you see "Model not supported" errors:

1. **Add the model**: The application will attempt to add the COA model automatically
2. **Manual addition**: Use the contract owner account to call `addModel("COA")`
3. **Check available models**: The application will show available models

### Common Issues

- **RPC URL**: Make sure your RPC URL is correct and accessible
- **Private Key**: Ensure your private key has sufficient ETH for gas fees
- **Network**: Verify you're connected to the correct network
- **Contract Bytecode**: For deployment, you need the actual compiled bytecode

## License

ISC
