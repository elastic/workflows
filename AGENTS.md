# elastic/workflows — agent instructions

This repository holds the **Workflow Template Library** content published to the CDN consumed by Kibana's Workflows app, plus a library of plain workflow examples.

## Where things are

- `library/workflows/<slug>/<slug>.yaml` — the installable **templates** (workflow YAML + `template-metadata` block).
- `library/categories.yaml` — the closed category vocabulary templates may use.
- `connectors/<name>/<version>.yaml` — versioned declarative connector definitions.
- `connectors/<name>/<version>.svg` — versioned connector icons referenced and hashed by YAML.
- `connectors/schema.json` — the declarative connector authoring contract.
- `examples/` — plain **workflow examples** (no template metadata), organized by solution and integration.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — the authoring guide for templates: metadata block, `install.form` / `__install__.*` rendering rules, style, local validation, and PR flow. **Read "Authoring a template" before creating or editing any template.**
- [`.agents/skills/create-library-template/SKILL.md`](./.agents/skills/create-library-template/SKILL.md) — agent checklist for authoring a template, with example→template migration references.
- `scripts/build-catalog.mjs` (`npm run build:catalog`) — workflow template catalog generator; usage and env-var overrides in CONTRIBUTING.md § "Validating locally".
- `scripts/build-connector-catalog.mjs` (`npm run build:connectors`) — validates and builds the connector catalog.
- `.buildkite/` — independent validation, workflow template publishing, and connector publishing pipelines.
