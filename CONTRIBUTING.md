# Contributing to Obsidian Next

Thank you for your interest in Obsidian Next. This project adheres to strict professional standards.

## 1. Core Philosophy
- **Professional Tone**: No Emojis in documentation, commits, or code comments. Use `[INFO]`, `[WARN]` tags instead.
- **Structure First**: Agents emit Typed JSON Events, not raw text.
- **Security**: Secrets (API Keys) must **NEVER** be committed. use `.env` or `~/.obsidian/config.json` (gitignored).

## 2. Git Lifecycle
We follow a strict Feature Branch workflow:

1.  **Branch**: Create a branch for your feature.
    ```bash
    git checkout -b feature/your-feature-name
    ```
2.  **Atomic Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/).
    ```bash
    git commit -m "feat(core): implement event bus"
    git commit -m "fix(ui): correct spinner alignment"
    ```
3.  **Verify**: Run tests before pushing.
    ```bash
    npm test
    npm run build
    ```
4.  **Pull Request**: Open a PR into `main`.

## 3. Development Setup
1.  **Install**: `npm install`
2.  **Build**: `npm run build`
3.  **Test**: `npm test`
4.  **Dev Loop**: `npm run dev` (Runs `src/index.ts`)

## 4. Project Structure
- `src/core/`: EventBus, Config, CommandRegistry.
- `src/components/`: **Ink** UI components only (Visuals).
- `src/agents/`: **Logic** only (No UI).
- `src/events/`: Shared Types (The Protocol).

## 5. Visual Standards
- Use `*` for Agent thoughts.
- Use `>` for Tool output.
- Colors: Cyan (User), Gray (Thought), White (Output).
