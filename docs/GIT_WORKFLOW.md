# Git Workflow & Versioning Protocol

This document establishes the strict versioning and commitment protocols for the **Obsidian Next** project. All contributors (human and AI) must adhere to these rules.

## 1. Semantic Versioning

We adhere to **[Semantic Versioning 2.0.0](https://semver.org/)**.

- **MAJOR** (`x.0.0`): Incompatible API changes.
- **MINOR** (`0.x.0`): Backwards-compatible functionality.
- **PATCH** (`0.0.x`): Backwards-compatible bug fixes.

### Release Channels
- **Stable**: `vX.Y.Z` (e.g., `v0.4.0`)
- **Pre-release**: `vX.Y.Z-beta.N` (e.g., `v0.4.1-beta.1`)

## 2. Conventional Commits

We adhere to **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)**.

**Format**:
```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries such as documentation generation

**Examples**:
- `feat(ui): add session menu view`
- `fix(core): resolve session leak in agent init`
- `docs: update roadmap for mcp phase`

## 3. Branching Strategy

- **`main`**: Production-ready code. Always stable.
- **`develop`**: Integration branch for next release.
- **`username-feature/description`**: Feature branches (e.g., `polyoxy-feat/mcp-manager`).
- **`username-fix/description`**: Bug fix branches.

## 4. Workflows

### 4.1. Committing Code
Before committing, you MUST:
1.  **Build**: Ensure `npm run build` passes.
2.  **Lint/Test**: Ensure no regressions.
3.  **Format**: Message must follow Conventional Commits.

### 4.2. Releasing
To cut a release:
1.  **Bump Version**: Update `package.json`.
2.  **Changelog**: Add entry to `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/).
3.  **Build**: Verify production build (`npm run build`).
4.  **Tag**: Git tag matching version (e.g., `v0.4.1`).
5.  **Push**: Push commit and tags.
