require('dotenv').config();
const { ethers } = require('ethers');
const { getMinioClient } = require('./pkg/monio/index.js');
const { Tee } = require('./pkg/tee/index.js');

const strip0x = (hash) => hash.startsWith('0x') ? hash.slice(2) : hash;

/**
 * Main application class for COA (Currency Operations Automation)
 */
class COAApplication {
    constructor() {
        this.privateKey = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        this.minioClient = getMinioClient();

        if (!this.privateKey) {
            throw new Error('PRIVATE_KEY environment variable is required');
        }

        // Initialize wallet
        this.wallet = new ethers.Wallet(this.privateKey);

        // Contract addresses and configuration
        this.contractConfig = {
            tokenAddress: process.env.TOKEN_ADDRESS || '0x67444Ef5EACC7316b236358937AA93A09589066b', // Token contract address
            inferenceAddress: process.env.INFERENCE_ADDRESS || '0x3d97Cd1DF617B9eaC567cC13c24D798C72bCdF69', // Inference contract address
            agentAddress: process.env.AGENT_ADDRESS || '0x0DDFf27aB1eC8f88fdFAAF25CC6b984b1CFBc4e4', // Address to approve for spending
            rpcUrl: process.env.RPC_URL || 'https://avalanche-fuji-c-chain-rpc.publicnode.com'
        };

        // Initialize provider
        this.provider = new ethers.JsonRpcProvider(this.contractConfig.rpcUrl);
        this.wallet = this.wallet.connect(this.provider);
    }

    /**
     * Upload prompt to MinIO storage
     * @param {string} prompt - The prompt to upload
     * @returns {Promise<string>} Returns the object key
     */
    async uploadPrompt(prompt) {
        try {
            const objectKey = await this.minioClient.putObject(prompt);
            return objectKey;
        } catch (error) {
            console.error('❌ Failed to upload prompt:', error.message);
            throw error;
        }
    }

    /**
     * Approve token spending for the spender address
     * @param {string} amount - Amount to approve (in wei or token units)
     * @returns {Promise<ethers.ContractTransactionResponse>} Transaction response
     */
    async approveTokens(amount) {
        try {
            console.log('🔐 Approving token spending...');

            // ERC20 Token ABI (minimal for approve function)
            const tokenABI = [
                "function approve(address spender, uint256 amount) external returns (bool)",
                "function allowance(address owner, address spender) external view returns (uint256)"
            ];

            const tokenContract = new ethers.Contract(
                this.contractConfig.tokenAddress,
                tokenABI,
                this.wallet
            );

            // Check current allowance
            const currentAllowance = await tokenContract.allowance(
                this.wallet.address,
                this.contractConfig.agentAddress
            );

            console.log(`Current allowance: ${ethers.formatEther(currentAllowance)} tokens`);

            // If allowance is sufficient, no need to approve
            if (currentAllowance >= amount) {
                console.log('✅ Sufficient allowance already exists');
                return null;
            }

            // Approve tokens
            const tx = await tokenContract.approve(
                this.contractConfig.agentAddress,
                amount
            );

            console.log('⏳ Waiting for approval transaction to be mined...');
            const receipt = await tx.wait();

            console.log('✅ Token approval successful. Transaction hash:', receipt.hash);
            return receipt;

        } catch (error) {
            console.error('❌ Token approval failed:', error.message);
            throw error;
        }
    }



