# Tool Execution System

Obsidian Next includes a robust tool execution system (`src/core/tools.ts`) that allows the AI to interact with your workspace safely.

## Available Tools

### bash
Execute shell commands in the workspace.
- **Parameters**: `command` (string)
- **Safety**: Audited by `Auditor`. Dangerous patterns blocked.
- **Limits**:
  - Timeout: 30 seconds
  - Output Buffer: 1MB (Truncated excess)

### read
Read file contents.
- **Parameters**: `path` (string)
- **Features**: Automatic line numbering.
- **Limits**: Max 500 lines per read (prevents context window explosion).

### write
Create new files.
- **Parameters**: `path` (string), `content` (string)
- **Safety**: Will not overwrite without `overwrite` flag (or use `edit`).
- **Undo**: All writes are recorded in `UndoManager` and can be reverted.

### edit
Modify existing files using search & replace.
- **Parameters**: `path` (string), `search` (string), `replace` (string)
- **Validation**: Verifies `search` string uniqueness before applying.

### list
List directory contents.
- **Parameters**: `path` (string, optional)
- **Filtering**: Ignores `node_modules`, `.git`, etc.

### grep
Search for patterns in files.
- **Parameters**: `pattern` (string - regex), `path` (string)
- **Limits**: Max 50 matches.

### glob
Find files by pattern.
- **Parameters**: `pattern` (string - glob), `path` (string)
- **Limits**: Max 100 results.

### web_fetch
Fetch content from URLs.
- **Parameters**: `url` (string)
- **Safety**: Blocks local/private IP ranges. 10s timeout. strip HTML tags.

## Usage

### Manual Tool Execution
Use the `/tool` command:

```bash
# Execute a specific tool
/tool read {"path": "package.json"}
```

## Architecture
Tools are registered in `ToolRegistry` and wrapped with:
1. **Auditor**: Static analysis of intent.
2. **Sandbox**: Runtime isolation (if enabled).
3. **Context**: Usage tracking (files read/modified).
