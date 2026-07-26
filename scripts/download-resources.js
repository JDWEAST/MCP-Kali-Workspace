#!/usr/bin/env node

/**
 * Download mcp_server.py from the official Kali Linux GitLab repository
 * This ensures we always package the latest version from upstream
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
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

// Ensure resources directory exists
if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

function writeFallbackFile(destPath, content) {
    fs.writeFileSync(destPath, content, 'utf8');
    console.log(`⚠ Using bundled fallback content at ${destPath}`);
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url}...`);
        
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
                return;
            }

            const file = fs.createWriteStream(destPath);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`✓ Downloaded to ${destPath}`);
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Downloading resources from Kali Linux GitLab repository...\n');

    const mcpServerPath = path.join(RESOURCES_DIR, 'mcp_server.py');
    const requirementsPath = path.join(RESOURCES_DIR, 'requirements.txt');

    try {
        await downloadFile(MCP_SERVER_URL, mcpServerPath);
    } catch (error) {
        console.warn(`Warning: unable to download ${MCP_SERVER_URL}: ${error.message}`);
        writeFallbackFile(mcpServerPath, FALLBACK_MCP_SERVER);
    }

    try {
        await downloadFile(REQUIREMENTS_URL, requirementsPath);
    } catch (error) {
        console.warn(`Warning: unable to download ${REQUIREMENTS_URL}: ${error.message}`);
        writeFallbackFile(requirementsPath, FALLBACK_REQUIREMENTS);
    }

    const content = fs.readFileSync(mcpServerPath, 'utf8');
    const attribution = `# Source: https://gitlab.com/kalilinux/packages/mcp-kali-server
# This file is downloaded during the build process from the official Kali Linux repository when available.
# Fallback content is bundled for offline packaging.

`;
    if (!content.startsWith('# Source:') && !content.startsWith('#!/usr/bin/env python3')) {
        fs.writeFileSync(mcpServerPath, attribution + content);
    }

    console.log('\n✓ Resource preparation completed');
}

main();
