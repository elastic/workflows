#!/usr/bin/env bash
#
# Publishes the declarative connector catalog to its CDN-backed GCS bucket.
#
# Usage: publish_connector_catalog.sh <prod|staging>

set -euo pipefail

TARGET="${1:-prod}"
source "$(dirname "${BASH_SOURCE[0]}")/publish_common.sh"

configure_publish_target "$TARGET" "connectors/v1"

echo "--- Build declarative connector catalog"
npm ci
npm run build:connectors

authenticate_gcs_publisher

publish_workspace="$(mktemp -d)"
published_catalog="${publish_workspace}/published-catalog.json"
lookup_error="${publish_workspace}/catalog-lookup-error"
catalog_url="gs://${BUCKET}/${DEST}/catalog.json"
trap 'rm -rf "${publish_workspace}"; gcloud auth revoke --all 2>/dev/null || true' EXIT
if published_generation="$(
  gcloud storage objects describe "${catalog_url}" \
    --format='value(generation)' 2>"${lookup_error}"
)"; then
  gcloud storage cp "${catalog_url}" "${published_catalog}" \
    --if-generation-match="${published_generation}"
  node scripts/check-connector-catalog-immutability.mjs \
    "${published_catalog}" dist/connectors/v1/catalog.json
else
  lookup_message="$(<"${lookup_error}")"
  if ! is_gcloud_not_found "${lookup_message}"; then
    echo "${lookup_message}" >&2
    exit 1
  fi
  echo "No published connector catalog found; treating this as the initial publication."
  published_generation=0
fi

echo "--- Publish immutable connector definitions"
gcloud storage rsync dist/connectors/v1/connectors "gs://${BUCKET}/${DEST}/connectors" \
  --recursive \
  --no-clobber \
  --cache-control="public, max-age=31536000, immutable"

echo "--- Verify published connector definitions"
mkdir -p "${publish_workspace}/remote/connectors"
gcloud storage rsync \
  "gs://${BUCKET}/${DEST}/connectors" "${publish_workspace}/remote/connectors" \
  --recursive \
  --checksums-only
node scripts/verify-connector-catalog-assets.mjs \
  dist/connectors/v1/catalog.json "${publish_workspace}/remote"

echo "--- Publish schema and activate catalog"
gcloud storage cp dist/connectors/v1/schema.json "gs://${BUCKET}/${DEST}/schema.json" \
  --cache-control="public, max-age=300"
gcloud storage cp dist/connectors/v1/catalog.json "${catalog_url}" \
  --cache-control="public, max-age=300" \
  --if-generation-match="${published_generation}"

echo "--- Annotate build"
buildkite-agent annotate --style "success" --context "connector-catalog-publish" \
  "Published to ${CDN_BASE}/ — verify: \`curl -s ${CDN_BASE}/catalog.json | jq '.connectors[].id'\`"

echo "--- Done"
