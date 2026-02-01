# Obsidian Next

![Obsidian Next](assets/obsidianboxes.png)

![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-yellow.svg)
![npm version](https://img.shields.io/npm/v/@aurora-foundation/obsidian-next.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Release](https://img.shields.io/badge/Release-v0.4.2-blue)
![Status](https://img.shields.io/badge/Status-Stable-green)

**Obsidian Next** is a secure, structure-driven AI engineering runtime designed for terminal-native agent workflows.  
Developed by **Aurora Labs**, it provides deterministic execution, strict permission enforcement, and hardened automation tooling for modern AI-assisted development.

> [!WARNING]
> **Active Development**
> Obsidian Next is currently **Stable (v0.4.2 Release Candidate)**.  
> Core architecture is frozen and security audits are complete.  
> Report edge-case issues through the issue tracker.

---

## Quick Start

Install and launch the latest stable release:

```bash
npm install -g @aurora-foundation/obsidian-next
obsidian
```

---

## What Obsidian Next Is

Obsidian Next is a **terminal-native AI development runtime** designed to support secure agent-assisted engineering workflows.

It belongs to the emerging class of structured agent tooling alongside systems such as Claude Code and similar developer automation runtimes, but with a primary focus on:

- Deterministic execution models  
- Typed agent communication  
- Zero-trust security enforcement  
- Local-first infrastructure design  

Obsidian Next is built for environments where AI agents must operate with predictable behavior, strict auditability, and strong operational safeguards.

---

## Core Architecture

### Structure-First Execution Engine

Obsidian agents communicate using **typed JSON event streams** rather than raw text generation.

This approach ensures:

- Deterministic UI synchronization  
- Reliable tool orchestration  
- Reduced parsing ambiguity  
- Stronger agent state tracking  

The agent, runtime supervisor, and interface remain continuously synchronized through structured event messaging.

---

### Auditor Runtime Enforcement Layer

All tool invocations are pre-flight validated by the **Auditor** before execution.

The Auditor enforces:

- Permission verification  
- Destructive operation detection  
- Execution mode restrictions  
- Filesystem and network access validation  

This prevents unsafe agent behavior before it can impact the host environment.

---

### MCP-Native Integration

Obsidian Next integrates directly with the **Model Context Protocol (MCP)**, allowing agents to securely connect to:

- External APIs  
- Databases  
- Tool ecosystems  
- Remote compute services  

Connections remain permission-scoped and follow a local-first execution philosophy.

---

# Security Model (v0.4.2)

Obsidian Next implements a layered **Zero-Trust Automation Architecture**.

## Implemented Security Controls

### MCP Secure Credential Injection
- System keychain credential storage  
- Runtime-only credential injection using `secureEnv`  
- Multi-account scoped credential isolation  

---

### Local-First Runtime Design
- Removal of external database dependencies (Postgres / Redis)  
- Sensitive undo history maintained in memory only  
- Reduced persistent attack surface  

---

### Rotating Key Infrastructure
- Platform-native keychain support  
- AES-256-GCM encrypted fallback storage  
- Machine-derived key protection  
- Automatic rotation detection  
- Zero plaintext credential storage  

---

### Real-Time PII Redaction Engine

Intercepts sensitive data before LLM transmission.

Includes detection for:

- Email addresses  
- Phone numbers  
- Social Security numbers  
- Credit card numbers  
- API tokens  
- AWS credentials  
- Passwords  
- Private keys  
- JWT tokens  

Fully configurable with allowlists and pattern-level toggles.

---

### Comprehensive Audit Logging

All agent activity is recorded:

- Tool execution history  
- File operation logging  
- Approval decision tracking  
- Structured JSON log output  
- Automatic log rotation at 10MB  

---

### Approval Enforcement Engine
- Write operations blocked unless explicitly approved in Safe Mode  
- Execution mode escalation protections  
- Runtime gating for destructive operations  

---

### Sandbox Runtime Isolation
- Native integration with `@anthropic-ai/sandbox-runtime`  
- macOS fallback via `sandbox-exec`  
- Linux fallback via `firejail`  

---

# Roadmap

## MCP & Plugin Ecosystem (v0.5.x — Active)

Focus on runtime extensibility and integration infrastructure.

Planned components:

- MCP Connection Manager  
- `/mcp` command suite  
- `/plugin` extensibility framework  
- MCPMenu interactive configuration UI  
- Pre-configured MCP server registry  
- Expanded system prompt MCP orchestration  

---

## Quality Assurance Initiative

Full testing coverage expansion including:

- Unit testing across all modules  
- Integration testing matrix  
- End-to-end runtime validation  

---

## Hardware-Level Isolation

Future hypervisor integration using:

- Apple Virtualization Framework  
- VM-backed agent execution environments  

---

## Network Namespace Isolation

Per-session isolated network environments providing strict outbound network controls.

---

# Documentation

Complete documentation is available in **[docs/](docs/README.md)**.

### Core References
- MCP Ecosystem Guide  
- Architecture Overview  
- Agent Execution Logic  
- Tool & Safety Reference  
- CLI Design System  
- Sandboxing Configuration  
- Git Workflow Standards  

---

# Installation

## Primary Method (NPM)

```bash
npm install -g @aurora-foundation/obsidian-next
```

Instant execution:

```bash
npx @aurora-foundation/obsidian-next
```

> [!IMPORTANT]
> For high-security or audited environments, cloning and building locally is recommended to maintain full supply-chain transparency.

---

## Development Setup

```bash
git clone https://github.com/auroradeveloperops/obsidian-next.git
cd obsidian-next

npm install
npm run build
```

---

## MCP Server Mode (Experimental)

```bash
cp mcp-config.example.json mcp-config.json
```

Then configure your MCP client (Claude Desktop or compatible runtime).

---

# Usage

## First-Time Setup

```bash
npm start
/init
```

## Environment Key Setup

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

## Interrupt Execution

Press `Esc` at any time to halt agent reasoning or tool execution.

---

# Command Reference

| Command | Purpose |
|----------|------------|
| `/init` | Interactive configuration |
| `/settings` | Settings interface |
| `/mode` | Change execution mode |
| `/models` | Select AI model |
| `/status` | Display runtime state |
| `/context` | Analyze context usage & cost |
| `/undo` | Revert file modifications |
| `/diff` | View file diffs |
| `/sandbox` | Toggle sandbox runtime |
| `/clear` | Reset conversation |
| `/doctor` | Run diagnostics |
| `/resume` | Restore full session state |
| `/exit` | Save session and exit |

---

# Execution Modes

| Mode | Behavior |
|-----------|-------------|
| Safe | Approval required for write operations |
| Plan | Read-only planning mode |
| Auto | Fully autonomous execution |

---

# Session Lifecycle

| Command | Behavior |
|-------------|----------------|
| `npm start` | Start fresh session |
| `/resume` | Restore saved session |
| `/resume --last` | Resume most recent session |
| `/exit` | Persist session and exit |

Fresh sessions intentionally prevent residual automation state from affecting new workflows.

---

# Standards & Compliance

Obsidian Next adheres to:

- Keep a Changelog  
- Semantic Versioning  
- Model Context Protocol  
- Anthropic Sandbox Runtime  

---

# Contributing

Professional standards are enforced:

- Conventional commit format required  
- Structured branch naming conventions  
- Production-grade code review process  

See **CONTRIBUTING.md**.

---

# Team

Obsidian Next is developed by **Aurora Labs**, the applied research division of the **Aurora Foundation**.

Aurora Labs focuses on:

- Zero-trust AI infrastructure  
- Typed agent execution frameworks  
- Secure cognitive runtime environments  

---

# License

Apache License 2.0  
See LICENSE for full details.
