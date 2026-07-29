# Authorized passive OSINT MCP bridge

`osint_mcp_server.py` is a local stdio MCP server. It intentionally exposes one
bounded capability:

- `maigret_authorized_username_lookup` checks one username against 1–25 public
  sites. The caller must set `authorized_target: true`, attesting that it owns
  the account or has explicit authorization.

The bridge starts the local Maigret source repository at
`C:\Users\yeahi\Downloads\maigret-main` with a fixed argument vector. It does
not accept a command, executable path, URL, proxy, report path, or arbitrary
Maigret flags. It disables recursion, profile extraction, automatic database
updates, reports, and shell execution. It gives Maigret a temporary database
copy which is removed after each call, so the local tool checkout is not
modified. A lookup is capped at 75 seconds.

The wrapper uses the Windows Python launcher (`py -3`) when available, then
falls back to `python`. Install Maigret's documented dependencies into that
Python environment before using the server; the bridge never installs or
downloads dependencies itself.

## Local-repository review and exclusions

No reviewed tool ships an MCP server. The duplicate Maigret checkout under
`C:\Users\yeahi\onsit\maigret` contains an unrelated VS Code MCP configuration,
not a Maigret MCP integration.

- **Maigret:** included only through the bounded, authorized username lookup
  above.
- **GHunt:** not exposed. Its supported modules include interactive cookie-based
  login plus email, Gaia, Drive, BSSID geolocation, and recursive asset
  discovery. The bridge does not handle credentials or expose those collection
  capabilities.
- **Prying Deep** (`C:\Users\yeahi\deep  pry\pryingdeep`): not exposed. It is a
  dark/clearnet crawler with Tor support and collection features, not a bounded
  passive lookup.
- **WireTapper:** deliberately not exposed or configured. Its wireless-device
  mapping and leaked Wi-Fi-credential lookup capabilities constitute
  surveillance and credential collection, which are out of scope.
