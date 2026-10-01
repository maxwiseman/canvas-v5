"""Package a verified, authenticated dev MCP endpoint without bundling credentials."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zipfile import ZipFile, ZIP_DEFLATED


def package(endpoint, output):
    url = urlparse(endpoint)
    if url.scheme != "https" or url.username or url.password or url.query or url.fragment or url.path != "/api/mcp":
        raise ValueError("Provide a credential-free HTTPS /api/mcp endpoint.")
    if url.hostname == "canvas.maxw.app":
        raise ValueError("The dev package must not point at production.")
    origin = f"https://{url.netloc}"
    # Verify reachability, OAuth resource binding, and the authentication boundary.
    with urlopen(f"{origin}/.well-known/oauth-protected-resource/api/mcp", timeout=20) as response:
        metadata = json.load(response)
    if metadata.get("resource") != endpoint:
        raise ValueError("OAuth resource does not match the dev endpoint.")
    try:
        urlopen(Request(endpoint, headers={"Accept": "application/json, text/event-stream"}), timeout=20)
    except HTTPError as error:
        if error.code != 401 or "resource_metadata" not in error.headers.get("WWW-Authenticate", ""):
            raise ValueError("Endpoint did not return the expected MCP authentication challenge.") from error
    else:
        raise ValueError("Dev MCP endpoint unexpectedly accepts unauthenticated requests.")
    manifest = {
        "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        "name": "canvas-v5-dev", "version": "0.1.0",
        "description": "Development preview of the Canvas V5 workspace inside ChatGPT.",
        "author": {"name": "Max Wiseman"},
        "extensions": {"com.openai": {"interface": {
            "displayName": "Canvas V5 Dev", "shortDescription": "Canvas workspace preview",
            "longDescription": "Browse your connected Canvas courses, assignments, modules, grades, and submission status in the development version of Canvas V5. Sign in with your Canvas V5 account. Read and refresh access only.",
            "developerName": "Max Wiseman", "category": "Productivity",
            "capabilities": ["Interactive"], "defaultPrompt": "Open my Canvas workspace."
        }}}
    }
    mcp = {"$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "mcpServers": {
        "canvas-v5-dev": {"type": "streamable-http", "url": endpoint}
    }}
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, value in [("plugin.json", manifest), ("mcp.json", mcp)]:
            archive.writestr(f"canvas-v5-dev/{name}", json.dumps(value, indent=2) + "\n")
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == 2
    print(output.resolve())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", default="dist/canvas-v5-dev.zip")
    args = parser.parse_args()
    package(args.url, args.output)
