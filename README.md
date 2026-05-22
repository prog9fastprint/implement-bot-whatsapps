# AI WhatsApp Chatbot — Prompt System Index

> **Purpose**: This prompt system guides an AI (or developer) to build a production-ready WhatsApp AI chatbot using only official Meta APIs.
> **How to use**: Load files in order. Each file is self-contained but references the others. Start with `00-context.md`, then follow the numbered steps.

---

## File Structure

```
plan-implement-whatsapps-bot/
├── README.md                      ← You are here (index + navigation)
├── walkthrough.md                 ← Consolidated project walkthrough
└── docs/
    ├── 01-core/
    │   ├── 00-context.md          ← Role, rules, and constraints
    │   └── 02-tech-stack.md       ← All technologies and why
    ├── 02-design/
    │   ├── 01-architecture.md     ← System architecture overview
    │   └── 03-database-schema.md  ← PostgreSQL schemas and relationships
    ├── 03-specifications/
    │   ├── 04-api-contracts.md    ← WhatsApp Cloud API requirements
    │   ├── 05-features.md         ← Full feature specifications
    │   └── 06-security.md         ← Security requirements
    ├── 04-operations/
    │   └── 07-deployment.md       ← Docker, PM2, Nginx, VPS
    └── 05-roadmap/
        └── 08-step-by-step-plan.md ← Ordered 21-step build guide
```

---

## Quick Reference

| File | What It Covers |
|------|---------------|
| [walkthrough.md](walkthrough.md) | **Start Here**: Consolidated project overview & current status |
| [docs/01-core/00-context.md](docs/01-core/00-context.md) | AI role, non-negotiable rules, output format |
| [docs/02-design/01-architecture.md](docs/02-design/01-architecture.md) | System diagram, component responsibilities |
| [docs/01-core/02-tech-stack.md](docs/01-core/02-tech-stack.md) | Each technology, version, and reason for inclusion |
| [docs/02-design/03-database-schema.md](docs/02-design/03-database-schema.md) | All tables, columns, types, and FK relationships |
| [docs/03-specifications/04-api-contracts.md](docs/03-specifications/04-api-contracts.md) | WhatsApp webhook, message sending, media APIs |
| [docs/03-specifications/05-features.md](docs/03-specifications/05-features.md) | Memory, stock, orders, complaints, voice, image, RAG |
| [docs/03-specifications/06-security.md](docs/03-specifications/06-security.md) | Rate limiting, validation, secrets management |
| [docs/04-operations/07-deployment.md](docs/04-operations/07-deployment.md) | Production deployment procedures |
| [docs/05-roadmap/08-step-by-step-plan.md](docs/05-roadmap/08-step-by-step-plan.md) | Step 1–21 build sequence with acceptance criteria |

---

## Critical Constraints (Always Active)

- ❌ **NEVER** use Baileys or any unofficial WhatsApp library
- ❌ **NEVER** hallucinate real-time data (stock, orders, prices)
- ❌ **NEVER** skip a step or provide pseudo-code
- ✅ **ALWAYS** use the official WhatsApp Cloud API from Meta
- ✅ **ALWAYS** provide complete, working, production-ready code
- ✅ **ALWAYS** use ES Modules and async/await
- ✅ **ALWAYS** include exact filenames and folder structures