    /**
     * Call inference function on the blockchain
     * @param {string} objectKey - The MinIO object key containing the prompt
     * @param {string} model - The model to use for inference
     * @returns {Promise<ethers.ContractTransactionResponse>} Transaction response
     */
    async callInference(objectKey, model = "COA") {
        try {
            console.log('🤖 Calling inference function...');

            // Inference contract ABI based on the actual contract
            const inferenceABI = [
                "function requestCall(string calldata model, bytes32 promptHash) external",
                "function calls(uint256) external view returns (address caller, string model, bytes32 promptHash, bytes32 resultHash, bytes32 reportHash)",
                "function models(string) external view returns (bool)",
                "event CallRequested(uint256 indexed requestId, address indexed caller, string model, bytes32 promptHash)",
                "event CallFinished(uint256 indexed requestId, bytes32 resultHash, bytes32 reportHash)"
            ];

            const inferenceContract = new ethers.Contract(
                this.contractConfig.inferenceAddress,
                inferenceABI,
                this.wallet
            );

            // Check if model is supported
            const isModelSupported = await inferenceContract.models(model);
            if (!isModelSupported) {
                throw new Error(`Model ${model} is not supported`);
            }

            // Convert objectKey to bytes32 hash
            const promptHash = '0x' + objectKey;

            console.log(`📝 Using model: ${model}`);
            console.log(`🔐 Prompt hash: ${promptHash}`);

            // Call requestCall function
            const tx = await inferenceContract.requestCall(model, promptHash);

            console.log('⏳ Waiting for inference request transaction to be mined...');
            const receipt = await tx.wait();

            // Get the request ID from the event
            const event = receipt.logs.find(log => {
                try {
                    const parsed = inferenceContract.interface.parseLog(log);
                    return parsed.name === 'CallRequested';
                } catch {
                    return false;
                }
            });

            let requestId;
            if (event) {
                const parsed = inferenceContract.interface.parseLog(event);
                requestId = parsed.args.requestId;
                console.log(`📋 Request ID: ${requestId}`);
            }

            console.log('✅ Inference request successful. Transaction hash:', receipt.hash);
            return { receipt, requestId, promptHash };

        } catch (error) {
            console.error('❌ Inference call failed:', error.message);
            throw error;
        }
    }

    /**
     * Main execution flow
     * @param {string} prompt - The prompt to process
     * @param {string} amount - Amount to approve for transfer
     * @param {string} model - The model to use for inference (default: "COA")
     * @param {boolean} waitForResult - Whether to wait for inference result (default: true)
     * @returns {Promise<Object>} Execution result
     */
    async execute(prompt, amount, model = "COA", waitForResult = true) {
        try {
            console.log('🚀 Starting COA execution...');
            console.log('📝 Prompt:', prompt);
            console.log('💰 Amount to approve:', amount);
            console.log('🤖 Model:', model);
            console.log('👤 Wallet address:', this.wallet.address);

            // Step 1: Approve tokens for the spender
            await this.approveTokens(amount);

            // Step 2: Upload prompt to MinIO
            const objectKey = await this.uploadPrompt(prompt);

            // Step 3: Call inference with COA model
            const inferenceResult = await this.callInference(objectKey, model);

            console.log('🎉 Initial COA execution completed successfully!');
            console.log(`📋 Request ID: ${inferenceResult.requestId}`);
            console.log(`🔐 Prompt Hash: ${inferenceResult.promptHash}`);

            // Step 4: Wait for relayer to process and get final result
            if (waitForResult) {
                console.log('⏳ Waiting for relayer to process the request...');
                const finalResult = await this.waitForInferenceResult(inferenceResult.requestId);

                console.log('🎉 Final result received!');
                console.log('📄 Result:', finalResult.result);
                console.log('📋 Report:', finalResult.report);

                return {
                    ...inferenceResult,
                    finalResult
                };
            }

            return inferenceResult;

        } catch (error) {
            console.error('💥 COA execution failed:', error.message);
            throw error;
        }
    }

    /**
     * Get wallet balance
     * @returns {Promise<string>} Balance in ETH
     */
    async getBalance() {
        const balance = await this.provider.getBalance(this.wallet.address);
        return ethers.formatEther(balance);
    }

    /**
 * Check if a model is supported
 * @param {string} model - Model name to check
 * @returns {Promise<boolean>} True if model is supported
 */
    async isModelSupported(model) {
        try {
            const inferenceABI = ["function models(string) external view returns (bool)"];
            const inferenceContract = new ethers.Contract(
                this.contractConfig.inferenceAddress,
                inferenceABI,
                this.provider
            );

            return await inferenceContract.models(model);
        } catch (error) {
            console.warn(`⚠️ Could not check if model ${model} is supported:`, error.message);
            console.log('🔍 This might mean the contract is not deployed or address is incorrect');
            return false;
        }
    }

    /**
     * Get all available models from the contract
     * @returns {Promise<string[]>} List of all available models
     */
    async getAllModels() {
        try {
            console.log('🔍 Querying all available models from contract...');

            const inferenceABI = [
                "function getAllModels() external view returns (string[] memory)",
            ];

            const inferenceContract = new ethers.Contract(
                this.contractConfig.inferenceAddress,
                inferenceABI,
                this.provider
            );

            const models = await inferenceContract.getAllModels();
            console.log(`✅ Found ${models.length} models:`, models);
            return models;

        } catch (error) {
            console.error('❌ Failed to get all models:', error.message);
            return error
        }
    }

