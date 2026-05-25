#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_MCP_SERVER = ROOT / "packages" / "mcp" / "dist" / "index.js"
OPENAI_URL = "https://api.openai.com/v1/responses"
MCP_PROTOCOL_VERSION = "2025-11-25"
ENV_FILES = [ROOT / ".env", ROOT / ".env.local"]
READ_ONLY_TOOLS = {
    "get_me",
    "list_orgs",
    "list_org_members",
    "list_projects",
    "list_project_members",
    "get_project_binding",
    "require_project_binding",
    "infer_context_metadata",
    "list_relevant_context",
    "get_context",
}


def load_env_files():
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


class McpClient:
    def __init__(self, server_path: Path):
        self.server_path = server_path
        self.next_id = 1
        env = os.environ.copy()
        env.setdefault("NEPTUNE_API_URL", "http://127.0.0.1:8787")
        self.proc = subprocess.Popen(
            [find_node_bin(), str(server_path)],
            cwd=str(ROOT),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def send(self, payload):
        if not self.proc.stdin:
            raise RuntimeError("MCP stdin is closed.")
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()

    def read(self):
        if not self.proc.stdout:
            raise RuntimeError("MCP stdout is closed.")
        line = self.proc.stdout.readline()
        if not line:
            stderr = self.proc.stderr.read() if self.proc.stderr else ""
            raise RuntimeError(f"MCP server exited early. {stderr}".strip())
        return json.loads(line)

    def request(self, method, params=None):
        request_id = self.next_id
        self.next_id += 1
        self.send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params or {},
            }
        )
        while True:
            message = self.read()
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise RuntimeError(json.dumps(message["error"], indent=2))
            return message["result"]

    def notify(self, method, params=None):
        self.send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def initialize(self):
        self.request(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "neptune-openai-sample", "version": "0.1.0"},
            },
        )
        self.notify("notifications/initialized")

    def list_tools(self):
        return self.request("tools/list").get("tools", [])

    def call_tool(self, name, arguments):
        return self.request("tools/call", {"name": name, "arguments": arguments or {}})


def openai_request(api_key, payload):
    request = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        raise RuntimeError(f"OpenAI API error {error.code}: {body}") from error


def find_node_bin():
    candidates = [
        os.environ.get("NODE_BIN"),
        "/opt/homebrew/bin/node",
        shutil.which("node"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError("Node.js not found. Set NODE_BIN to a Node.js >=20 binary.")


def tool_schema_from_mcp(tool):
    schema = tool.get("inputSchema") or {"type": "object", "properties": {}}
    if schema.get("type") != "object":
        schema = {"type": "object", "properties": {}}
    return {
        "type": "function",
        "name": tool["name"],
        "description": tool.get("description", f"Call Neptune MCP tool {tool['name']}"),
        "parameters": schema,
        "strict": False,
    }


def extract_text(response):
    if response.get("output_text"):
        return response["output_text"]
    parts = []
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "\n".join(part for part in parts if part).strip()


def function_calls(response):
    return [item for item in response.get("output", []) if item.get("type") == "function_call"]


def should_run_tool(name, auto_approve):
    if auto_approve or name in READ_ONLY_TOOLS:
        return True
    answer = input(f"Run mutating MCP tool `{name}`? [y/N] ").strip().lower()
    return answer in {"y", "yes"}


def run_turn(api_key, model, mcp, tools, user_text, previous_response_id, auto_approve):
    payload = {
        "model": model,
        "instructions": (
            "You are a Neptune MCP test assistant. Use the available Neptune tools when needed. "
            "Keep answers concise and report which MCP tools you used."
        ),
        "input": user_text,
        "tools": tools,
        "parallel_tool_calls": False,
        "max_tool_calls": 6,
    }
    if previous_response_id:
        payload["previous_response_id"] = previous_response_id

    response = openai_request(api_key, payload)

    while function_calls(response):
        outputs = []
        for call in function_calls(response):
            name = call["name"]
            arguments = json.loads(call.get("arguments") or "{}")
            if not should_run_tool(name, auto_approve):
                result = {"ok": False, "error": "User declined tool execution."}
            else:
                print(f"\n[MCP] {name}({json.dumps(arguments)})")
                result = mcp.call_tool(name, arguments)
            outputs.append(
                {
                    "type": "function_call_output",
                    "call_id": call["call_id"],
                    "output": json.dumps(result),
                }
            )

        response = openai_request(
            api_key,
            {
                "model": model,
                "previous_response_id": response["id"],
                "input": outputs,
                "tools": tools,
                "parallel_tool_calls": False,
                "max_tool_calls": 6,
            },
        )

    return extract_text(response), response["id"]


def main():
    load_env_files()

    parser = argparse.ArgumentParser(description="Chat with OpenAI using the existing Neptune stdio MCP server.")
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5-nano"))
    parser.add_argument("--mcp-server", default=os.environ.get("NEPTUNE_MCP_SERVER", str(DEFAULT_MCP_SERVER)))
    parser.add_argument("--once", help="Run one prompt and exit.")
    parser.add_argument("--auto-approve", action="store_true", help="Run mutating MCP tools without confirmation.")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("Missing OPENAI_API_KEY in env.")

    server_path = Path(args.mcp_server).expanduser().resolve()
    if not server_path.exists():
        raise SystemExit(f"MCP server build not found: {server_path}\nRun: corepack pnpm --filter neptune-context-mcp build")

    mcp = McpClient(server_path)
    try:
        mcp.initialize()
        mcp_tools = mcp.list_tools()
        tools = [tool_schema_from_mcp(tool) for tool in mcp_tools]
        print(f"Connected to Neptune MCP: {len(tools)} tools. Model: {args.model}")

        previous_response_id = None
        if args.once:
            answer, _ = run_turn(api_key, args.model, mcp, tools, args.once, None, args.auto_approve)
            print(f"\n{answer}")
            return

        print("Type a prompt, or `exit` to quit.")
        while True:
            user_text = input("\nYou> ").strip()
            if user_text.lower() in {"exit", "quit"}:
                return
            if not user_text:
                continue
            answer, previous_response_id = run_turn(
                api_key,
                args.model,
                mcp,
                tools,
                user_text,
                previous_response_id,
                args.auto_approve,
            )
            print(f"\nAssistant> {answer}")
    finally:
        mcp.close()


if __name__ == "__main__":
    main()
