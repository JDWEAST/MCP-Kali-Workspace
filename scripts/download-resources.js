#!/usr/bin/env node

/**
 * Download mcp_server.py from the official Kali Linux GitLab repository
 * This ensures we always package the latest version from upstream
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const ALLOWED_DOWNLOAD_HOSTS = ['gitlab.com', 'www.gitlab.com'];
const MCP_SERVER_URL = 'https://gitlab.com/kalilinux/packages/mcp-kali-server/-/raw/kali/master/mcp_server.py';
const REQUIREMENTS_URL = 'https://gitlab.com/kalilinux/packages/mcp-kali-server/-/raw/kali/master/requirements.txt';
const FALLBACK_MCP_SERVER = `#!/usr/bin/env python3
# Fallback MCP server stub for offline packaging.
# The extension will attempt to download the upstream file at runtime when network access is available.

import sys

if __name__ == '__main__':
    print('MCP Kali fallback server stub. Configure the real Kali MCP server for full functionality.', file=sys.stderr)
    sys.exit(0)
`;
const FALLBACK_REQUIREMENTS = '# Fallback requirements for offline packaging\n';
const EXPECTED_MCP_SERVER_SHA256 = process.env.MCP_KALI_MCP_SERVER_SHA256 || '';
const EXPECTED_REQUIREMENTS_SHA256 = process.env.MCP_KALI_REQUIREMENTS_SHA256 || '';

// Ensure resources directory exists
if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

function writeFallbackFile(destPath, content) {
    fs.writeFileSync(destPath, content, 'utf8');
    console.log(`⚠ Using bundled fallback content at ${destPath}`);
}

function normalizeSha256(value) {
    return value.trim().toLowerCase();
}

function verifyDownloadedFile(destPath, expectedSha256) {
    const normalizedExpected = normalizeSha256(expectedSha256);
    if (!normalizedExpected) {
        return;
    }

    const hash = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
    if (hash !== normalizedExpected) {
        throw new Error(`Integrity verification failed for ${destPath}. Expected ${normalizedExpected}, got ${hash}`);
    }
}

function isAllowedHost(hostname) {
    return ALLOWED_DOWNLOAD_HOSTS.includes(hostname.toLowerCase());
}

function addSourceAttribution(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('# Source: https://gitlab.com/kalilinux/packages/mcp-kali-server')) {
        return;
    }

    const attribution = `# Source: https://gitlab.com/kalilinux/packages/mcp-kali-server
# This file is downloaded during the build process from the official Kali Linux repository when available.
# Fallback content is bundled for offline packaging.

`;

    if (content.startsWith('#!')) {
        const firstNewlineIndex = content.indexOf('\n');
        if (firstNewlineIndex !== -1) {
            const shebang = content.slice(0, firstNewlineIndex + 1);
            const remainder = content.slice(firstNewlineIndex + 1);
            fs.writeFileSync(filePath, `${shebang}${attribution}${remainder}`);
            return;
        }
    }

    fs.writeFileSync(filePath, attribution + content);
}

function downloadFile(url, destPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            reject(new Error(`Invalid download URL: ${url}`));
            return;
        }

        if (parsedUrl.protocol !== 'https:') {
            reject(new Error(`Blocked non-HTTPS download URL: ${url}`));
            return;
        }

        if (!isAllowedHost(parsedUrl.hostname)) {
            reject(new Error(`Blocked download host: ${parsedUrl.hostname}`));
            return;
        }

        console.log(`Downloading ${url}...`);

        const tempPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
        const request = https.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                if (redirectCount >= MAX_REDIRECTS) {
                    reject(new Error(`Too many redirects while downloading ${url}`));
                    return;
                }

                const redirectLocation = response.headers.location;
                if (!redirectLocation) {
                    reject(new Error(`Redirect response missing location header: ${url}`));
                    return;
                }

                const redirectUrl = new URL(redirectLocation, url).toString();
                return downloadFile(redirectUrl, destPath, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
                return;
            }

            const file = fs.createWriteStream(tempPath);
            response.pipe(file);

            file.on('finish', () => {
                file.close((closeError) => {
                    if (closeError) {
                        fs.unlink(tempPath, () => {});
                        reject(closeError);
                        return;
                    }

                    try {
                        fs.renameSync(tempPath, destPath);
                        console.log(`✓ Downloaded to ${destPath}`);
                        resolve();
                    } catch (renameError) {
                        fs.unlink(tempPath, () => {});
                        reject(renameError);
                    }
                });
            });

            file.on('error', (err) => {
                fs.unlink(tempPath, () => {});
                reject(err);
            });

            response.on('error', (err) => {
                fs.unlink(tempPath, () => {});
                reject(err);
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
        });

        request.on('error', (err) => {
            fs.unlink(tempPath, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log('Downloading resources from Kali Linux GitLab repository...\n');

    const mcpServerPath = path.join(RESOURCES_DIR, 'mcp_server.py');
    const requirementsPath = path.join(RESOURCES_DIR, 'requirements.txt');

    try {
        await downloadFile(MCP_SERVER_URL, mcpServerPath);
        verifyDownloadedFile(mcpServerPath, EXPECTED_MCP_SERVER_SHA256);
    } catch (error) {
        console.warn(`Warning: unable to download ${MCP_SERVER_URL}: ${error.message}`);
        writeFallbackFile(mcpServerPath, FALLBACK_MCP_SERVER);
    }

    try {
        await downloadFile(REQUIREMENTS_URL, requirementsPath);
        verifyDownloadedFile(requirementsPath, EXPECTED_REQUIREMENTS_SHA256);
    } catch (error) {
        console.warn(`Warning: unable to download ${REQUIREMENTS_URL}: ${error.message}`);
        writeFallbackFile(requirementsPath, FALLBACK_REQUIREMENTS);
    }

    addSourceAttribution(mcpServerPath);

    console.log('\n✓ Resource preparation completed');
}

main();
