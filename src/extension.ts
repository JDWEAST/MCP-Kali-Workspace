import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as https from 'https';

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const ALLOWED_DOWNLOAD_HOSTS = ['gitlab.com', 'www.gitlab.com'];

function getCacheDir(): string {
    const homeDir = require('os').homedir();
    return path.join(homeDir, '.cache', 'mcp-kali-workspace');
}

export function activate(context: vscode.ExtensionContext) {
    console.log('MCP Kali Workspace extension activated');

    // Initialize cache on activation
    initializeCache(context).catch(error => {
        console.error('Failed to initialize cache during activation:', error);
        vscode.window.showWarningMessage(
            `MCP Kali: Cache initialization failed. You may need to install Python. Error: ${error.message}`
        );
    });

    let setupCommand = vscode.commands.registerCommand('mcp-kali.setup', async () => {
        await setupWorkspace(context);
    });

    let removeCommand = vscode.commands.registerCommand('mcp-kali.remove', async () => {
        await removeWorkspace();
    });

    let clearCacheCommand = vscode.commands.registerCommand('mcp-kali.clearCache', async () => {
        await clearCacheDirectory();
    });

    context.subscriptions.push(setupCommand, removeCommand, clearCacheCommand);
}

async function downloadResources(context: vscode.ExtensionContext): Promise<void> {
    const resourcesDir = path.join(context.extensionPath, 'resources');
    
    // Ensure resources directory exists
    if (!fs.existsSync(resourcesDir)) {
        fs.mkdirSync(resourcesDir, { recursive: true });
    }

    const MCP_SERVER_URL = 'https://gitlab.com/kalilinux/packages/mcp-kali-server/-/raw/kali/master/mcp_server.py';
    const REQUIREMENTS_URL = 'https://gitlab.com/kalilinux/packages/mcp-kali-server/-/raw/kali/master/requirements.txt';

    try {
        await Promise.all([
            downloadFile(MCP_SERVER_URL, path.join(resourcesDir, 'mcp_server.py')),
            downloadFile(REQUIREMENTS_URL, path.join(resourcesDir, 'requirements.txt'))
        ]);
        console.log('MCP Kali resources updated successfully');
    } catch (error) {
        console.error('Failed to download resources:', error);
        // Continue even if download fails - use bundled resources if available
    }
}

function isAllowedHost(hostname: string): boolean {
    return ALLOWED_DOWNLOAD_HOSTS.includes(hostname.toLowerCase());
}

function downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
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

function isValidIpv4Address(value: string): boolean {
    const parts = value.split('.');
    if (parts.length !== 4) {
        return false;
    }

    return parts.every((part) => {
        if (!/^\d+$/.test(part)) {
            return false;
        }

        const octet = Number(part);
        return octet >= 0 && octet <= 255;
    });
}

async function initializeCache(context: vscode.ExtensionContext): Promise<void> {
    const isWindows = process.platform === 'win32';
    const pythonCmd = isWindows ? 'python' : 'python3';
    const cacheDir = getCacheDir();
    const venvDir = path.join(cacheDir, 'venv');
    const venvBinDir = isWindows ? path.join(venvDir, 'Scripts') : path.join(venvDir, 'bin');

    console.log('Starting cache initialization...');
    console.log('Cache directory:', cacheDir);
    
    // Download initial resources
    console.log('Downloading resources...');
    await downloadResources(context);
    console.log('Resources downloaded successfully');

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
        console.log('Creating cache directory...');
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Create venv if it doesn't exist
    if (!fs.existsSync(venvDir)) {
        console.log('Creating Python virtual environment in cache...');
        execSync(`${pythonCmd} -m venv "${venvDir}"`, { stdio: 'inherit' });
        console.log('Virtual environment created');
    } else {
        console.log('Virtual environment already exists');
    }

    // Install requirements
    const resourcesDir = path.join(context.extensionPath, 'resources');
    const requirementsTxt = path.join(resourcesDir, 'requirements.txt');
    
    if (fs.existsSync(requirementsTxt)) {
        const pipCmd = isWindows ? path.join(venvBinDir, 'pip') : path.join(venvBinDir, 'pip');
        console.log('Installing MCP Kali dependencies...');
        execSync(`"${pipCmd}" install -q -r "${requirementsTxt}"`, { stdio: 'inherit' });
        console.log('Dependencies installed');
    }

    console.log('Cache initialization completed successfully');
}

