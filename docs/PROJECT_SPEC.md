# DigitalDepot — Project Specification

## 1. Project Overview

DigitalDepot is a Bangladesh-focused, single-retailer e-commerce platform for selling electronics and consumer technology products. It is designed for a small-to-medium retail business and will serve as a production-style portfolio project.

**Core characteristics:**
- Market: Bangladesh
- Currency: BDT
- Languages: English and Bangla
- Store model: Single retailer, single physical store
- Architecture: Monorepo with separate frontend and backend applications
- Initial scope: A complete customer-facing storefront and an operational admin dashboard

This is not a multi-vendor marketplace. Multi-branch and multi-warehouse support are outside the initial scope.

## 2. Product Scope

The catalogue will support:

- Smartphones and tablets
- Laptops and computers
- Computer components
- Monitors and displays
- Peripherals and accessories
- Audio devices and headphones
- Smartwatches and wearables
- Other consumer electronics

Products may have multiple purchasable variants, such as different colours, storage capacities, or configurations.

## 3. Customer-Facing Features

### Storefront
- Homepage with featured products, new arrivals, promotions, and categories.
- Product catalogue with search, filtering, sorting, and pagination.
- Product detail pages with images, descriptions, specifications, variants, pricing, warranty, and availability.
- Product reviews and ratings.
- Responsive, mobile-first shopping experience.
- SEO-friendly product and category pages.

### Customer Accounts
- Email/password registration and login.
- Google OAuth authentication.
- Email verification and password recovery.
- Customer profile and address management.
- Order history and order tracking.
- Wishlist management.
- Eligible order cancellation.
- Return and refund requests.
- Review management.
- Language and theme preferences.

### Shopping and Checkout
- Shopping cart and guest cart support.
- Merge guest carts after authentication.
- Wishlist and coupon support.
- Checkout requires authentication.
- Address and shipping selection.
- Server-side validation of prices, stock, discounts, shipping, and totals.
- Cash on Delivery (COD) and online payment options.

## 4. Admin Dashboard

The admin dashboard must provide the tools required to operate the store.

- Dashboard overview and business reports.
- Product, variant, category, and brand management.
- Pricing and price history.
- Inventory and stock adjustments.
- Order processing and tracking.
- Customer management.
- Coupon and promotion management.
- Payment monitoring and reconciliation.
- Return and refund management.
- Review moderation.
- Shipping configuration.
- Store settings.
- Audit logs.

The interface should prioritize clarity, usability, and operational efficiency.

## 5. Business Rules

### Products and Inventory
- Products are customer-facing catalogue entries; variants represent actual purchasable SKUs.
- Every published product must have at least one active variant. Products without selectable options use a default variant.
- SKU, price, and inventory are managed at the variant level.
- Product lifecycle states: DRAFT, PUBLISHED, and ARCHIVED.
- Availability, including out-of-stock status, is derived from inventory rather than product lifecycle.
- Categories support hierarchy; brands are managed separately.
- Product specifications should support flexible structured attributes.
- Historical order references must be preserved; referenced catalogue records must not be casually hard-deleted.

### Cart and Orders
- Guest users may maintain carts, but checkout requires authentication.
- Order creation must use server-validated product prices, inventory, discounts, shipping, and totals.
- Orders must preserve snapshots of purchased products, variants, prices, and delivery addresses.
- Inventory must be reserved during checkout to prevent overselling.
- Inventory operations must be atomic and must not allow negative stock.
- V1 supports whole-order cancellation, not partial order-item cancellation.
- Order and payment statuses must be managed separately.

### Payments and Refunds
- Support COD and online payments.
- Payment integration must be provider-agnostic.
- Frontend redirects must never be treated as authoritative payment confirmation.
- Payment callbacks/webhooks must be verified server-side and handled idempotently.
- Duplicate payment events and repeated requests must not create duplicate financial operations.
- An order may have multiple payment attempts, but only one successful payment.
- Refunds may be full or partial and must never exceed the refundable amount.
- Return and refund workflows must remain separate from the primary order lifecycle.

### Returns and Reviews
- Support item-level return requests and full or partial refunds.
- Return processing must coordinate with inventory and payment operations.
- Reviews are restricted to authenticated customers with an eligible delivered purchase.
- Review eligibility must account for returned items.

