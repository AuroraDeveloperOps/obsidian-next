# Troubleshooting Guide

> Common issues and solutions for Obsidian Next

---

## Daemon & Service Issues

### "Cannot connect to Obsidian daemon"

**Cause:** The background service isn't running or the socket file is inaccessible.

**Solution:**
```bash
# Check if the process is running
ps aux | grep obsidian

# Verify the socket file
ls -la ~/.obsidian-next/daemon.sock

# Restart the service
# macOS:
launchctl load ~/Library/LaunchAgents/com.obsidian.daemon.plist
# Linux:
systemctl --user restart obsidian
```

### "Another instance is running"

**Cause:** A legacy project-local `.obsidian` instance is conflicting with the global daemon.

**Solution:**
```bash
# Clean up legacy folders
rm -rf .obsidian

# Stop all instances and restart the global daemon
pkill -f obsidian
obsidian status
```

---

## Global State Issues

### "Permissions reset on restart"

**Cause:** Global `settings.json` is being overwritten by a local config.

**Solution:** Obsidian Next v0.4.6 ignore local `.obsidian` folders by default. Ensure your permissions are added via `/settings` in an active session, which commits them to `~/.obsidian-next/settings.json`.

---

## Remote Gateway Issues

### "Telegram Bot not responding"

**Cause:** Bot token invalid or daemon has no internet access.

**Solution:**
1.  Run `/init-telegram --reset` to re-enter your token.
2.  Verify the daemon can reach `api.telegram.org`.
3.  Check `~/.obsidian-next/audit.log` for connection errors.

### "better-sqlite3 compilation failed"

**Cause:** Missing native build tools.

**Solution (macOS):**
```bash
xcode-select --install
npm rebuild better-sqlite3
```

**Solution (Ubuntu/Debian):**
```bash
sudo apt-get install build-essential python3
npm rebuild better-sqlite3
```

---

## API Key Issues

### "Invalid API key" or "Authentication failed"

**Causes:**
1. Incorrect key format
2. Key not stored properly
3. Whitespace in key

**Solution:**
```bash
# Re-run init to set key
obsidian
/init --reset

# Or manually set via environment
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "API key not found"

**Cause:** Key not in keychain or environment.

**Solution:**
```bash
# Check if key is set
obsidian
/status

# If not, run init
/init
```

### Key not persisting between sessions

**Cause:** Keychain access issue.

**Solution (macOS):**
```bash
# Check keychain access
security find-generic-password -s "obsidian-anthropic-key" -w

# If permission denied, unlock keychain
security unlock-keychain
```

**Solution (Linux):**
```bash
# Check secret-tool
secret-tool lookup service obsidian key anthropic-key

# If not found, install libsecret
sudo apt-get install libsecret-tools
```

---

## Database Issues

### "Database is locked"

**Cause:** Another Obsidian instance running, or unclean shutdown.

**Solution:**
```bash
# Find and kill other instances
pkill -f "obsidian"

# If still locked, remove lock file
rm -f .obsidian/state.db-wal .obsidian/state.db-shm

# Restart
obsidian
```

### "Migration failed"

**Cause:** Schema version mismatch or corrupted database.

**Solution:**
```bash
# Backup current database
cp .obsidian/state.db .obsidian/state.db.bak

# Reset database (loses history)
rm .obsidian/state.db

# Restart - will recreate fresh database
obsidian
```

### "Session restore failed"

**Cause:** Corrupted session data.

**Solution:**
```bash
# List available sessions
obsidian
/resume

# If all sessions corrupted, clear them
rm -rf .obsidian/sessions/

# Start fresh
obsidian
```

---

## MCP Server Issues

### "MCP server failed to start"

**Causes:**
1. Server binary not found
2. Missing dependencies
3. Port already in use

**Solution:**
```bash
# Check MCP config
cat .obsidian/mcp.json

# Verify server binary exists
which npx  # or the configured command

# Check for port conflicts
lsof -i :3000  # or configured port
```

### "MCP connection timeout"

**Cause:** Server taking too long to initialize.

**Solution:**
```bash
# Increase timeout in config
# Edit .obsidian/mcp.json
{
  "servers": {
    "your-server": {
      "timeout": 30000  // 30 seconds
    }
  }
}
```

### "MCP API key not found"

**Cause:** Secure key not in keychain.

**Solution:**
```bash
# Set key via MCP view
obsidian
/mcp
# Select server -> Setup -> Enter key

# Or manually add to keychain (macOS)
security add-generic-password -s "obsidian-mcp:server-name" -a "obsidian" -w "your-api-key"
```

---

## Sandbox Issues

### "Sandbox execution failed"

**Cause (macOS):** `sandbox-exec` not available or profile error.

**Solution:**
```bash
# Check sandbox-exec
which sandbox-exec

# Disable sandbox temporarily
obsidian
/sandbox off
```

**Cause (Linux):** `firejail` not installed.

**Solution:**
```bash
sudo apt-get install firejail
```

### "Permission denied in sandbox"

**Cause:** Sandbox blocking required file access.

**Solution:**
```bash
# Run command without sandbox (requires approval)
# When prompted, select (s) "Allow + Skip Sandbox"

