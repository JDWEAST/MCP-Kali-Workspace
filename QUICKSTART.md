# MCP Kali VS Code Extension - Quick Start

## What You Need to Do

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Compile the extension:**

   ```bash
   npm run compile
   ```

3. **Test it:**
   - Press F5 in VS Code to launch Extension Development Host
   - In the new window, open a workspace
   - Run: `MCP Kali: Setup Workspace`

4. **Package for installation:**

   ```bash
   npm run package
   ```

5. **Install the extension:**

   ```bash
   code --install-extension mcp-kali-workspace-0.1.0.vsix
   ```

## Next Steps

After installation, in any workspace:

1. Run command: `MCP Kali: Setup Workspace`
2. Follow prompts for Kali IP, SSH user, SSH key
3. Reload VS Code
4. Use MCP tools in Copilot Chat!
