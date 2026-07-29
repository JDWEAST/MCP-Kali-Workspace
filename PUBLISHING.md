# Publishing MCP Kali Workspace to VS Code Marketplace

## Prerequisites

1. **Create a Publisher Account**
   - Go to <https://marketplace.visualstudio.com/manage>
   - Sign in with Microsoft account
   - Create a publisher ID (replace `your-publisher-name` in package.json)

2. **Get a Personal Access Token (PAT)**
   - Go to <https://dev.azure.com>
   - User Settings → Personal Access Tokens
   - Create new token with `Marketplace (Manage)` scope
   - Save the token securely

## Steps to Publish

### 1. Update Publisher ID

Edit `package.json`:

```json
"publisher": "your-actual-publisher-id"
```

### 2. Add an Icon (Optional but Recommended)

Create or download a 128x128 PNG icon and save as `icon.png` in the extension root.

### 3. Update Repository URL

Edit `package.json`:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/yourusername/mcp-kali-workspace"
}
```

### 4. Login to Publisher

```bash
npx vsce login your-publisher-id
```

Enter your PAT when prompted.

### 5. Package and Publish

```bash
# Package
npm run package

# Publish
npx vsce publish
```

Or do both in one step:

```bash
npx vsce publish
```

### 6. Version Updates

For subsequent updates:

```bash
# Patch version (0.5.3 → 0.5.4)
npx vsce publish patch

# Minor version (0.5.3 → 0.6.0)
npx vsce publish minor

# Major version (0.5.3 → 1.0.0)
npx vsce publish major
```

## Pre-Publish Checklist

- [ ] Update publisher ID in package.json
- [ ] Add icon.png (128x128)
- [ ] Update repository URL
- [ ] Test extension thoroughly
- [ ] Update release notes (CHANGELOG.md optional)
- [ ] Verify README has screenshots/demos
- [ ] Check all links work
- [ ] Test on clean VS Code install

## Post-Publish

1. Extension will be reviewed (usually takes a few hours)
2. Once approved, it appears in marketplace
3. Users can install via: `ext install your-publisher-id.mcp-kali-workspace`

## Local Installation (Before Publishing)

Test the packaged extension:

```bash
npm run package
code --install-extension mcp-kali-workspace-0.5.3.vsix
```

## Updating Extension

1. Make changes
2. Update version in package.json
3. Update release notes documentation (if used)
4. Run: `npx vsce publish`

That's it! Your extension will be live on the VS Code Marketplace! 🎉
