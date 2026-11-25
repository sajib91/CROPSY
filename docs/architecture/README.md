# Architecture

The CROPSY business API uses a modular-monolith architecture with Clean Architecture layers and
DDD-lite boundaries. Each of the 20 business modules owns its own domain, application,
infrastructure, and presentation slices and is wired by a single composition root.

- [`modules.md`](modules.md) — module catalog, dependency direction, layer rules, HTTP surface,
  and boundary enforcement.
- [`decisions.md`](decisions.md) — architecture decision records.
- [`../database/design.md`](../database/design.md) — persistence design and data invariants.

The baseline product documents `user-story.md`, `SSD.md`, and `RTB.md` remain unchanged at the
repository root.
