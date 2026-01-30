# Scalable TypeScript App

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Jest](https://img.shields.io/badge/tested%20with-jest-c63161.svg)](https://jestjs.io/)

A production-ready, scalable TypeScript project with clean architecture, comprehensive error handling, and structured logging.

## Overview

This project demonstrates best practices for enterprise TypeScript development including:

- **Clean Architecture**: Separated concerns with types, services, and utilities
- **Error Handling**: Custom error classes with proper inheritance
- **Structured Logging**: Configurable logger with levels
- **Type Safety**: Strict TypeScript configuration
- **Testing**: Jest setup with test utilities
- **Code Quality**: ESLint configuration for consistency

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Features](#features)
- [API Reference](#api-reference)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)

## Quick Start

### Prerequisites

- Node.js 20 or higher
- npm or pnpm

### Installation

git clone <repository>
cd workspace
npm install

### Development

npm run dev

### Production Build

npm run build
npm start

## Project Structure

workspace/
├── src/
│   ├── types/           Type definitions and interfaces
│   │   └── user.ts      User domain model
│   ├── services/        Business logic layer
│   │   └── userService.ts   User management service
│   ├── utils/           Shared utilities
│   │   ├── logger.ts    Structured logging
│   │   └── errors.ts    Custom error classes
│   └── index.ts         Application entry point
├── tests/               Unit tests
│   └── userService.test.ts
├── dist/                Compiled JavaScript output
├── config/              Configuration files
├── package.json         Project dependencies
├── tsconfig.json        TypeScript configuration
├── jest.config.js       Test runner configuration
└── .eslintrc.json       Code quality rules

## Features

### Type Safety

All code is written in TypeScript with strict mode enabled. Comprehensive type definitions ensure compile-time safety.

### Error Handling

Custom error classes provide typed error handling:

- AppError: Base error class with code and status codes
- ValidationError: Input validation failures
- NotFoundError: Resource not found scenarios

### Logging

Structured logger with configurable levels:

logger.debug(message, data)
logger.info(message, data)
logger.warn(message, data)
logger.error(message, data)

### Services

UserService example implementation demonstrating:

- CRUD operations
- Input validation
- Proper error throwing
- Logging integration

## API Reference

### UserService

#### createUser(input: CreateUserInput): User

Creates a new user. Validates name and email format.

Throws: ValidationError

#### getUser(id: number): User

Retrieves user by ID.

Throws: NotFoundError

#### getAllUsers(): User[]

Returns all users.

#### updateUser(id: number, updates: Partial<CreateUserInput>): User

Updates user properties.

Throws: NotFoundError, ValidationError

#### deleteUser(id: number): boolean

Deletes user by ID.

## Development

### Adding a New Service

1. Define types in src/types/
2. Create service in src/services/
3. Export from src/index.ts
4. Add tests in tests/

### Code Style

- No semicolons (configured in ESLint)
- 2-space indentation
- Descriptive variable names
- JSDoc for public methods

### Best Practices

- Use types instead of interfaces when possible for union types
- Always validate external inputs
- Log significant operations
- Throw custom errors instead of generic Error
- Write tests for business logic

## Testing

Run all tests:

npm test

Run with coverage:

npm test -- --coverage

Tests use Jest with ts-jest preset. Place tests alongside source with .test.ts suffix.

## Contributing

1. Create feature branch from main
2. Write tests for new features
3. Ensure all tests pass
4. Create pull request with description

See CONTRIBUTING.md for full guidelines.

## License

MIT License - see LICENSE file for details.
