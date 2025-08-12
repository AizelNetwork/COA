const http = require('http');
const https = require('https');
const { URL } = require('url');
const querystring = require('querystring');

/**
 * MinIO client configuration
 */
const DEFAULT_CONFIG = {
    endpoint: 'http://34.126.81.115:8080',
    timeout: 30000, // 30 seconds timeout
    retries: 3,     // retry attempts
    userAgent: 'MinIO-NodeJS-Client/1.0.0'
};

/**
 * MinIO client class
 */
class MinioClient {
    /**
     * Create MinIO client instance
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.serverURL = this.config.endpoint.replace(/\/$/, '');
        this.baseURL = new URL(this.serverURL);
    }

    /**
     * Send HTTP request
     * @param {Object} options - Request options
     * @returns {Promise<any>}
     */
    async _makeRequest(options) {
        const { method = 'GET', path, data, headers = {} } = options;
        
        const url = new URL(path, this.serverURL);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const requestOptions = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'User-Agent': this.config.userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                ...headers
            },
            timeout: this.config.timeout
        };

        if (data) {
            const postData = querystring.stringify(data);
            requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        return new Promise((resolve, reject) => {
            const req = protocol.request(requestOptions, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: responseData
                        });
                    } else {
                        const error = new Error(`HTTP ${res.statusCode}: ${responseData}`);
                        error.statusCode = res.statusCode;
                        error.response = responseData;
                        reject(error);
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Request failed: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(querystring.stringify(data));
            }
            req.end();
        });
    }

    /**
     * Request with retry mechanism
     * @param {Object} options - Request options
     * @returns {Promise<any>}
     */
    async _requestWithRetry(options) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.retries; attempt++) {
            try {
                return await this._makeRequest(options);
            } catch (error) {
                lastError = error;
                
                // If this is the last attempt, throw the error directly
                if (attempt === this.config.retries) {
                    break;
                }
                
                // Wait before retrying (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    /**
     * Upload object to MinIO
     * @param {string} content - Content to upload
     * @returns {Promise<string>} Returns object identifier
     */
    async putObject(content) {
        if (!content || typeof content !== 'string') {
            throw new Error('Content must be a non-empty string');
        }

        try {
            const response = await this._requestWithRetry({
                method: 'POST',
                path: '/v1/minio/object',
                data: { content }
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to upload object: ${error.message}`);
        }
    }

    /**
     * Get object from MinIO
     * @param {string} key - Object identifier
     * @returns {Promise<string>} Returns object content
     */
    async getObject(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('Key must be a non-empty string');
        }

        try {
            const response = await this._requestWithRetry({
                method: 'GET',
                path: `/v1/minio/get/${encodeURIComponent(key)}`
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get object: ${error.message}`);
        }
    }

    /**
     * Check service connection status
     * @returns {Promise<boolean>}
     */
    async ping() {
        try {
            await this._makeRequest({
                method: 'GET',
                path: '/v1/minio/health'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}

/**
 * Global client instance
 */
let globalClient = null;

/**
 * Get global MinIO client instance
 * @param {Object} config - Optional configuration options
 * @returns {MinioClient}
 */
function getMinioClient(config = {}) {
    if (!globalClient) {
        globalClient = new MinioClient(config);
    }
    return globalClient;
}

/**
 * Create new MinIO client instance
 * @param {Object} config - Configuration options
 * @returns {MinioClient}
 */
function createMinioClient(config = {}) {
    return new MinioClient(config);
}

module.exports = {
    MinioClient,
    getMinioClient,
    createMinioClient,
    DEFAULT_CONFIG
};