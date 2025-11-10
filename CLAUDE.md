# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

### Before starting work

- Always in plan mode to make a plan
- After get the plan, make sure you Write the plan to .claude/tasks/TASK_NAME.md.
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down.
- If the task require external knowledge or certain package, also research to get latest knowledge (Use Task tool for research)
- Don't over plan it, always think MVP.
- Once you write the plan, firstly ask me to review it. Do not continue until I approve the plan.

### While implementing

- You should update the plan as you work.
- After you complete tasks in the plan, you should update and append detailed descriptions of the changes you made, so following tasks can be easily hand over to other engineers.

## Project Overview

TravelAI API - A NestJS-based backend API using TypeScript. This project uses pnpm as the package manager and follows NestJS conventions for modular architecture.

## Development Commands

### Installation

```bash
pnpm install
```

### Running the Application

```bash
pnpm run start          # Standard mode
pnpm run start:dev      # Watch mode (auto-reloads on changes)
pnpm run start:debug    # Debug mode with watch
pnpm run start:prod     # Production mode (requires build first)
```

### Building

```bash
pnpm run build          # Compiles TypeScript to dist/ directory
```

### Testing

```bash
pnpm run test           # Run unit tests
pnpm run test:watch     # Run tests in watch mode
pnpm run test:cov       # Run tests with coverage report
pnpm run test:e2e       # Run end-to-end tests
pnpm run test:debug     # Run tests in debug mode
```

### Code Quality

```bash
pnpm run lint           # ESLint with auto-fix
pnpm run format         # Format code with Prettier
```

## Architecture

### NestJS Module Structure

This project follows NestJS's modular architecture pattern:

- **Modules** (`@Module`): Organize code into feature-based modules, handle dependency injection
- **Controllers** (`@Controller`): Handle HTTP requests and responses, route definitions
- **Services** (`@Injectable`): Business logic, can be injected into controllers and other services
- **Providers**: General injectable dependencies (services, repositories, factories, etc.)

The root module is [AppModule](src/app.module.ts), which imports all feature modules.

### TypeScript Configuration

- **Module System**: `nodenext` with ES module interop
- **Decorators**: Enabled (`experimentalDecorators`, `emitDecoratorMetadata`) - required for NestJS dependency injection
- **Strict Null Checks**: Enabled
- **Implicit Any**: Disabled - TypeScript is somewhat permissive

### Testing Structure

- **Unit Tests**: Located alongside source files with `.spec.ts` suffix in `src/`
- **E2E Tests**: Located in `test/` with `.e2e-spec.ts` suffix
- **Test Framework**: Jest with ts-jest for TypeScript support

## Code Style

### ESLint Rules

- No explicit `any` types allowed (enforced)
- Floating promises generate warnings
- Unsafe arguments generate warnings
- Prettier integration for formatting

### Prettier Configuration

- Single quotes preferred
- Trailing commas in all places
- Auto end-of-line handling

## Adding New Features

When creating new NestJS features:

1. Generate using NestJS CLI: `nest generate <schematic> <name>` (e.g., `nest g controller users`)
2. Create modules for distinct features to maintain separation of concerns
3. Register new modules in the imports array of [AppModule](src/app.module.ts)
4. Write unit tests (`.spec.ts`) for services and controllers
5. Write e2e tests for complete API endpoints in `test/` directory
