<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt5d10f3a91df97d15/620a9ac8849cd422f315b83d/logo-elastic-vertical-reverse.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt36f2da8d650732a0/620a9ac8849cd4798f4a12c0/logo-elastic-vertical-color.svg">
    <img alt="Elastic Logo" src="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt36f2da8d650732a0/620a9ac8849cd4798f4a12c0/logo-elastic-vertical-color.svg" height="80">
  </picture>
</p>

<h1 align="center">Elastic Workflow Template Library</h1>

<p align="center">
  Source repo for the Workflow Template Library that ships in Kibana.
</p>

<!-- Navigation Tabs -->
<p align="center">
  <a href="#overview"><img src="https://img.shields.io/badge/📖_README-2D2D2D?style=for-the-badge" alt="README"></a>&nbsp;
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/👥_Contributing-2D2D2D?style=for-the-badge" alt="Contributing"></a>&nbsp;
  <a href="./LICENSE.txt"><img src="https://img.shields.io/badge/⚖️_License-2D2D2D?style=for-the-badge" alt="License"></a>&nbsp;
</p>

<!-- Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/Kibana-9.5+-00BFB3?style=flat-square&logo=elastic&logoColor=white" alt="Kibana 9.5+">&nbsp;
  <img src="https://img.shields.io/badge/Tech_Preview-FFA500?style=flat-square" alt="Tech Preview">&nbsp;
  <img src="https://img.shields.io/badge/YAML-CB171E?style=flat-square&logo=yaml&logoColor=white" alt="YAML">&nbsp;
  <img src="https://img.shields.io/badge/License-Apache_2.0-D16C00?style=flat-square" alt="Apache 2.0">&nbsp;
  <a href="https://ela.st/slack"><img src="https://img.shields.io/badge/Slack-%23workflows-4A154B?style=flat-square&logo=slack&logoColor=white" alt="Slack"></a>
</p>

---

## Overview

This repo holds the source of the **Workflow Template Library** — a curated catalogue of installable, parameterised workflow templates that Kibana users browse and install from the Workflows app.

Each template is a YAML file that combines:

- A `template-metadata` header describing the template to Kibana (name, description, version, supported Kibana versions, categories, optional install form).
- A standard workflow body (`consts:`, `inputs:` / `triggers:`, `steps:`) that runs once installed.

The build pipeline in this repo turns the source templates into per-Kibana-version catalogues and uploads them to a CDN. Kibana fetches the catalogue at install time, renders the install form, substitutes the operator's values, and persists the resulting workflow as a Kibana saved object.

---

## Repository structure

```
elastic/workflows/
├── library/
│   ├── workflows/                          # one directory per template, slug-matched
│   │   ├── ip-reputation-check/
│   │   │   └── ip-reputation-check.yaml
│   │   └── …
│   └── categories.yaml                     # closed-vocab category registry
├── kibana-versions.json                    # policy file (latest, oldest, cataloguePer)
├── scripts/
│   └── build-catalog.mjs                   # catalogue generator (Node 20+, ESM)
├── docs/
│   ├── concepts.md                         # workflow engine concepts
│   ├── schema.md                           # workflow YAML schema reference
│   └── importing.md                        # raw-YAML import paths (for local dev)
├── CONTRIBUTING.md                         # template authoring guide
├── package.json
└── README.md
```

`library/` is the source. `dist/v1/` is the build output (gitignored; produced by `npm run build:catalog`).

---

## Template format

A minimal example:

```yaml
template-metadata:
  slug: ip-reputation-check
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "IP Reputation Check (AbuseIPDB)"
  description: "Assess the reputation of an IP address using AbuseIPDB."
  solutions: [security]                     # optional; omit for cross-solution
  categories: [enrichment, threat-intel]    # closed vocab; entries from library/categories.yaml
  install:                                  # only when the body uses __install__.<name>
    form:
      - name: abuseipdb-connector
        label: "AbuseIPDB connector"
        inputType: connector
        connectorType: .abuseipdb
        required: true

name: IP Reputation Check
description: Check IP reputation via AbuseIPDB.

triggers:
  - type: manual
    inputs:
      - name: ip_address
        type: string
        required: true

steps:
  - name: check_abuseipdb
    type: abuseipdb.checkIp
    connector-id: __install__.abuseipdb-connector
    with:
      ipAddress: "{{ inputs.ip_address }}"
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full authoring guide — required vs optional fields, the `install.form` discipline, categories vocabulary rules, step-type conventions, versioning, and local validation.

---

## Integration with Kibana

In Kibana 9.5+ (Tech Preview), the Workflows app reads the published catalogue from the CDN and renders a browser of installable templates. Installing a template prompts the operator for the values declared in `install.form`, substitutes them for the `__install__.<name>` placeholders in the body, and persists the resulting workflow as a saved object — at which point it runs like any other workflow.

Consumers see:

- `/v1/kibana-versions.json` — the resolved list of available catalogues.
- `/v1/<version>/catalogs/templates.json` — the catalogue rows for a given Kibana version. Each row carries the template metadata plus generator-derived `stepTypes` / `triggerTypes`, which the Library UI uses to render step and trigger icons.
- `/v1/templates/<slug>/<version>.yaml` — version-keyed template bodies. The URL for a given `(slug, version)` is stable, but the bytes may be republished in place to ship a fix, so they are not treated as immutable.

The catalogue is republished on every merge to `main`.

---

## Building the catalogue locally

```bash
npm install
npm run build:catalog
```

Outputs to `dist/v1/`. The script fetches the live Kibana `main` semver and the list of supported named minors from `elastic/kibana`. For offline iteration, two env-var overrides skip the network calls — see the [Validating locally](./CONTRIBUTING.md#validating-locally) section of CONTRIBUTING.md.

---

## Further reading

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to author or modify a template.
- [docs/concepts.md](./docs/concepts.md) — workflow engine concepts (triggers, steps, variables, Liquid, error handling).
- [docs/schema.md](./docs/schema.md) — workflow YAML schema reference.
- [docs/importing.md](./docs/importing.md) — raw-YAML import paths (Kibana UI / API / bulk), useful for local development before a template ships through the library.

---

## License

Apache 2.0 — see [LICENSE.txt](./LICENSE.txt).
