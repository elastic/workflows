#!/usr/bin/env bash
#
# Publishes the Workflow Template Library catalog to its CDN-backed GCS bucket.
#
# Usage: publish_catalog.sh <prod|staging>
#
# Runs on a Buildkite agent, which already has repo-scoped Vault access
# (kv/ci-shared/workflows-library/gcs-publish) via the standard agent env
# hook — no explicit `vault login` is needed. The only privileged action is
# uploading generated, public catalog files to a public, read-only bucket.
#
# See tracking issue elastic/security-team#18016.

set -euo pipefail

TARGET="${1:-prod}"
source "$(dirname "${BASH_SOURCE[0]}")/publish_common.sh"

# The catalog is served under a `/library/` path prefix (e.g.
# https://workflows.elastic.co/library/v1/...) so the same host/bucket can host
# other content (public schemas, managed workflows, ...) under sibling prefixes.
# `library/v1` is a real object-key prefix in the bucket, not a CDN rewrite.
configure_publish_target "$TARGET" "library/v1"

echo "--- Build catalog"
npm ci
npm run build:catalog

authenticate_gcs_publisher

echo "--- Publish dist/v1 → gs://${BUCKET}/${DEST}"
# Mirror the tree with `gcloud storage rsync` (the recommended CLI; gsutil's
# rsync is deprecated and unreliable on some platforms).
# `--delete-unmatched-destination-objects` removes objects for templates deleted
# from the repo. Short TTL per the catalog cache contract: body URLs are stable
# but NOT immutable, so no `immutable` cache directive.
gcloud storage rsync dist/v1 "gs://${BUCKET}/${DEST}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=300"

echo "--- Annotate build"
buildkite-agent annotate --style "success" --context "catalog-publish" \
  "Published to ${CDN_BASE}/ — verify: \`curl -s ${CDN_BASE}/main/catalogs/templates.json | jq '.templates[].slug'\`"

echo "--- Done"