### Money and Coupons
- Store monetary values as integer minor units (BDT poysha).
- Never use floating-point arithmetic for financial calculations.
- Apply explicit rounding rules consistently.
- Coupon usage limits must be enforced safely under concurrent requests.
- Cart validation must not consume coupon usage.

## 6. Authentication and Security

- Use secure, HttpOnly cookies for web authentication.
- Implement short-lived access tokens and rotating refresh tokens.
- Maintain server-side session state and support session revocation.
- Hash passwords using Argon2id.
- Support secure Google OAuth account linking.
- Password changes and resets must revoke existing sessions.
- Protect cookie-authenticated state-changing requests against CSRF.
- Restrict credentialed CORS to trusted frontend origins.
- Use centralized validation, authorization, error handling, and rate limiting.
- V1 roles: CUSTOMER and ADMIN.
- Never expose credentials, tokens, or sensitive information in logs.

## 7. Technology Stack

### Frontend
- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React
- TanStack Query
- React Hook Form
- Zod
- next-intl

Use Zustand only where client-side global state genuinely requires it.

### Backend
- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod
- Argon2id
- Secure cookie-based authentication
- Pino logging

### Project Structure and Tooling
- Monorepo with separate frontend and backend applications.
- npm workspaces.
- REST API with versioned routes (`/api/v1`).
- Backend is the only application that accesses the database.
- Shared packages may contain safe shared types or contracts where useful.
- ESLint and Prettier.
- Vitest and Supertest for backend testing.
- Playwright for end-to-end testing.

Exact package versions and implementation details should use stable, compatible releases.

## 8. External Services

Prefer free tiers, sandboxes, or low-cost services suitable for a portfolio project.

Potential integrations:
- Cloudinary for product image storage.
- Resend for transactional emails.
- Google OAuth for authentication.
- SSLCommerz sandbox for testing Bangladesh online payments.

Keep integrations replaceable through clear service abstractions. Sandbox testing must not be represented as real payment processing.

## 9. Internationalization and UI

- Support English and Bangla throughout the storefront and admin interface.
- Use locale-aware routes.
- Maintain a consistent product slug across languages.
- Support light, dark, and system themes.
- Ensure responsive layouts across mobile, tablet, and desktop.
- Use accessible, reusable UI components.
- Prioritize a polished, professional e-commerce experience.

Storefront reference: https://www.gadstyle.com

Use it as inspiration for product discovery, catalogue presentation, and overall shopping experience. Do not copy its branding or content.

## 10. Architecture and Scope Constraints

- Use a modular monolith backend.
- Keep frontend and backend independently organized within the monorepo.
- Use PostgreSQL relational modelling, with JSONB only where flexible structured data genuinely benefits from it.
- Use PostgreSQL capabilities for initial product search; no separate search engine in v1.
- No microservices.
- No Redis or message broker initially.
- No Kubernetes or unnecessary infrastructure.
- No multi-vendor, multi-branch, or multi-warehouse functionality in v1.
- Do not introduce abstractions for hypothetical requirements without a concrete need.
- Background processing and notifications should remain simple and reliable without introducing unnecessary infrastructure.

## 11. Quality Expectations

The project should demonstrate real-world engineering practices:

- Maintainable, modular, and readable code.
- Clear separation of responsibilities.
- Strong server-side validation and authorization.
- Secure authentication and payment handling.
- Transaction-safe inventory and financial operations.
- Consistent API responses and error handling.
- Meaningful automated tests, especially for business-critical logic.
- Useful logging and audit trails.
- Environment-based configuration and proper secret management.
- Reliable deployment and production-oriented configuration.

Prioritize correctness and maintainability over unnecessary complexity.

## 12. Development Approach

Build incrementally. Establish the project foundation first, then implement features in logical, independently testable phases.

Do not implement the entire platform in one step. Keep the implementation roadmap in a separate document.

Major architectural changes, scope changes, and consequential ambiguous decisions must be discussed before implementation.

The implementation agent may determine reasonable technical details within this specification, but must not silently change established business rules or project scope.a