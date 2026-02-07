# Git Workflow & Versioning Protocol

This document establishes the **strict** versioning and logic constraints for the **Obsidian Next** project.
All contributors (human and AI) must adhere to these rules without exception.

## 1. Branching Strategy

We utilize a **Feature Branch Workflow.**

| Branch | Description | Access |
|--------|-------------|--------|
| `main` | Production-ready, stable code. Deployed to NPM. | Protected (PR Required) |
| `feat/*` | Feature development. | Developer |
| `fix/*` | Bug fixes. | Developer |

### Naming Convention

**Format**: `username-type/description`

| Segment | Allowed Values | Example |
|---------|----------------|---------|
| `username`| GitHub handle | `polyoxy` |
| `type` | `feat`, `fix`, `chore`, `docs`, `refactor` | `feat` |
| `description`| Kebab-case, short summary | `context-grid` |

**Examples**:
- `polyoxy-feat/context-grid` (Valid)
- `jdoe-fix/spinner-alignment` (Valid)
- `add-login` (Invaild: Missing username/type)
- `polyoxy/new-feature` (Invalid: Missing type)

---

## 2. Commit Standards

We strictly enforce **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)**.

**Format**:
```text
<type>(<scope>): <description>

[optional body]
```

### Types
- `feat`: A new feature (correlates with MINOR).
- `fix`: A bug fix (correlates with PATCH).
- `docs`: Documentation only changes.
- `chore`: Build process, deps, auxiliary tools.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.

### Scopes
- `core`: Core runtime logic (`src/core`).
- `ui`: Terminal Interface (`src/ui`).
- `mcp`: MCP Integration (`src/mcp`).
- `docs`: Documentation files (`docs/`).

**Examples**:
- `feat(core): implement 10x10 context grid` (Valid)
- `fix(ui): correct usage view alignment` (Valid)
- `added context grid` (Invalid format)

---

## 3. Pull Request Protocol

1.  **Atomic PRs**: One feature or fix per PR.
2.  **Passes Tests**: `npm test` must be clean.
3.  **No Dead Code**: Remove debug logs (`console.log`) and commented-out blocks.
4.  **Documentation**: Update `README.md` and `docs/` if behavior changes.

## 4. Release & Daemon Lifecycle

1.  **Version Bump**: `npm version <major|minor|patch>`
2.  **Changelog**: Update `CHANGELOG.md` with new version header.
3.  **Daemon Update**: The daemon detects binary updates and requests a graceful restart via the IPC socket.
4.  **Daily Log Commits**: (Optional) The agent can be scheduled to commit the day's `logs/*.md` to a private `obsidian-memory` repository.
