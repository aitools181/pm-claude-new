# ADR 0001 — Modular Monolith First

## Status
Accepted (Phase 0)

## Context
The product spans 24 modules but must ship a stable V1 with a small footprint
and strong data-integrity guarantees. Premature microservices would add
operational cost and cross-service consistency problems.

## Decision
Build a single coordinated, versioned NestJS application with clearly bounded
modules and explicit dependency rules. API and Worker run as separate processes
of the *same* codebase. Microservices are deferred until a proven scaling need.

## Consequences
- Simple transactions and referential integrity via one PostgreSQL database.
- Module boundaries enforced by lint import rules, not network calls.
- Revisit only when a specific module has an independent scaling/deploy need.
