# Architecture

## Layers

### Domain (src/types/)
Type definitions and interfaces. Framework-agnostic business models.

### Services (src/services/)
Business logic, validation, error handling. Stateless when possible.

### Utils (src/utils/)
Cross-cutting concerns: logging, errors, helpers.

### Application (src/index.ts)
Entry point. Initializes services and handles top-level concerns.

## Error Handling

Custom error hierarchy with status codes:

```
AppError (500)
├── ValidationError (400)
└── NotFoundError (404)
```

## Logging

Levels: DEBUG, INFO, WARN, ERROR

```typescript
logger.info('User created', { id: user.id })
```

## Adding Features

1. Define types in `src/types/`
2. Create service in `src/services/`
3. Add tests in `tests/`
4. Export from `src/index.ts`

## Configuration

- **TypeScript**: Strict mode, ES2020 target
- **Testing**: Jest with ts-jest
- **Linting**: ESLint recommended rules
