# Contributing to the Elastic Workflow Template Library

Thanks for your interest in contributing. This document is the authoring guide for the **Workflow Template Library** that ships in Kibana (Tech Preview from 9.5). Read it before opening your first PR.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Authoring a template](#authoring-a-template)
  - [File layout](#file-layout)
  - [The `template-metadata` block](#the-template-metadata-block)
  - [Categories vocabulary](#categories-vocabulary)
  - [Install-time inputs (`install.form` + `__install__.*`)](#install-time-inputs-installform--__install__)
  - [Step types and connectors](#step-types-and-connectors)
  - [Style and idiomatic patterns](#style-and-idiomatic-patterns)
- [Validating locally](#validating-locally)
- [Versioning](#versioning)
- [Pull request flow](#pull-request-flow)
- [Code of conduct](#code-of-conduct)

---

## Ways to contribute

1. **Add a new template.** Submit a new YAML under `library/workflows/<slug>/<slug>.yaml` with a valid `template-metadata` block.
2. **Improve an existing template.** Tighten a description, fix a bug, swap a generic `http` step for a dedicated vendor step type, add helpful install-form fields.
3. **Extend the categories vocabulary.** When a new template genuinely needs a category not in `library/categories.yaml`, add the entry in the same PR.
4. **Improve documentation.** Fix unclear wording, add examples, clarify the authoring rules.
5. **Report issues.** File a GitHub issue for bugs, suggestions, or missing capabilities.

---

## Authoring a template

### File layout

Every template lives at:

```
library/workflows/<slug>/<slug>.yaml
```

- The `<slug>` directory name and the YAML file name **must match the `slug` value** inside the file's `template-metadata` block. The catalog generator enforces this.
- Slug format: kebab-case, lowercase ASCII alphanumeric + hyphens. Should be descriptive and unique across the library.
- One template per directory. Future multi-version coexistence will live as `<slug>/<slug>-v<n>.yaml` siblings, but the starter set is all v1.

### The `template-metadata` block

Top of every template file. The body that follows is regular workflow YAML grammar (`consts:`, `inputs:` / `triggers:`, `steps:`, …).

```yaml
template-metadata:
  slug: ip-reputation-check                    # MUST match parent dir name
  version: "1.0.0"                             # semver; bump on every content change
  availability: ">=9.5.0"                      # semver range over Kibana versions
  name: "IP Reputation Check (AbuseIPDB)"
  description: >-
    Assess the reputation of an IP address using AbuseIPDB and enrich
    with geolocation data. Produces a low / medium / high risk verdict.
  solutions: [security]                        # optional. absent or empty = cross-solution (every solution context)
  categories: [enrichment, threat-intel]       # closed-vocab; entries MUST exist in library/categories.yaml
  icon: abuseipdb                              # optional; references a known icon ID
  install:                                     # only required when the body uses __install__.<name>
    form:
      - name: abuseipdb-connector
        label: "AbuseIPDB connector"
        description: "The AbuseIPDB connector used to query IP reputation."
        inputType: connector
        connectorType: .abuseipdb
        required: true
```

**Required fields:** `slug`, `version`, `availability`, `name`, `description`, `categories`.
**Optional fields:** `solutions`, `icon`, `install`.

Notes on the optional fields:

- **`solutions`** — when present, an array of solution ids (e.g. `[security]`, `[security, observability]`). Absent or empty means the template is **cross-solution** and appears in every solution context.
- **`icon`** — references an icon known to the Kibana UI (e.g. `abuseipdb`, `slack`, `virustotal`). Omit if there's no obvious match yet.
- **`install`** — required if and only if the workflow body references any `__install__.<name>` placeholder. See [Install-time inputs](#install-time-inputs-installform--__install__) below.

### Categories vocabulary

`categories: [...]` is a **closed vocabulary**. Every value used in any template's `categories` array must exist as an `id` in [`library/categories.yaml`](./library/categories.yaml). The catalog generator rejects any template referencing an unknown id.

If your template genuinely needs a category that is not in the vocab, **add the entry to `library/categories.yaml` in the same PR** — never invent values used only in a template. Reviewers will either accept the new entry or point you at an existing one.

### Install-time inputs (`install.form` + `__install__.*`)

When the operator installs a template into their Kibana, the catalog UI renders an install form derived from `template-metadata.install.form`. Whatever values the user submits get substituted into the workflow body wherever it references `__install__.<name>`.

Two rules to internalize:

1. **`install.form` is the single source of truth.** Every `__install__.<name>` reference in the body MUST have a matching entry in `install.form`. The installer does not auto-derive form fields from `consts:` or anywhere else; an undeclared reference fails the install.
2. **Form field names are kebab-case by convention** (e.g. `abuseipdb-connector`, `max-age-in-days`). They are internal template identifiers and are substituted away during rendering — end users never see them in the final workflow YAML.

What belongs in the install form (vs `consts:`):

- **Promote to `install.form`** anything the operator must configure for the template to work: connector ids (always), Slack channels, recipient emails, tunable thresholds you want to expose in the install UX, environment-specific URLs.
- **Keep in `consts:`** stable, non-secret config that does not vary per installation: vendor base URLs (when the dedicated connector doesn't own them), hard-coded defaults the install UX does not need to expose.

Templates that don't need any install-time inputs **omit the `install:` block entirely**.

#### `inputType` reference

| `inputType` | Purpose | Required extras |
|---|---|---|
| `text` | Free-form short string | — |
| `textarea` | Multi-line text | — |
| `number` | Numeric input | — |
| `boolean` | Toggle | — |
| `select` | Single choice from a fixed list | `options: [{ value, label }, ...]` |
| `connector` | Picks an existing Kibana stack connector | `connectorType: .<vendor>` |

Every field can carry `label`, `description`, `required` (default `false`), and `default`.

#### Connector type rule

`install.form[].connectorType` must equal `.` + the prefix of the step type that uses it. For example:

- `abuseipdb.checkIp` → `connectorType: .abuseipdb`
- `virustotal.scanFileHash` → `connectorType: .virustotal`
- `slack2.createConversation` → `connectorType: .slack2`
- `brave-search.webSearch` → `connectorType: .brave-search`

Never use `.webhook` as a connector type; always pick the dedicated `.<vendor>` connector.

### Step types and connectors

The workflow engine's step-type registry is the source of truth — refer to the JSON schema published by `@kbn/workflows` for the canonical list.

Two rules:

1. **Prefer the dedicated vendor step type.** If a vendor has a dedicated step (e.g. `abuseipdb.checkIp`, `virustotal.scanFileHash`, `slack2.createConversation`, `brave-search.webSearch`), use it. The legacy generic `http` step is an escape hatch and should only appear when no dedicated step exists.
2. **Never invent a step type or a connector type.** If you think one is missing, file an issue rather than working around it locally.

### Style and idiomatic patterns

- **2-space YAML indentation.**
- **No `id:`, no `metadata:` (singular), no `since`/`discontinued`/`replacement` fields.** Those are obsolete shapes from earlier drafts.
- **Drop the legacy banner headers.** No `# =================== Workflow: X` block at the top, no `# CONSTANTS / # INPUTS / # TRIGGERS / # STEPS` tutorial blocks. The `template-metadata` block is the header.
- **Keep per-step comments, trimmed.** One short paragraph per step explaining intent. Avoid restating what the YAML already says.
- **Snake_case for workflow-body identifiers** (input names, step names): `ip_address`, `check_abuseipdb`, `format_results`. Kebab-case is reserved for `install.form` field names.
- **Prefer the dedicated `data.*` step types over abusing `console` for value transformation.** Use `data.parseJson`, `data.set`, etc. when you want to compute or restructure data.

---

## Validating locally

The repo ships a small Node script that walks every template, validates its `template-metadata` block, cross-checks `__install__.<name>` against `install.form`, verifies every `categories[]` entry against the vocab, and produces the per-Kibana-version catalogs the CDN serves.

```bash
npm install
npm run build:catalog
```

Run it before submitting a PR. A non-zero exit means the catalog publish would fail; the error messages point at the offending file and field.

### Env-var overrides

The script resolves the live `main` Kibana semver and the supported named minors at run time. Two env vars let you skip those network calls for fast local iteration:

| Env var | Effect |
|---|---|
| `KIBANA_MAIN_VERSION=9.6.0` | Skip the fetch of `elastic/kibana@main`'s `package.json`. |
| `KIBANA_NAMED_MINORS=""` (or `"9.5,9.6"`) | Skip the GitHub branches API. Empty string = treat as zero named minors. |
| `GITHUB_TOKEN` | When set, authenticates the branches API call (5,000/h instead of 60/h). CI provides this automatically; locally, `export GITHUB_TOKEN=$(gh auth token)` works. |

The fastest fully-offline iteration:

```bash
KIBANA_MAIN_VERSION=9.6.0 KIBANA_NAMED_MINORS="" npm run build:catalog
```

### What "valid" means

The script enforces:

- File parses with `js-yaml`.
- `template-metadata` is present with all required fields.
- `slug` matches the parent directory name.
- `version` is valid semver; `availability` is a valid semver range.
- Every `categories[]` entry exists in `library/categories.yaml`.
- Every `__install__.<name>` reference in the body has a matching `install.form` entry (and no orphan form fields).

It does **not** yet validate the workflow body against the engine's step-type schema — that runs in a sibling CI job once the validator package is published. Until then, the safest check is to install your template into a local Kibana and run it.

---

## Versioning

`template-metadata.version` is a semver. Bump it on every meaningful content change to a template body:

- **Patch** (`1.0.0 → 1.0.1`) — typo fix, comment tweak, no behaviour change.
- **Minor** (`1.0.0 → 1.1.0`) — additive behaviour, new optional install field, additional step that doesn't affect existing callers.
- **Major** (`1.0.0 → 2.0.0`) — breaking change to inputs, install form, or the workflow's observable behaviour.

`template-metadata.availability` is a semver range over Kibana versions. For now, every template carries `>=9.5.0`. When future Kibana versions retire a step type or connector convention, restrict the range accordingly (`">=9.5.0 <9.8.0"`) and ship a successor template under the same slug with a bumped major.

Multi-version coexistence (the `<slug>/<slug>-v2.yaml` sibling layout) lands in Kibana 9.6; for the 9.5 starter set, every template is v1.

---

## Pull request flow

1. **Fork** the repo and clone your fork.
2. **Branch** from `main`: `git checkout -b add/<slug>` or `fix/<slug>-<short-desc>`.
3. **Author** the template under `library/workflows/<slug>/<slug>.yaml`. Follow the rules above.
4. **Run the validator**: `npm run build:catalog` (with overrides as needed). Resolve any errors.
5. **Commit** with a clear message: `Add <slug> template` or `Fix <slug>: <what changed>`.
6. **Open a PR** with:
   - The slug and one-line description.
   - Any migration decisions worth flagging (e.g. "promoted `X` from `consts:` to install form", "swapped raw `http` for dedicated `vendor.action` step").
   - Validation output (paste the last few lines of `npm run build:catalog`).
   - A short test plan (e.g. "installed in local 9.5, ran with `ip_address=8.8.8.8`, output report rendered as expected").

A maintainer will review and either request changes or merge. Once merged, the next push to `main` republishes the catalog and the template becomes installable from the Kibana UI on every active Kibana version whose semver satisfies your `availability:` range.

---

## Code of conduct

- Be respectful and constructive in reviews.
- Focus feedback on the contribution, not the contributor.
- No real credentials, secrets, or PII committed to YAML — use install-form fields or `consts:` placeholders.
- Report concerns via GitHub Issues.

---

Thanks for contributing.
