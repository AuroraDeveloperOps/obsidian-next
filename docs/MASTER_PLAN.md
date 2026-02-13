# Obsidian-Next: The Autonomous Engineering Intelligence (Master Plan)

> Version: 0.4.8 | Updated: 2026-02-13

This master plan synthesizes the advanced capabilities of **Claude 4.6**, the architectural robustness of **OpenClaw**, and industry best practices for **autonomous daemonized agents**.

---

## 1. Core Architecture: The "Always-On" Daemon
Transform the CLI from a script into a robust background service.
*   **Daemon Strategy:** Implement a persistent background process using Unix Domain Sockets (`~/.obsidian-next/daemon.sock`) for communication between the CLI "frontend" and the Agent "backend."
*   **Concurrency: The Lane Queue:** Implement a "Lane Queue" to handle multiple interfaces (Terminal, Web, Telegram).
    *   *Serial Execution:* Ensure only one state-changing tool (e.g., `write`, `bash`) runs at a time to prevent file-system race conditions.
    *   *Atomic Transactions:* Use SQLite's WAL mode to ensure the daemon's internal state is always consistent even if the process is killed.
*   **Lifecycle Management:** Native service generators for `launchd` (macOS) and `systemd` (Linux) to ensure Obsidian-Next starts on boot and restarts on failure.

## 2. Intelligence: Adaptive Multi-Provider Engine
Fully integrate the newest model features for peak engineering capability.
*   **Provider Agnostic Core:** Support for both Anthropic Claude 4.6 and local Ollama models (e.g. qwen2.5, llama3.1) with intelligent routing.
*   **Adaptive Thinking Effort:** Implement a dynamic `effort` toggle.
    *   `max`: Use for refactoring, complex planning, and bug root-cause analysis.
    *   `low`: Use for repetitive file reads, listing directories, and health checks.
*   **The Thinking Trace:** A dedicated UI component to stream "Thinking Blocks" in real-time, allowing the user to see the "why" before the "what."
*   **1M Context Optimization:**
    *   **Prompt Caching:** Move the static codebase schema and "rules of engagement" to the top of the system prompt to hit 90%+ cache rates.
    *   **Background Distillation:** Every 100k tokens, spawn a background process to compress old conversation segments into high-fidelity "Episodic Memos" stored in SQLite.

## 3. Hybrid Memory: The Semantic Knowledge Bank
Merge human-readable Markdown with high-speed vector search.
*   **Tiered Storage:**
    1.  **SQLite (Relational):** The primary engine for logs, tasks, and state.
    2.  **sqlite-vec (Semantic):** Use `sqlite-vec` for local, lightning-fast semantic search across all your past sessions and projects.
    3.  **Durable Markdown (`MEMORY.md`):** Bidirectional sync. The agent updates this file with "Learned Patterns" and "Project Rules." You can edit it to manually "program" the agent's behavior.
*   **Automatic Daily Logbook:** A folder `~/.obsidian-next/logs/` where every day is a Markdown file (`YYYY-MM-DD.md`) containing:
    *   Summary of tasks completed.
    *   Key errors encountered and resolved.
    *   Decisions made.

## 4. Autonomous Growth: Self-Improving Tools
Allow the agent to autonomously extend its own capabilities.
*   **The `create_skill` Workflow:**
    1.  The agent detects it doesn't have a tool for a specific task (e.g., "I need to talk to the JIRA API").
    2.  It uses its `bash` and `write` tools to generate a new TypeScript tool in `~/.obsidian-next/skills/`.
    3.  It runs a generated unit test to verify the tool.
    4.  It dynamically imports the new tool into the registry.
*   **Permission Scoping:** All self-generated skills are automatically "restricted" and require manual approval for the first 3 runs.

## 5. Global Gateway: Remote Autonomy
Break the terminal boundary.
*   **Telegram Integration:** A secure gateway allowing you to monitor the agent from your mobile device.
    *   *Remote Approval:* If the agent is running a background refactor and hits a risky command, it sends a Telegram message with a "Approve/Deny" button.
*   **Proactive Heartbeat:** The agent performs "Ghost Work" while you sleep:
    *   *Nightly Audit:* Scans for security vulnerabilities and dead code.
    *   *Documenter:* Generates docstrings for newly written functions.

---

# Implementation Roadmap

### Phase 1: The Brain Upgrade (Completed)
- [x] Update `src/core/config.ts` with Claude 4.6 model IDs.
- [x] Implement `ThinkingBlock` parsing in `src/core/llm.ts`.
- [x] Integrate Ollama and Multi-Provider routing.

### Phase 2: The Service Layer (Completed)
- [x] Support `--daemon` mode.
- [x] Implement the Unix Domain Socket listener.
- [x] Create `/init --service` to generate system startup files.

### Phase 3: Semantic Memory (Completed)
- [x] Integrate `sqlite-vec` for local embeddings.
- [x] Implement history distillation and compression.
- [x] Set up bidirectional sync for `MEMORY.md`.

### Phase 4: Self-Improving Skills (Completed)
- [x] Implement the `DynamicToolRegistry`.
- [x] Create the `create_skill` tool with its sandboxed verification loop.

### Phase 5: The Remote Gateway (Completed)
- [x] Implement the Telegram Bot API bridge.
- [x] Add "Proactive" scheduling logic for audits.
