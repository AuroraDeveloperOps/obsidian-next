# Contributing

We appreciate contributions. Please follow these guidelines.

## Code Standards

- TypeScript strict mode required
- No `any` types without justification
- Descriptive variable and function names
- 2-space indentation

## Commit Messages

Follow Conventional Commits:

```
feat: add user validation
fix: correct email regex pattern
docs: update API reference
test: add service tests
refactor: reorganize error handling
```

## Pull Request Process

1. Create feature branch from main
2. Write tests for all new code
3. Run `npm test` and ensure all pass
4. Run `npm run build` and verify output
5. Update `CHANGELOG.md` in Unreleased section
6. Create PR with description

## Testing

Minimum 80% code coverage required:

```bash
npm run test -- --coverage
```

## Development

```bash
npm install
npm run dev
npm run build
npm test
```
