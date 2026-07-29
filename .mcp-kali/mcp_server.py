#!/usr/bin/env python3
# Fallback MCP server stub for offline packaging.
# The extension will attempt to download the upstream file at runtime when network access is available.

import sys

if __name__ == '__main__':
    print('MCP Kali fallback server stub. Configure the real Kali MCP server for full functionality.', file=sys.stderr)
    sys.exit(0)