async function clearCacheDirectory(): Promise<void> {
    const cacheDir = getCacheDir();

    if (!fs.existsSync(cacheDir)) {
        vscode.window.showInformationMessage('No MCP Kali cache directory found.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Remove the shared MCP Kali cache directory? The Python environment will be recreated on next setup.',
        'Remove Cache',
        'Cancel'
    );

    if (confirm !== 'Remove Cache') {
        return;
    }

    try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        vscode.window.showInformationMessage('MCP Kali cache removed successfully.');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove MCP Kali cache: ${error}`);
    }
}

async function setupWorkspace(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    // Prompt for configuration
    const kaliIp = await vscode.window.showInputBox({
        prompt: 'Enter Kali VM IP address',
        placeHolder: '192.168.110.23',
        validateInput: (value) => {
            if (!value || !isValidIpv4Address(value)) {
                return 'Please enter a valid IP address';
            }
            return null;
        }
    });

    if (!kaliIp) return;

    // Show progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Setting up MCP Kali Workspace',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: 'Creating workspace directories...' });
            
            // Create .mcp-kali directory in workspace (for scripts only)
            const mcpDir = path.join(workspaceFolder.uri.fsPath, '.mcp-kali');
            if (!fs.existsSync(mcpDir)) {
                fs.mkdirSync(mcpDir, { recursive: true });
            }

            progress.report({ message: 'Downloading latest MCP server files...' });
            
            // Download latest resources from upstream
            try {
                await downloadResources(context);
            } catch (error) {
                console.warn('Failed to download latest resources, using bundled version:', error);
                vscode.window.showWarningMessage(
                    'Could not download latest MCP server files (offline or network issue). Using bundled version.',
                    'OK'
                );
            }

            progress.report({ message: 'Copying MCP server files...' });
            
            // Copy resources
            const resourcesDir = path.join(context.extensionPath, 'resources');
            const mcpServerPy = path.join(resourcesDir, 'mcp_server.py');
            const requirementsTxt = path.join(resourcesDir, 'requirements.txt');
            
            if (!fs.existsSync(mcpServerPy) || !fs.existsSync(requirementsTxt)) {
                throw new Error('MCP server files not found. Please reinstall the extension.');
            }
            
            fs.copyFileSync(mcpServerPy, path.join(mcpDir, 'mcp_server.py'));
            fs.copyFileSync(requirementsTxt, path.join(mcpDir, 'requirements.txt'));

            progress.report({ message: 'Creating wrapper script...' });
            
            // Get paths to cached venv
            const isWindows = process.platform === 'win32';
            const homeDir = require('os').homedir();
            const cacheDir = path.join(homeDir, '.cache', 'mcp-kali-workspace');
            const venvDir = path.join(cacheDir, 'venv');
            const venvBinDir = isWindows ? path.join(venvDir, 'Scripts') : path.join(venvDir, 'bin');
            
            // Create wrapper script (OS-specific)
            let wrapperPath: string;
            const mcpServerPath = path.join(mcpDir, 'mcp_server.py');
            
            if (isWindows) {
                // Windows batch script
                const wrapperScript = `@echo off
"${path.join(venvBinDir, 'python')}" "${mcpServerPath}" %*
`;
                wrapperPath = path.join(mcpDir, 'mcp-wrapper.cmd');
                fs.writeFileSync(wrapperPath, wrapperScript);
            } else {
                // Unix shell script
                const wrapperScript = `#!/usr/bin/env bash
exec "${path.join(venvBinDir, 'python3')}" "${mcpServerPath}" "$@"
`;
                wrapperPath = path.join(mcpDir, 'mcp-wrapper.sh');
                fs.writeFileSync(wrapperPath, wrapperScript);
                fs.chmodSync(wrapperPath, 0o755);
            }

            progress.report({ message: 'Configuring VS Code...' });
            
            // Create/update .vscode/mcp.json
            const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
            }

            const mcpJsonPath = path.join(vscodeDir, 'mcp.json');
            let mcpConfig: any = {};

            if (fs.existsSync(mcpJsonPath)) {
                const existingConfigRaw = fs.readFileSync(mcpJsonPath, 'utf8');
                try {
                    mcpConfig = JSON.parse(existingConfigRaw);
                } catch {
                    throw new Error('Existing .vscode/mcp.json contains invalid JSON. Fix the file and run setup again.');
                }

                if (typeof mcpConfig !== 'object' || mcpConfig === null || Array.isArray(mcpConfig)) {
                    throw new Error('Existing .vscode/mcp.json must be a JSON object.');
                }
            }

            if (!mcpConfig.servers) {
                mcpConfig.servers = {};
            }

            if (typeof mcpConfig.servers !== 'object' || mcpConfig.servers === null || Array.isArray(mcpConfig.servers)) {
                throw new Error('The "servers" field in .vscode/mcp.json must be a JSON object.');
            }

            mcpConfig.servers.kaliMcp = {
                type: 'stdio',
                command: wrapperPath,
                args: [
                    '--server',
                    `http://${kaliIp}:5000`
                ]
            };

            fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));

            // Update settings.json (only if settings are available)
            const config = vscode.workspace.getConfiguration();
            try {
                await config.update('chat.mcp.discovery.enabled', true, vscode.ConfigurationTarget.Workspace);
            } catch (e) {
                console.log('chat.mcp.discovery.enabled not available');
            }
            try {
                await config.update('chat.agent.enabled', true, vscode.ConfigurationTarget.Workspace);
            } catch (e) {
                console.log('chat.agent.enabled not available');
            }
            try {
                await config.update('chat.mcp.access', 'all', vscode.ConfigurationTarget.Workspace);
            } catch (e) {
                console.log('chat.mcp.access not available');
            }

            vscode.window.showInformationMessage(
                'MCP Kali Workspace setup complete! Make sure kali-server-mcp is running on your Kali VM.',
                'Reload Window'
            ).then(selection => {
                if (selection === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Setup failed: ${error}`);
        }
    });
}

async function removeWorkspace() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    const mcpDir = path.join(workspaceFolder.uri.fsPath, '.mcp-kali');
    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    // Check if MCP setup exists
    if (!fs.existsSync(mcpDir)) {
        vscode.window.showInformationMessage('No MCP Kali configuration found in this workspace');
        return;
    }

    // Confirm removal
    const confirm = await vscode.window.showWarningMessage(
        'Remove MCP Kali configuration from this workspace? This will delete .mcp-kali/ and remove the MCP server entry from .vscode/mcp.json',
        'Remove',
        'Cancel'
    );

    if (confirm !== 'Remove') {
        return;
    }

    try {
        // Remove .mcp-kali directory
        if (fs.existsSync(mcpDir)) {
            fs.rmSync(mcpDir, { recursive: true, force: true });
        }

        // Remove kaliMcp entry from mcp.json
        if (fs.existsSync(mcpConfigPath)) {
            const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
            if (mcpConfig.servers && mcpConfig.servers.kaliMcp) {
                delete mcpConfig.servers.kaliMcp;
                
                // If no servers left, remove the file
                if (Object.keys(mcpConfig.servers).length === 0) {
                    fs.unlinkSync(mcpConfigPath);
                } else {
                    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
                }
            }
        }

        vscode.window.showInformationMessage(
            'MCP Kali configuration removed. Reload window to apply changes.',
            'Reload Window'
        ).then(selection => {
            if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove configuration: ${error}`);
    }
}

export function deactivate() {
    // Keep shared cache intact on deactivate to avoid unexpected re-initialization.
}