# Or disable sandbox globally
/sandbox off
```

---

## UI/Display Issues

### "Terminal rendering corrupted"

**Cause:** Terminal doesn't support required features.

**Solution:**
```bash
# Use a supported terminal
# Recommended: iTerm2 (macOS), Alacritty, Kitty

# Or set simpler rendering
export TERM=xterm-256color
obsidian
```

### "Colors not displaying"

**Cause:** Terminal color support issue.

**Solution:**
```bash
# Check color support
echo $TERM

# Force color support
export FORCE_COLOR=1
obsidian
```

### "Input not responding"

**Cause:** Prompt state stuck.

**Solution:**
```bash
# Press Escape to cancel current operation
# Press Ctrl+C to force interrupt

# If completely stuck, kill and restart
pkill -f obsidian
obsidian
```

---

## Performance Issues

### "Slow response times"

**Causes:**
1. Large context window
2. Network latency
3. Database growing large

**Solution:**
```bash
# Check context usage
/context

# If context is high (>80%), clear history
/clear

# Check database size
ls -lh .obsidian/state.db

# If very large, archive old sessions
# (Sessions auto-archive on new start)
```

### "High memory usage"

**Cause:** Many events in memory, large history.

**Solution:**
```bash
# Clear conversation history
/clear

# Restart to free memory
/exit
obsidian
```

### "Terminal lagging"

**Cause:** Dashboard animation too aggressive.

**Solution:** Currently no config option. A fix is planned in v0.5.0.

---

## Ollama Issues

### "Ollama API error: 400 Bad Request"

**Cause:** The model received an invalid conversation history format, often related to tool calls.

**Solution:**
Update to Obsidian Next v0.4.8 or later, which includes fixes for tool role handling and argument formatting.

### "Model returned empty response"

**Cause:**
1. The model failed to generate text or call a tool.
2. The model tried to call a tool but the arguments were malformed.

**Solution:**
Obsidian v0.4.8 includes auto-recovery for this. If it persists, check if your Ollama model supports tool calling (e.g. `qwen2.5`, `llama3.1`).

### "Agent hangs for 10+ seconds"

**Cause:** Multiple MCP servers connecting sequentially.

**Solution:**
Update to v0.4.8, which parallelizes MCP connections.

---

## Tool Execution Issues

### "Command blocked for safety"

**Cause:** Auditor detected dangerous pattern.

**Solution:**
If the command is safe, it may be a false positive. Options:

1. Rephrase the command
2. Request approval when prompted
3. Add to allow list in settings

```bash
/settings
# Navigate to Permissions -> Add to Allow List
```

### "Search string not found" in edit

**Cause:** Exact string match required but text differs.

**Solution:**
```bash
# Read the file first to get exact content
# Use read tool to see line-by-line

# Common issues:
# - Whitespace differences (tabs vs spaces)
# - Line ending differences (\n vs \r\n)
# - Hidden characters
```

### "File already exists" on write

**Cause:** Write tool only creates new files.

**Solution:**
```bash
# Use edit tool for existing files
# Edit uses search/replace pattern

# If you need to overwrite completely,
# delete first (requires approval) then write
```

---

## Session Issues

### "Tasks not persisting"

**Cause:** Session not saved properly on exit.

**Solution:**
```bash
# Always exit gracefully
/exit

# Not Ctrl+C or killing process

# Check if session was saved
ls -la .obsidian/sessions/
```

### "Context shows 0.0k after resume"

**Cause:** Known issue in older versions.

**Solution:** Update to v0.4.5 or later:
```bash
npm update -g @aurora-foundation/obsidian-next
```

---

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `ECONNREFUSED` | API not reachable | Check network, API status |
| `ENOENT` | File not found | Verify path exists |
| `EACCES` | Permission denied | Check file permissions |
| `ETIMEDOUT` | Request timeout | Retry, check network |
| `SQLITE_BUSY` | Database locked | Kill other instances |
| `EPERM` | Operation not permitted | Check sandbox settings |

---

## Getting Help

### Diagnostic Information

When reporting issues, include:

```bash
# System info
uname -a

# Node version
node --version

# Obsidian version
obsidian --version

# Status output
obsidian
/status
```

### Log Files

Relevant logs:
- `.obsidian/audit.log` - Security and command logs
- `.obsidian/state.db` - Session state (SQLite)
- Terminal output - Copy any error messages

### Support Channels

- **GitHub Issues**: https://github.com/auroradeveloperops/obsidian-next/issues
- **Security Issues**: security@aurora-foundation.dev (do not file public issues)

---

## Reset Everything

If all else fails, complete reset:

```bash
# Backup any important data first
cp -r .obsidian .obsidian.bak

# Remove all Obsidian data
rm -rf .obsidian

# Reinstall globally
npm uninstall -g @aurora-foundation/obsidian-next
npm install -g @aurora-foundation/obsidian-next

# Start fresh
obsidian
/init
```
