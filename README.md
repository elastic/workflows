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

The repository also contains a separate declarative connector catalog. Connector
definitions and icons are versioned, validated, and published independently so a
connector change does not require rebuilding or deploying Kibana.

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
├── connectors/
│   ├── schema.json                         # declarative connector schema
│   ├── abuseipdb/                          # versioned YAML and SVG assets
│   └── okta/
├── kibana-versions.json                    # policy file (latest, oldest, cataloguePer)
├── scripts/
│   ├── build-catalog.mjs                   # catalogue generator (Node 20+, ESM)
│   └── build-connector-catalog.mjs         # connector catalogue generator
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

Consumers see (all served under a `/library/` path prefix, leaving room for other content on the same host):

- `/library/v1/kibana-versions.json` — the resolved list of available catalogues.
- `/library/v1/<version>/catalogs/templates.json` — the catalogue rows for a given Kibana version.
- `/library/v1/templates/<slug>/<version>.yaml` — immutable, version-keyed template bodies.

Declarative connector consumers use:

- `/connectors/v1/catalog.json` — active-version pointers plus every published definition hash.
- `/connectors/v1/schema.json` — the authoring contract.
- `/connectors/v1/connectors/<name>/<version>.yaml` — immutable connector definitions.
- `/connectors/v1/connectors/<name>/<version>.svg` — versioned connector icons.

Workflow templates and connectors have independent Buildkite publishers with
path filters. A merge republishes only the catalog whose sources changed.

---

## Air-gapped deployments

Kibana instances that cannot reach the CDN read the workflow template catalogue from disk. Each [release](https://github.com/elastic/workflows/releases) carries a `workflows-library-<tag>.tar.gz` asset — a snapshot of the `/v1` tree published to the CDN — plus a `.sha256` sidecar to verify the download.

```bash
sha256sum -c workflows-library-<tag>.tar.gz.sha256
tar -xzf workflows-library-<tag>.tar.gz -C /path/to/workflows-library
```

Point Kibana at the extracted directory in `kibana.yml`:

```yaml
workflowsManagement.library.bundlePath: /path/to/workflows-library
```

`bundlePath` is mutually exclusive with `registryUrl` — setting both fails config validation. The bundle is read once at startup, so replacing the directory takes effect on the next Kibana restart.

Declarative connectors still require an HTTP registry. Connector air-gap loading
is not part of this draft.

[`publish-bundle.yml`](./.github/workflows/publish-bundle.yml) cuts a bundle whenever the set of Kibana versions in the catalogue changes: a new minor branch appears in `elastic/kibana`, or the version declared in `main`'s `package.json` moves to the next minor. Both happen when a release branches, so every bundle carries an exact catalogue for every version current at the time. A weekly check compares against the previous release and does nothing when the version set is unchanged.

Because that trigger tracks Kibana versions rather than template content, a bundle can lag behind recently merged templates. Maintainers can cut one at any time by running the workflow manually (**Actions → Publish air-gap bundle → Run workflow**) or by pushing a `v*` tag.

---

## Building the catalogue locally

```bash
npm install
npm run build:catalog
npm run build:connectors
```

Workflow templates output to `dist/v1/`. Declarative connectors output to
`dist/connectors/v1/`. The workflow script fetches the live Kibana `main` semver
and the list of supported named minors from `elastic/kibana`. For offline
iteration, two env-var overrides skip those network calls. See
[Validating locally](./CONTRIBUTING.md#validating-locally) and the
[connector catalog guide](./connectors/README.md).

---

## Further reading

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to author or modify a template.
- [docs/concepts.md](./docs/concepts.md) — workflow engine concepts (triggers, steps, variables, Liquid, error handling).
- [docs/schema.md](./docs/schema.md) — workflow YAML schema reference.
- [docs/importing.md](./docs/importing.md) — raw-YAML import paths (Kibana UI / API / bulk), useful for local development before a template ships through the library.

---

## License

Apache 2.0 — see [LICENSE.txt](./LICENSE.txt).
