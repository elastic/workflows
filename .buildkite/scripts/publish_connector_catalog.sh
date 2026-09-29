#!/usr/bin/env bash
#
# Publishes the declarative connector catalog to its CDN-backed GCS bucket.
#
# Usage: publish_connector_catalog.sh <prod|staging>
#
# Signing private key: Vault kv/ci-shared/workflows-library/connector-catalog-signing
# field private_key (placeholder path; can change without changing the checks).

set -euo pipefail

TARGET="${1:?Usage: publish_connector_catalog.sh <prod|staging>}"
source "$(dirname "${BASH_SOURCE[0]}")/publish_common.sh"

if [[ "${PUBLISH_DRY_RUN:-}" == "1" ]]; then
  gcloud() {
    printf 'gcloud %s\n' "$*"
    if [[ "$*" == *"objects describe"* ]]; then
      echo "HTTPError 404: No such object" >&2
      return 1
    fi
    return 0
  }
  vault() {
    printf 'vault %s\n' "$*" >&2
    printf '%s\n' '-----BEGIN PRIVATE KEY-----
dry-run
-----END PRIVATE KEY-----'
  }
fi

configure_publish_target "$TARGET" "connectors/v1"

echo "--- Build declarative connector catalog"
npm ci
authenticate_gcs_publisher

publish_workspace="$(mktemp -d)"
key_file="$(mktemp)"
chmod 600 "${key_file}"
published_catalog="${publish_workspace}/published-catalog.json"
lookup_error="${publish_workspace}/catalog-lookup-error"
catalog_url="gs://${BUCKET}/${DEST}/catalog.json"
trap 'rm -rf "${publish_workspace}"; rm -f "${key_file}"; gcloud auth revoke --all 2>/dev/null || true' EXIT

published_arg="none"
if published_generation="$(
  gcloud storage objects describe "${catalog_url}" \
    --format='value(generation)' 2>"${lookup_error}"
)"; then
  gcloud storage cp "${catalog_url}" "${published_catalog}" \
    --if-generation-match="${published_generation}"
  published_arg="${published_catalog}"
else
  lookup_message="$(<"${lookup_error}")"
  if ! is_gcloud_not_found "${lookup_message}"; then
    echo "${lookup_message}" >&2
    exit 1
  fi
  echo "No published connector catalog found; treating this as the initial publication."
  published_generation=0
fi

node scripts/build-connector-catalog.mjs --published "${published_arg}" --channel "${TARGET}"
node scripts/check-published-connector-catalog.mjs --published "${published_arg}" --channel "${TARGET}"
node scripts/verify-connector-catalog-assets.mjs dist/connectors/v1/catalog.json dist/connectors/v1

fetch_signing_key_to_file "${key_file}"
node scripts/sign-connector-catalog.mjs --dist dist/connectors/v1 --key-file "${key_file}"

echo "--- Publish immutable connector definitions"
while IFS= read -r -d '' asset; do
  relative_path="${asset#dist/connectors/v1/}"
  publish_immutable_asset \
    "${asset}" \
    "gs://${BUCKET}/${DEST}/${relative_path}" \
    "public, max-age=31536000, immutable" \
    "${publish_workspace}"
done < <(find dist/connectors/v1/connectors -type f -print0)

echo "--- Activate catalog"
gcloud storage cp dist/connectors/v1/catalog.json.sig "gs://${BUCKET}/${DEST}/catalog.json.sig" \
  --cache-control="public, max-age=300"
gcloud storage cp dist/connectors/v1/catalog.json "${catalog_url}" \
  --cache-control="public, max-age=300" \
  --if-generation-match="${published_generation}"

echo "--- Publish authoring schema"
gcloud storage cp dist/connectors/v1/schema.json "gs://${BUCKET}/${DEST}/schema.json" \
  --cache-control="public, max-age=300"
gcloud storage cp dist/connectors/v1/metadata.schema.json "gs://${BUCKET}/${DEST}/metadata.schema.json" \
  --cache-control="public, max-age=300"

echo "--- Annotate build"
sequence="$(node -e 'const c=JSON.parse(require("fs").readFileSync("dist/connectors/v1/catalog.json","utf8")); process.stdout.write(String(c.sequence))')"
catalog_version="$(node -e 'const c=JSON.parse(require("fs").readFileSync("dist/connectors/v1/catalog.json","utf8")); process.stdout.write(String(c.catalogVersion))')"
buildkite-agent annotate --style "success" --context "connector-catalog-publish" \
  "Published sequence ${sequence} (${catalog_version}) to ${CDN_BASE}/ — verify: \`curl -s ${CDN_BASE}/catalog.json\`"

echo "--- Done"
