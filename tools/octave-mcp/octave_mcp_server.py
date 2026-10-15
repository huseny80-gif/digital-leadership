#!/usr/bin/env python3
"""
Octave MCP Server
Connects Claude Code to GNU Octave via Model Context Protocol (stdio).
"""

import subprocess
import sys
import os
import json
import tempfile
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("octave")


def run_octave(code: str, timeout: int = 60) -> str:
    """Execute Octave code and return combined stdout/stderr."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".m", delete=False, encoding="utf-8") as f:
        f.write(code)
        script_path = f.name

    try:
        result = subprocess.run(
            ["octave-cli", "--norc", "--no-gui", script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
        )
        output = result.stdout
        if result.stderr:
            output += "\n--- stderr ---\n" + result.stderr
        return output.strip() if output.strip() else "(no output)"
    except FileNotFoundError:
        return "ERROR: octave-cli not found. Make sure Octave is installed and added to PATH."
    except subprocess.TimeoutExpired:
        return f"ERROR: Octave timed out after {timeout} seconds."
    finally:
        os.unlink(script_path)


@mcp.tool()
def evaluate_octave_code(code: str) -> str:
    """
    Evaluate Octave code and return the output.
    Equivalent to MATLAB's evaluate_matlab_code.
    """
    return run_octave(code)


@mcp.tool()
def run_octave_file(script_path: str) -> str:
    """
    Execute an Octave .m script file and return the output.
    script_path: absolute path to the .m file.
    """
    if not os.path.isfile(script_path):
        return f"ERROR: File not found: {script_path}"
    if not script_path.endswith(".m"):
        return "ERROR: File must have a .m extension."

    try:
        result = subprocess.run(
            ["octave-cli", "--norc", "--no-gui", script_path],
            capture_output=True,
            text=True,
            timeout=60,
            encoding="utf-8",
        )
        output = result.stdout
        if result.stderr:
            output += "\n--- stderr ---\n" + result.stderr
        return output.strip() if output.strip() else "(no output)"
    except FileNotFoundError:
        return "ERROR: octave-cli not found."
    except subprocess.TimeoutExpired:
        return "ERROR: Script timed out after 60 seconds."


@mcp.tool()
def detect_octave_version() -> str:
    """Return the installed Octave version and basic environment info."""
    return run_octave("disp(version()); ver;")


@mcp.tool()
def check_octave_available() -> str:
    """Check if octave-cli is accessible and return its version string."""
    try:
        result = subprocess.run(
            ["octave-cli", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip() or result.stderr.strip()
    except FileNotFoundError:
        return "NOT FOUND: octave-cli is not on PATH."
    except Exception as e:
        return f"ERROR: {e}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