    /**
     * Get request details
     * @param {number} requestId - Request ID to get details for
     * @returns {Promise<Object>} Request details
     */
    async getRequestDetails(requestId) {
        const inferenceABI = [
            "function calls(uint256) external view returns (address caller, string model, bytes32 promptHash, bytes32 resultHash, bytes32 reportHash)"
        ];
        const inferenceContract = new ethers.Contract(
            this.contractConfig.inferenceAddress,
            inferenceABI,
            this.provider
        );

        const call = await inferenceContract.calls(requestId);
        return {
            caller: call.caller,
            model: call.model,
            promptHash: call.promptHash,
            resultHash: call.resultHash,
            reportHash: call.reportHash
        };
    }


    /**
     * Wait for inference result and get the final data
     * @param {number} requestId - Request ID to wait for
     * @param {number} maxWaitTime - Maximum wait time in milliseconds (default: 5 minutes)
     * @param {number} checkInterval - Check interval in milliseconds (default: 10 seconds)
     * @returns {Promise<Object>} Result and report data
     */
    async waitForInferenceResult(requestId, maxWaitTime = 5 * 60 * 1000, checkInterval = 10 * 1000) {
        console.log(`⏳ Waiting for inference result for request ${requestId}...`);

        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            const details = await this.getRequestDetails(requestId);

            // Check if result is ready (resultHash and reportHash are not zero)
            if (details.resultHash !== ethers.ZeroHash && details.reportHash !== ethers.ZeroHash) {
                console.log('✅ Inference result is ready!');
                console.log(`🔐 Result hash: ${details.resultHash}`);
                console.log(`📄 Report hash: ${details.reportHash}`);

                // Get the actual result and report from MinIO
                const result = await this.minioClient.getObject(strip0x(details.resultHash));
                const report = await this.minioClient.getObject(strip0x(details.reportHash));

                return {
                    requestId,
                    resultHash: details.resultHash,
                    reportHash: details.reportHash,
                    result,
                    report
                };
            }

            console.log(`⏳ Still waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        throw new Error(`Timeout waiting for inference result after ${maxWaitTime / 1000} seconds`);
    }

    /**
 * Get token balance
 * @returns {Promise<string>} Token balance
 */
    async getTokenBalance() {
        try {
            const tokenABI = ["function balanceOf(address owner) external view returns (uint256)"];
            const tokenContract = new ethers.Contract(
                this.contractConfig.tokenAddress,
                tokenABI,
                this.provider
            );

            const balance = await tokenContract.balanceOf(this.wallet.address);
            return ethers.formatEther(balance);
        } catch (error) {
            console.warn('⚠️ Could not get token balance:', error.message);
            return "0";
        }
    }
}

/**
 * Main function to run the application
 */
async function main() {
    try {
        // Example usage
        const app = new COAApplication();

        // Get balances
        const ethBalance = await app.getBalance();
        const tokenBalance = await app.getTokenBalance();
        console.log('💰 ETH Balance:', ethBalance);
        console.log('🪙 Token Balance:', tokenBalance);

        // Check available models
        console.log('🔍 Checking available models...');

        const allModels = await app.getAllModels();
        console.log('📋 All models from contract:', allModels);

        // Check if COA model is supported
        const model = "COA";
        const isSupported = await app.isModelSupported(model);
        console.log(`🤖 Model ${model} supported:`, isSupported);

        if (!isSupported) {
            console.log('❌ COA model not supported. The model might not be added to the contract yet.');
            return;
        }

        // Example natural language transfer prompt
        const prompt = "I want to transfer 10 USDT to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
        const amount = ethers.parseEther("10"); // 10 tokens to approve

        console.log('🚀 Starting complete COA flow...');
        console.log('📝 Natural language prompt:', prompt);
        console.log('💰 Amount to approve:', ethers.formatEther(amount), 'tokens');

        // Execute the complete flow
        const result = await app.execute(prompt, amount, model, true);

        console.log('✅ Complete execution finished!');

        // Verify the result if available
        if (result.finalResult && result.finalResult.report) {
            const tee = new Tee();
            const reportDetails = await tee.parseAndVerifyJWT(result.finalResult.report);
            console.log('✅ Result verified:', reportDetails);
        } else {
            console.log('⚠️ No report available for verification');
        }
    } catch (error) {
        console.error('Application error:', error);
        process.exit(1);
    }
}

// Export the class for use in other modules
module.exports = COAApplication;

// Run main function if this file is executed directly
if (require.main === module) {
    main();
}
