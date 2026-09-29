# Declarative connector catalog

This directory contains versioned declarative HTTP connector **contracts**, one
`metadata.yaml` per connector type, and branded SVG icons. The publisher builds
a signed catalog Kibana fetches from the CDN.

## Layout

```text
connectors/
├── schema.json                 # contract schema (published for authors)
├── metadata.schema.json        # type-metadata schema (published for authors)
├── signing-keys/               # public Ed25519 keys only
│   ├── dev-1.pem
│   └── dev-2.pem
├── abuseipdb/
│   ├── 1.0.yaml                # contract (MAJOR.MINOR, quoted)
│   ├── 1.1.yaml
│   ├── metadata.yaml
│   └── icon.svg
└── okta/
    ├── 1.0.yaml
    ├── metadata.yaml
    └── icon.svg
```

Each connector directory must contain:

- One or more `<MAJOR.MINOR>.yaml` contract files that conform to
  [`schema.json`](./schema.json). Contracts have no `metadata` block.
- One [`metadata.yaml`](./metadata.schema.json) with display name, description,
  icon file name, license, optional docs URL and preview flag, and feature ids.
- The SVG named by `metadata.yaml` `icon`, inside the same directory.

Optional: `CHANGELOG.md` with a `## <MAJOR>.0` heading whose section contains
the word `Breaking` for every major `>= 2`.

Contracts contain only data. JavaScript and connector-specific executable code
are not accepted.

## Quoting `version`

`version` must be a **quoted string** matching `MAJOR.MINOR`, for example
`version: "1.0"`. Unquoted `version: 1.0` is parsed by YAML as the number `1`,
and `version: 1.10` as `1.1`. The build rejects a non-string version and tells
you to quote it.

The file name must equal the version: `1.0.yaml` for `version: "1.0"`. Leading
zeros are not allowed (`01.0` is rejected). There is no patch component; a fix
to `1.3` is published as `1.4`.

## Version rules (Compatible Versioning)

- The first out-of-tree version is `1.0`.
- `0.x` is allowed in the repo and on **staging**. Production builds drop `0.x`
  rows and any type metadata whose every row was dropped.
- Within a major, every version in the repo may exist; a new minor must be
  additive over the highest lower version of the same major.
- A new major must be exactly `highest major + 1` (majors are contiguous
  starting at `0` or `1`).
- A major `>= 2` requires `CHANGELOG.md` with `## N.0` and the word `Breaking`
  in that section.

Connector ids match `^\.[a-z0-9_-]+$`, equal the Kibana `actionTypeId`, and must
not start with `.declarative-`.

## Additive minor rules

A new minor of the same major must keep, versus the previous minor of that
major:

- every config property, with the same `type`, `format`, and `items` type
- every previous action and its input schema
- every previous auth type id (`auth.types[]` or legacy `auth.type`)

It may add optional properties, actions, and auth types, widen an enum, lower
`minimum` / `minLength`, or raise `maximum` / `maxLength`. It fails when a
property, action, or auth type is removed, a type changes, an enum or range
narrows, `additionalProperties` goes from `true` to `false`, or a new required
field has no `default`.

Request/response **outputs are not diffed**. That is a known gap (design-doc
open decision 6): a change that only alters the HTTP mapping can still be a
breaking runtime change and will not fail this check.

## Metadata rules

Type metadata lives in `metadata.yaml` and in the manifest `typeMetadata` map,
not in contract YAML. Compared to the previously published manifest:

- `supportedFeatureIds` may only grow
- `minimumLicense` may stay or be **lowered**. The floor is `gold` (`gold` <
  `platinum` < `enterprise`). Raising the license fails CI.
- Removing a type id from metadata fails CI
- Display name, description, docs URL, icon, and preview flag may change

The build hashes the icon. Source YAML does not record the hash.

## Manifest

`catalog.json` uses this key order:

`schemaVersion`, `catalogVersion`, `sequence`, `previousCatalogVersion`
(omitted on the first publish), `typeMetadata`, `connectors`.

- `catalogVersion` is `sha256:` of the compact JSON of the manifest with
  `catalogVersion` set to an empty string.
- File bytes are `JSON.stringify(manifest, null, 2)` plus a trailing newline.
- `sequence` is `published.sequence + 1`, or `1` when nothing is published yet.
- Rows are sorted by id, then major, then minor **ascending**. Every published
  version stays listed; there is no `active` field.
- `typeMetadata[id].icon.path` is `connectors/<name>/icons/sha256-<hex>.svg`.

Nothing is published at `connectors/v1` yet. The first production publish has
no baseline: `sequence` 1, no `previousCatalogVersion`, and no immutability or
metadata comparison against a live catalog.

## Published layout

```text
catalog.json
catalog.json.sig
schema.json
metadata.schema.json
connectors/<name>/<MAJOR.MINOR>.yaml
connectors/<name>/icons/sha256-<hex>.svg
```

`catalog.json.sig` is a detached Ed25519 signature over the exact `catalog.json`
bytes (base64 plus a newline). Public keys live in
[`signing-keys/`](./signing-keys/README.md). The private key is read from Vault
at `kv/ci-shared/workflows-library/connector-catalog-signing` (field
`private_key`). That path is a placeholder.

## Publish order

1. Immutable assets (`connectors/**`, including icons) with
   `if-generation-match=0` and a 1-year cache.
2. `catalog.json.sig` with `max-age=300`.
3. `catalog.json` with a generation check and `max-age=300`.
4. Both authoring schemas with `max-age=300`.

Because the signature and the manifest both cache for 5 minutes, a client can
briefly see a new signature with an old manifest, or the reverse. Kibana
retries; treat that skew as expected.

Published `id@version` bytes never change. Rows are never removed. Fix forward
only.

## Build locally

```sh
npm ci
npm run build:connectors
CONNECTOR_CATALOG_PUBLISHED_URL='' npm run check:connectors
```

`npm run build:connectors` is offline and needs no signing key. It writes
`dist/connectors/v1`. Default channel is `staging` (keeps `0.x`). Production:

```sh
node scripts/build-connector-catalog.mjs --channel prod
```

`npm run check:connectors` fetches
`https://workflows.elastic.co/connectors/v1/catalog.json` unless
`CONNECTOR_CATALOG_PUBLISHED_URL` is set. An empty value skips the fetch and
still builds `sequence` 1, which is what `npm run check` uses in CI.

The generator validates contracts and metadata, rejects unsafe or oversized
SVG, enforces additive minors and major justifications, and creates a
deterministic `catalogVersion`.
