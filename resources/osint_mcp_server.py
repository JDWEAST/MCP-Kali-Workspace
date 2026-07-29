#!/usr/bin/env python3
"""A deliberately narrow stdio MCP bridge for authorized Maigret lookups.

The bridge exposes no command runner.  It constructs one fixed Maigret command
from strictly validated tool arguments and never invokes a shell.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


PROTOCOL_VERSION = "2024-11-05"
MAX_OUTPUT_CHARS = 120_000
MAIGRET_TIMEOUT_SECONDS = 75
MAIGRET_ROOT = Path(r"C:\Users\yeahi\Downloads\maigret-main")
MAIGRET_ENTRYPOINT = MAIGRET_ROOT / "maigret" / "__main__.py"
MAIGRET_DATABASE = MAIGRET_ROOT / "maigret" / "resources" / "data.json"

TOOL = {
    "name": "maigret_authorized_username_lookup",
    "description": (
        "Search a single username across at most 25 public profile sites with "
        "Maigret. Use only for an account you own or a target for which you "
        "have explicit authorization. Set authorized_target to true to attest "
        "that authorization; the lookup is rejected otherwise. Recursive "
        "search, profile extraction, proxies, Tor, report files, and database "
        "updates are not available through this bridge."
    ),
    "inputSchema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["username", "authorized_target"],
        "properties": {
            "username": {
                "type": "string",
                "description": "One account username (1-64 characters).",
                "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
            },
            "authorized_target": {
                "type": "boolean",
                "const": True,
                "description": (
                    "Must be true. This attests that you own the account or "
                    "have explicit authorization to perform this lookup."
                ),
            },
            "max_sites": {
                "type": "integer",
                "minimum": 1,
                "maximum": 25,
                "default": 10,
                "description": "Maximum number of public sites to check (1-25).",
            },
        },
    },
}


def respond(message: dict[str, Any]) -> None:
    """Write exactly one JSON-RPC message to stdout."""
    print(json.dumps(message, ensure_ascii=False), flush=True)


def error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def tool_error(message: str) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": message}],
        "isError": True,
    }


def truncate_output(text: str) -> str:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    omitted = len(text) - MAX_OUTPUT_CHARS
    return f"{text[:MAX_OUTPUT_CHARS]}\n\n[Output truncated: {omitted} characters omitted.]"


def validate_lookup_arguments(arguments: Any) -> tuple[str, int] | str:
    if not isinstance(arguments, dict):
        return "arguments must be an object."

    allowed_keys = {"username", "authorized_target", "max_sites"}
    unknown_keys = set(arguments) - allowed_keys
    if unknown_keys:
        return f"unsupported argument(s): {', '.join(sorted(unknown_keys))}."

    if arguments.get("authorized_target") is not True:
        return (
            "Lookup rejected: authorized_target must be true. Only search an "
            "account you own or a target for which you have explicit authorization."
        )

    username = arguments.get("username")
    if not isinstance(username, str):
        return "username must be a string."
    if not (1 <= len(username) <= 64):
        return "username must contain 1 to 64 characters."
    if not username[0].isalnum() or any(
        not (character.isalnum() or character in "._-") for character in username
    ):
        return "username may contain only letters, digits, periods, underscores, and hyphens."

    max_sites = arguments.get("max_sites", 10)
    if isinstance(max_sites, bool) or not isinstance(max_sites, int):
        return "max_sites must be an integer from 1 through 25."
    if not 1 <= max_sites <= 25:
        return "max_sites must be an integer from 1 through 25."

    return username, max_sites


def run_maigret(username: str, max_sites: int) -> dict[str, Any]:
    if not MAIGRET_ENTRYPOINT.is_file() or not MAIGRET_DATABASE.is_file():
        return tool_error(
            "Maigret was not found at the configured local repository: "
            f"{MAIGRET_ROOT}. This bridge does not download or install tools."
        )

    # This is an argument vector, not a command string: targets can never alter
    # the executable or introduce shell syntax. The allowed flags intentionally
    # disable data expansion and persistent/report side effects.
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    try:
        # Maigret saves its in-memory database at process exit. Give it an
        # isolated copy so a lookup cannot alter the supplied repository or
        # leave lookup data behind.
        with tempfile.TemporaryDirectory(prefix="authorized-passive-osint-") as temp_dir:
            temporary_database = Path(temp_dir) / "data.json"
            shutil.copyfile(MAIGRET_DATABASE, temporary_database)
            command = [
                sys.executable,
                "-m",
                "maigret",
                username,
                "--top-sites",
                str(max_sites),
                "--timeout",
                "5",
                "--retries",
                "0",
                "--max-connections",
                "5",
                "--db",
                str(temporary_database),
                "--no-recursion",
                "--no-extracting",
                "--no-autoupdate",
                "--no-color",
                "--no-progressbar",
                "--print-errors",
            ]
            completed = subprocess.run(
                command,
                cwd=MAIGRET_ROOT,
                shell=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=MAIGRET_TIMEOUT_SECONDS,
                creationflags=creation_flags,
                check=False,
            )
    except subprocess.TimeoutExpired:
        return tool_error(
            f"Maigret timed out after {MAIGRET_TIMEOUT_SECONDS} seconds; no further requests were made by this bridge."
        )
    except OSError as exc:
        return tool_error(f"Unable to start the local Maigret process: {exc}")

    output = completed.stdout
    if completed.stderr:
        output = f"{output}\n\n[stderr]\n{completed.stderr}"
    output = truncate_output(output.strip() or "Maigret returned no output.")
    if completed.returncode != 0:
        output = f"Maigret exited with status {completed.returncode}.\n\n{output}"

    return {
        "content": [{"type": "text", "text": output}],
        "isError": completed.returncode != 0,
    }


def call_tool(params: Any) -> dict[str, Any]:
    if not isinstance(params, dict) or params.get("name") != TOOL["name"]:
        return tool_error("Unknown tool. Only the authorized Maigret username lookup is available.")

    validated = validate_lookup_arguments(params.get("arguments"))
    if isinstance(validated, str):
        return tool_error(validated)
    username, max_sites = validated
    return run_maigret(username, max_sites)


def handle_request(request: Any) -> dict[str, Any] | None:
    if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
        return error_response(request.get("id") if isinstance(request, dict) else None, -32600, "Invalid JSON-RPC request.")

    method = request.get("method")
    request_id = request.get("id")
    is_notification = "id" not in request

    if method == "notifications/initialized":
        return None
    if method == "initialize":
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "authorized-passive-osint", "version": "1.0.0"},
            "instructions": (
                "This local bridge only supports authorized, bounded Maigret "
                "username checks. It does not provide a shell, credential "
                "capture, surveillance, interception, or crawling capability."
            ),
        }
    elif method == "tools/list":
        result = {"tools": [TOOL]}
    elif method == "tools/call":
        result = call_tool(request.get("params"))
    elif method == "ping":
        result = {}
    else:
        if is_notification:
            return None
        return error_response(request_id, -32601, f"Method not found: {method}")

    if is_notification:
        return None
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def main() -> int:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            respond(error_response(None, -32700, "Parse error."))
            continue

        response = handle_request(request)
        if response is not None:
            respond(response)
    return 0


if __name__ == "__main__":
    sys.exit(main())
