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

# The catalog is served under a `/library/` path prefix (e.g.
# https://workflows.elastic.co/library/v1/...) so the same host/bucket can host
# other content (public schemas, managed workflows, ...) under sibling prefixes.
# `library/v1` is a real object-key prefix in the bucket, not a CDN rewrite.
case "$TARGET" in
  prod)
    BUCKET="elastic-workflows-library-prod"
    DEST="library/v1"
    CDN_BASE="https://workflows.elastic.co/library/v1"
    ;;
  staging)
    # Staging is for maintainer-pushed branches only (fork PRs are not built on
    # public repos). Published at the same path; a maintainer branch overwrites
    # the previous staging preview.
    BUCKET="elastic-workflows-library-staging"
    DEST="library/v1"
    CDN_BASE="https://workflows-staging.elastic.co/library/v1"
    ;;
  *)
    echo "Unknown target '${TARGET}' (expected 'prod' or 'staging')" >&2
    exit 1
    ;;
esac

# Vault is a network service; the CI docs recommend retrying its CLI calls.
retry() {
  local attempts=$1; shift
  local delay=$1; shift
  local n=1
  until "$@"; do
    local rc=$?
    if (( n >= attempts )); then return "$rc"; fi
    echo "Retry ${n}/$((attempts - 1)) after failure (rc=${rc}); sleeping ${delay}s" >&2
    sleep "$delay"
    n=$((n + 1))
  done
}

echo "--- Build catalog"
npm ci
npm run build:catalog

echo "--- Fetch GCS publisher credentials from Vault"
# Repo-scoped CI secret, provisioned as a KV2Path resource in Terrazzo
# (see elastic/security-team#18016). KV v2 → read with `vault kv get`.
VAULT_SECRET_PATH="kv/ci-shared/workflows-library/gcs-publish"
VAULT_FIELD="credentials"
GCS_SA_KEY="$(retry 5 5 vault kv get -field="${VAULT_FIELD}" "${VAULT_SECRET_PATH}")"
if [[ -z "${GCS_SA_KEY}" ]]; then
  echo "Vault returned empty GCS credentials (${VAULT_SECRET_PATH}, field ${VAULT_FIELD})" >&2
  exit 1
fi

echo "--- Authenticate to GCP"
set +x  # defensive: make sure the service-account key is never traced
# Revoke the activated credentials when the script exits, even on failure.
trap 'gcloud auth revoke --all 2>/dev/null || true' EXIT
gcloud auth activate-service-account --key-file <(echo "${GCS_SA_KEY}")

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
