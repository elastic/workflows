# elastic/workflows — agent instructions

This repository holds the **Workflow Template Library** content published to the CDN consumed by Kibana's Workflows app, plus a library of plain workflow examples.

## Where things are

- `library/workflows/<slug>/<slug>.yaml` — the installable **templates** (workflow YAML + `template-metadata` block).
- `library/categories.yaml` — the closed category vocabulary templates may use.
- `examples/` — plain **workflow examples** (no template metadata), organized by solution and integration.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — the authoring guide for templates: metadata block, `install.form` / `__install__.*` rendering rules, style, local validation, and PR flow. **Read "Authoring a template" before creating or editing any template.**
- [`.agents/skills/create-library-template/SKILL.md`](./.agents/skills/create-library-template/SKILL.md) — agent checklist for authoring a template, with example→template migration references.
- `scripts/build-catalog.mjs` (`npm run build:catalog`) — catalog generator and the only local validation available today; usage and env-var overrides in CONTRIBUTING.md § "Validating locally".
- `.buildkite/` — the (pending) catalog publish pipeline.
