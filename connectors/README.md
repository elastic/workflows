# Declarative connector catalog

This directory contains versioned declarative HTTP connector definitions and
their branded SVG assets.

## Layout

```text
connectors/
├── schema.json
├── abuseipdb/
│   ├── 1.0.0.yaml
│   └── 1.0.0.svg
└── okta/
    ├── 1.0.0.yaml
    └── 1.0.0.svg
```

Each YAML file must:

- Conform to [`schema.json`](./schema.json).
- Use semantic versioning, with the file name matching `version`.
- Keep icon paths relative to the YAML file.
- Include the exact SHA-256 hash of the icon bytes.
- Contain only data. JavaScript and connector-specific executable code are not
  accepted.

Existing Kibana connector instances can remain pinned to published versions.
Make changes by adding a new versioned YAML and SVG pair. The publisher rejects
changes, deletions, and active-version regressions for previously published
versions. The catalog marks the highest version as active and retains every
versioned entry.

## Build locally

```sh
npm ci
npm run build:connectors
```

Output is written under `dist/connectors/v1`:

```text
catalog.json
schema.json
connectors/<name>/<version>.yaml
connectors/<name>/<version>.svg
```

The generator validates definitions, verifies icon hashes, rejects unsafe SVG
content, and creates a deterministic `catalogVersion`.

## Delivery

The connector catalog is published independently from workflow templates:

- Production: `https://workflows.elastic.co/connectors/v1/catalog.json`
- Staging: `https://workflows-staging.elastic.co/connectors/v1/catalog.json`

Air-gapped connector delivery is not part of this draft because Kibana does not
yet support loading a connector catalog from disk.

The definitions in this draft use development-only connector IDs expected by
the Kibana PoC:

- `.declarative-abuseipdb`
- `.declarative-okta`
