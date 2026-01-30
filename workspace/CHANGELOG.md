# Changelog

## [Unreleased]

### Added
- Initial project scaffold with clean architecture
- UserService with CRUD operations
- Type-safe User domain model
- Custom error classes: AppError, ValidationError, NotFoundError
- Structured Logger with configurable log levels
- Input validation for users (name, email format)
- Jest testing framework with ts-jest preset
- ESLint configuration for code quality
- TypeScript strict mode enabled

### Security
- Email validation using regex pattern
- Input sanitization in UserService
- Type-safe error handling

## [0.1.0] - 2025-01-30

### Added
- Project initialization and structure
- Basic UserService implementation
- Logger utility
- Error handling system
- Test setup with Jest
- Configuration files (tsconfig, eslint, jest)
