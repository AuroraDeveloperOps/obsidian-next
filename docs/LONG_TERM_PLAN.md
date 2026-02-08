# Obsidian-Next Long-Term Development Plan

This document outlines the roadmap for transforming Obsidian-Next into a system-wide, always-on, autonomous engineering partner, leveraging the latest Claude 4.6 models and features.

---

## 1. Architectural Foundations (Global Decoupling) - [IN PROGRESS]
**Goal:** Move from a project-local bot to a global agent that manages multiple workspaces.

- **[COMPLETED]** Centralized state in `~/.obsidian-next/` (DB, settings, logs).
- **[COMPLETED]** Decoupled core tools from `process.cwd()` to use `workspaceRoot`.
- **[TODO]** Implement **Workspace Switching**: A command like `/workspace <path>` to quickly shift focus between projects without restarting.
- **[TODO]** **Shell Persistence**: Ensure `bash` tool maintains environment variables or virtualenv states across calls within a session.

## 2. Advanced LLM Integration (Claude 4.6 Series) - [TODO]
**Goal:** Leverage state-of-the-art reasoning and massive context.

- **Model Updates:** Add `claude-opus-4-6-20260207` and `claude-sonnet-4-5-20250929` to `ConfigSchema`.
- **Extended Thinking:**
    - Update `src/core/llm.ts` to handle `thinking` content blocks.
    - Update UI (`src/ui/MessageList.tsx`) to render "Agent Thinking..." sections that can be toggled/collapsed.
- **1M Token Context Management:**
    - Implement smarter pruning that prioritizes the "Working Set" while summarizing deep history.
    - Optimize cache control for 1M tokens to keep latency and costs low.

## 3. Autonomous Proactivity (Always-On) - [IN PROGRESS]
**Goal:** Transition from reactive (waiting for input) to proactive (running background tasks).

- **[COMPLETED]** Heartbeat Scheduler integration.
- **[COMPLETED]** `/schedule` and `/scheduled_tasks` commands.
- **[TODO]** **Persistent Daemon Mode**: A wrapper or service script to keep Obsidian running in the background (e.g., via `systemd` or `launchd`).
- **[TODO]** **Notification System**: Use OS-level notifications (macOS `osascript`, Linux `notify-send`) to alert the user when background tasks complete or fail.

## 4. Hybrid Memory System (SQLite + Markdown) - [IN PROGRESS]
**Goal:** Transparent, human-readable, and machine-searchable long-term memory.

- **[COMPLETED]** `/memory export` to `MEMORY.md`.
- **[TODO]** **Bidirectional Sync**: Implement `/memory import` to allow users to edit `MEMORY.md` and have changes reflect back into the SQLite database.
- **[TODO]** **Daily Logs**: Automatic generation of `~/.obsidian-next/logs/YYYY-MM-DD.md` summarizing the day's activities, similar to OpenClaw.

## 5. Pilot Mode (Computer Use) - [TODO]
**Goal:** Full GUI and OS automation.

- **Native Computer Tool:** Ensure `src/computer/` is fully robust for macOS/Linux.
- **Visual Verification Loop:** Implement the "Evaluate after each step" logic in the agent loop for screenshots.
- **Safety Overlays:** Display a visual indicator when Pilot Mode is active and taking screenshots.

---

# Feature Testing Checklist

Please test the following features thoroughly to ensure the global transition is stable:

### 1. Global State & Pathing
- [ ] **State Location:** Verify `~/.obsidian-next/` exists and contains `state.db`, `settings.json`, and `audit.log`.
- [ ] **Start Anywhere:** Start `obsidian` from a completely random directory (e.g., `/tmp`). Verify it still sees your global settings and history.
- [ ] **Read/Write Boundary:** Try to `read` or `write` a file outside the `workspaceRoot` defined in `/config`. It should be blocked by the `Auditor`.
- [ ] **Bash Root:** Run `/tool bash command="pwd"`. Verify it returns your `workspaceRoot`, not the directory where you launched the CLI.

### 2. Memory & Export
- [ ] **Memory Export:** Run `/memory export`. Check `~/.obsidian-next/MEMORY.md`. Is the formatting correct? Are the timestamps accurate?
- [ ] **Preference Recall:** Tell the agent a fact (e.g., "I prefer functional programming styles"). Restart the agent. Ask "What do you know about my coding preferences?". It should recall the memo.

### 3. Background Scheduler
- [ ] **Basic Schedule:** Run `/schedule "* * * * *" system:echo '{"message": "ping"}'`. Wait one minute. Verify the "ping" thought appears in the UI.
- [ ] **Persistence:** Schedule a task, then exit the agent (`/exit`). Restart. Run `/scheduled_tasks`. Verify the task is still there and active.
- [ ] **Task List:** Verify `/scheduled_tasks` (or alias `/tasks`) shows correct "Last Run" and "Next Run" times.

### 4. Configuration & UI
- [ ] **Model Change:** Change the model via `/config`. Verify it updates in the Dashboard header.
- [ ] **Mode Switching:** Use `Shift+Tab` to toggle between `safe`, `plan`, and `auto`. Verify the UI reflects this and the behavior changes accordingly (e.g., no confirmations in `auto`).
- [ ] **Workspace Root Update:** Change `workspaceRoot` in `/config`. Verify the Dashboard path updates and tools now target the new root.

---

## Next Steps for AI Agent
1.  Add newest Claude 4.6 model IDs to `src/core/config.ts`.
2.  Implement `thinking` block parsing in `src/core/llm.ts`.
3.  Addcollapsible "Thinking" UI component.
