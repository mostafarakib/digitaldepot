# DigitalDepot — Development Rules

## 1. General Principles

- Treat `PROJECT_SPEC.md` as the authoritative source for project scope, features, technology choices, and business rules.
- Treat `IMPLEMENTATION_ROADMAP.md` as the implementation sequence.
- Follow established decisions unless explicitly approved to change them.
- Prioritize correctness, maintainability, security, and simplicity.
- Avoid unnecessary abstractions, dependencies, and premature optimization.
- Do not introduce features outside the approved project scope.

## 2. Monorepo Structure

Use npm workspaces with the following high-level structure:

    digitaldepot/
    ├── apps/
    │   ├── web/              # Next.js storefront and admin dashboard
    │   └── api/              # Express REST API
    ├── packages/             # Shared code, only when genuinely needed
    ├── docs/
    │   ├── PROJECT_SPEC.md
    │   ├── DEVELOPMENT_RULES.md
    │   └── IMPLEMENTATION_ROADMAP.md
    ├── package.json
    ├── package-lock.json
    ├── .gitignore
    └── README.md

Each application must maintain its own clear internal organization.

- Keep frontend and backend responsibilities separate.
- The frontend must never access the database directly.
- Keep shared packages limited to genuinely reusable code and safe contracts.
- Do not create packages merely to make the structure look sophisticated.
- Determine internal folder structures according to the application's architecture and actual needs.

## 3. Architecture and Code Organization

### Frontend
- Use Next.js App Router and TypeScript.
- Organize code by feature or domain where appropriate.
- Keep components reusable without over-generalizing them.
- Separate UI components, business logic, API communication, and state management.
- Use TanStack Query for server state.
- Use local React state by default; introduce global state only when justified.
- Use React Hook Form and Zod for form handling and validation.
- Keep API communication centralized and consistent.

### Backend
- Use Express with TypeScript.
- Follow a modular monolith architecture.
- Organize backend code by business domain.
- Maintain clear separation between routes, controllers, services, data access, validation, and middleware where appropriate.
- Keep business rules in the appropriate service/domain layer, not in route handlers.
- Use Prisma for database access.
- Use database transactions for operations requiring atomicity.
- Keep external service integrations behind replaceable service interfaces.

Do not force unnecessary design patterns or layers into simple functionality.

## 4. Database Rules

- PostgreSQL is the primary database.
- Prisma is the ORM and schema-management tool.
- Use migrations for all database schema changes.
- Never modify the production database schema manually as a substitute for migrations.
- Use appropriate foreign keys, unique constraints, indexes, and database constraints.
- Use transactions and atomic operations for inventory, payments, coupons, and other concurrency-sensitive operations.
- Use JSONB only for genuinely flexible structured data, not as a replacement for relational modelling.
- Preserve historical order, payment, and financial records.
- Avoid destructive changes that could compromise existing data.

## 5. API and Validation

- Use versioned REST endpoints under `/api/v1`.
- Maintain consistent API response and error formats.
- Validate all untrusted input on the backend using Zod.
- Never rely solely on frontend validation.
- Use appropriate HTTP methods and status codes.
- Apply pagination, filtering, sorting, and reasonable request limits where relevant.
- Keep controllers focused on HTTP concerns.
- Do not expose internal errors, stack traces, or sensitive information to clients.

## 6. Authentication and Authorization

- Follow the authentication and security requirements in `PROJECT_SPEC.md`.
- Centralize authentication and authorization middleware.
- Enforce authorization on the backend for every protected operation.
- Never trust user IDs, roles, prices, permissions, or ownership claims supplied by the client without verification.
- Protect cookie-authenticated state-changing requests against CSRF.
- Never store authentication secrets in frontend-accessible storage.
- Never commit credentials, tokens, or environment files.

## 7. Frontend and UI Standards

- Use TypeScript consistently; avoid `any` unless genuinely unavoidable.
- Use Tailwind CSS and shadcn/ui for the interface.
- Maintain consistent spacing, typography, colours, and component behaviour.
- Build responsive interfaces from the beginning.
- Support English and Bangla throughout the application.
- Avoid hardcoded user-facing text; use the established internationalization system.
- Ensure forms, dialogs, navigation, and interactive components are accessible.
- Include meaningful loading, empty, success, and error states.
- Avoid unnecessary client-side rendering when server components are sufficient.
- Keep the storefront and admin dashboard visually consistent but appropriate for their different purposes.

## 8. Error Handling and Logging

- Use centralized error handling.
- Handle expected operational errors explicitly.
- Avoid silently swallowing errors.
- Use structured logging.
- Never log passwords, tokens, payment credentials, or other sensitive data.
- External service failures must not unnecessarily interrupt unrelated core operations.
- Notification delivery failures must not roll back successful orders or payments.

## 9. Testing

- Write tests alongside implementation rather than postponing all testing.
- Use Vitest for unit and integration testing.
- Use Supertest for API testing.
- Use Playwright for important end-to-end customer and admin workflows.
- Prioritize tests for authentication, authorization, inventory, checkout, payments, coupons, orders, returns, and refunds.
- Test failure cases, invalid input, and concurrent operations where relevant.
- Do not consider a feature complete merely because its happy path works.

## 10. Dependencies and Configuration

- Prefer stable, actively maintained packages.
- Avoid adding dependencies when existing tools can solve the problem reasonably.
- Ask for approval before introducing major dependencies or infrastructure.
- Keep configuration environment-based.
- Maintain `.env.example` with documented variable names and safe placeholder values.
- Never commit `.env` files or real credentials.
- Keep development, testing, and production configuration appropriately separated.

## 11. Git and Development Workflow

- Initialize Git from the beginning.
- Use meaningful, focused commits.
- Do not commit generated files, secrets, dependencies, or local environment data.
- Keep the main branch in a working state.
- Review changes before committing.
- Run relevant checks and tests before considering a task complete.
- Update documentation when implementation changes affect documented behaviour or setup.

## 12. Antigravity Working Agreement

Antigravity acts as the implementation agent under the user's direction.

### Before implementation
- Inspect the existing repository and relevant documentation.
- Understand the current implementation phase.
- Identify missing information or conflicting requirements.
- Ask before proceeding when a consequential decision is unclear.

### During implementation
- Implement only the currently approved task.
- Make reasonable technical decisions within the established architecture.
- Do not silently change scope, business rules, or technology choices.
- Do not introduce unnecessary infrastructure or dependencies.
- Avoid unrelated refactoring.
- Keep changes focused and explain important decisions.

### Approval required
Ask the user before:
- Changing the architecture or primary technology stack.
- Introducing major dependencies or external infrastructure.
- Changing established business rules.
- Expanding or removing project features.
- Making consequential database or security design changes not covered by the specification.

Routine implementation details do not require approval.

### After implementation
- Run relevant tests, linting, and type checks.
- Fix issues introduced by the implementation.
- Summarize what was implemented and any important decisions.
- Mention remaining issues or limitations honestly.
- Update relevant documentation if necessary.
- Stop and wait for the user's instruction before starting another roadmap phase.

## 13. Final Rule

Use engineering judgment for implementation details, but never confuse implementation freedom with permission to change the project's established requirements.

Build DigitalDepot incrementally, keep it understandable, and prioritize working, tested functionality over unnecessary complexity.