# Obsidian Next

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

A professional, structured, and secure AI agent interface for the terminal. Built with "Structure-First" architecture for rigorous and interactive user experiences.

## Table of Contents
- [Philosophy](#philosophy)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Philosophy
- **Structure First**: Agents emit Typed JSON Events, not raw text streams.
- **Security**: Secrets are managed via Environment Variables only. No file-based key storage.
- **Zero Hallucination**: Implements "The Auditor" pattern for pre-flight verification of tool calls.

## Installation

### Prerequisites
- Node.js v20+
- `pnpm` or `npm`

### Setup
```bash
# 1. Clone the repository
git clone https://github.com/your-org/obsidian-next.git
cd obsidian-next

# 2. Install dependencies
npm install

# 3. Build the project
npm run build
```

## Usage

### Configuration
Set your API key in your environment (e.g., in `.zshrc` or `.bashrc`):
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Running the CLI
```bash
# Initialize configuration
node dist/index.js /init

# Start the Agent
node dist/index.js
```

## Architecture
This project uses a Supervisor-Worker topology managed by a strict Event Bus.
- **Supervisor**: Manages context and delegation.
- **Workers**: Specialized agents (Planner, Coder, Researcher).
- **EventBus**: Typed `AgentEvent` protocol for UI rendering.

## Architecture
This project uses a Supervisor-Worker topology managed by a strict Event Bus.
- **Supervisor**: Manages context and delegation.
- **Workers**: Specialized agents (Planner, Coder, Researcher).
- **EventBus**: Typed `AgentEvent` protocol for UI rendering.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Contributing
We enforce strict professional standards.
- **No Emojis** in documentation or commits.
- **Conventional Commits** are required.
- **Branch -> PR** workflow.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
