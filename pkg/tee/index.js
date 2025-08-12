const { jwtVerify, importJWK } = require('jose');
const https = require('https');

// Simple fetch implementation using https
async function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => JSON.parse(data)
                });
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

class Tee {
    constructor() {
        this.jwksUrl = process.env.JWKS_URL || 'https://confidentialcomputing.aizelnetwork.com/api/jwks';
    }

    async getJWKFromJWKS(kid) {
        return await getJWKFromJWKS(this.jwksUrl, kid);
    }

    async parseAndVerifyJWT(token) {
        return await parseAndVerifyJWT(token, this.jwksUrl);
    }
}

/**
 * get JWK from JWKS URL
 */
async function getJWKFromJWKS(jwksUrl, kid) {
    try {
        const res = await fetch(jwksUrl);
        if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
        const jwks = await res.json();
        const jwk = jwks.keys.find(k => k.kid === kid);
        if (!jwk) throw new Error(`JWK with kid ${kid} not found`);
        return jwk;
    } catch (error) {
        console.error('Error fetching JWK:', error.message);
        throw error;
    }
}
/**
 * parse and verify JWT
 */
async function parseAndVerifyJWT(token, jwksUrl) {
    try {
        // 1. 解析 header
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        if (!headerB64 || !payloadB64 || !signatureB64) {
            throw new Error('Invalid JWT format');
        }
        
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
        const kid = header.kid;
        const alg = header.alg;
        
        if (!kid || !alg) {
            throw new Error('Missing kid or alg in JWT header');
        }
        
        // 2. get JWK
        const jwk = await getJWKFromJWKS(jwksUrl, kid);
        
        // 3. import JWK
        const key = await importJWK(jwk, alg);
        const payloadUnverified = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        const customDate = new Date(payloadUnverified.iat * 1000);
        
        // 4. verify signature
        try {
            const { payload } = await jwtVerify(token, key, { algorithms: [alg], currentDate: customDate });
            return {
                header,
                payload,
                signatureValid: true
            };
        } catch (e) {
            return {
                header,
                signatureValid: false,
                error: e.message
            };
        }
    } catch (error) {
        console.error('Error parsing JWT:', error.message);
        return {
            signatureValid: false,
            error: error.message
        };
    }
}

module.exports = { Tee };