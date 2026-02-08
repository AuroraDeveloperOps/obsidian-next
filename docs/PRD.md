# Product Requirements Document (PRD): Obsidian Next

**Project**: Obsidian Next
**Status**: Autonomous Transformation (Feb 2026)
**Version**: 0.4.6

## 1. Core Philosophy: The Autonomous Gateway
1.  **Always-On Background Service**: Obsidian is a global daemon, not a project-bound script. It runs 24/7, performing proactive maintenance while the user is away.
2.  **Adaptive Thinking (Claude 4.6)**: The agent utilizes the latest "Reasoning Blocks" to plan complex engineering tasks. It modulates `effort` based on task difficulty.
3.  **1M Token Context Mastery**: Leveraging the massive context window to hold entire codebases in active memory, optimized with deep-history summarization and prompt caching.
4.  **Self-Improving Capabilities**: The agent autonomously writes, tests, and registers its own skills to overcome capability gaps.

## 2. Infrastructure Requirements
- **Daemon Process**: Persistent Node.js service started on boot (via `launchd`/`systemd`).
- **IPC Layer**: High-speed communication via Unix Domain Sockets (`~/.obsidian-next/daemon.sock`).
- **Global Store**: All state (history, memory, tasks) centralized in `~/.obsidian-next/`.
- **Lane Queue**: Orchestrates concurrent requests from CLI, mobile (Telegram), and web interfaces.

## 3. Autonomous Features
- **Proactive Heartbeat**: Scheduled background tasks (`/schedule`) for security audits, test runs, and codebase indexing.
- **Remote Gateway**: Secure Telegram integration for remote status checks and approvals.
- **Hybrid Memory Sync**: Bidirectional sync between SQLite and a human-readable `MEMORY.md` file.
- **Pilot Mode**: Secure GUI automation with a visual evaluation loop and real-time PII redaction on screenshots.

## 4. Interaction Standards
- **Thinking Trace**: Real-time streaming of "Reasoning" blocks before the tool call.
- **Structured Choices**: Selectable lists for permissions, model selection, and workspace navigation.
- **Tab-to-Context**: If a user rejects a plan, they can press `TAB` to provide detailed feedback which is fed back into the reasoning loop.

## 5. Built-in Commands (The Autonomous Toolkit)

| Command | Description |
|---------|-------------|
| `/init` | Setup global service and API keys. |
| `/schedule`| Schedule background tasks (cron-based). |
| `/memory` | Manage long-term knowledge and export to MD. |
| `/workspace`| Switch between multiple active projects. |
| `/pilot` | Enable/Disable secure GUI automation. |
| `/mode` | Set agent agency level (auto/plan/safe). |
| `/status` | Daemon health, task progress, and usage grid. |
| `/undo` | Revert any file modification across the system. |

## 6. Execution Protocol
To ensure safety in an autonomous environment, the daemon enforces:
1. **Auditor Pre-flight**: Every tool call is vetted against global security rules.
2. **Sandbox Isolation**: OS-level boundaries for shell and file operations.
3. **Emergency Kill Switch**: Immediate cessation of all autonomous activity via local or remote trigger.

