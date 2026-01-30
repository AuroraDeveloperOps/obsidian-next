# Tool Execution System

Obsidian Next now includes a Claude Code-like tool execution system that allows the AI to interact with your workspace.

## Available Tools

### bash
Execute shell commands in the workspace.

**Parameters:**
- `command` (string, required): The shell command to execute

**Safety:** All commands are validated by the Auditor before execution.

### read
Read file contents from the workspace.

**Parameters:**
- `path` (string, required): Path to the file (relative to workspace)

**Features:**
- Automatic line numbering for readability
- Path validation to prevent escaping workspace

### write
Create new files in the workspace.

**Parameters:**
- `path` (string, required): Where to create the file
- `content` (string, required): Content to write

**Safety:**
- Will not overwrite existing files
- Creates parent directories automatically

### edit
Modify existing files using search and replace.

**Parameters:**
- `path` (string, required): Path to the file to edit
- `search` (string, required): Text to search for (must match exactly)
- `replace` (string, required): Text to replace with

### list
List files and directories.

**Parameters:**
- `path` (string, optional): Directory to list (defaults to current)

### grep
Search for patterns in files using regex.

**Parameters:**
- `pattern` (string, required): Regex pattern to search for
- `path` (string, optional): Directory to search (defaults to current)
- `limit` (number, optional): Maximum results (default: 50)

### glob
Find files matching a glob pattern.

**Parameters:**
- `pattern` (string, required): Glob pattern (e.g., **/*.ts)
- `path` (string, optional): Base directory (defaults to current)

### web_fetch
Fetch content from URLs (documentation, APIs, etc.).

**Parameters:**
- `url` (string, required): URL to fetch

**Safety:**
- Cannot fetch from localhost/private addresses
- 10 second timeout
- Large responses are truncated

## Usage

### From the AI
When you chat with Claude, it can automatically use these tools to help you.

### Manual Tool Execution
Use the `/tool` command:

```bash
# List available tools
/tool

# Execute a specific tool
/tool read {"path": "package.json"}
/tool bash {"command": "npm test"}
```

## Architecture

Tools integrate with the Auditor for safety checks and emit structured events for UI rendering.
