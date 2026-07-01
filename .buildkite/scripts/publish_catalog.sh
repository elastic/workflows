#!/usr/bin/env bash
#
# Publishes the Workflow Template Library catalog to its CDN-backed GCS bucket.
#
# Usage: publish_catalog.sh <prod|staging>
#
# Runs on a Buildkite agent, which already has repo-scoped Vault access
# (secret/ci/elastic-workflows/*) via the standard agent env hook — no explicit
# `vault login` is needed. The only privileged action is uploading generated,
# public catalog files to a public, read-only bucket.
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
    ;;
  staging)
    # Staging is for maintainer-pushed branches only (fork PRs are not built on
    # public repos). Published at the same path; a maintainer branch overwrites
    # the previous staging preview.
    BUCKET="elastic-workflows-library-staging"
    DEST="library/v1"
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
# TODO(eng-prod): confirm the exact repo-scoped path + field where the
# bekitzur-workflows service-account key lands (see elastic/security-team#18016).
VAULT_SECRET_PATH="secret/ci/elastic-workflows/gcs-publish"
VAULT_FIELD="credentials"
GCS_SA_KEY="$(retry 5 5 vault read -field="${VAULT_FIELD}" "${VAULT_SECRET_PATH}")"

echo "--- Authenticate to GCP"
set +x  # never echo the service-account key
gcloud auth activate-service-account --key-file <(echo "${GCS_SA_KEY}")

echo "--- Publish dist/v1 → gs://${BUCKET}/${DEST}"
# `rsync -d` mirrors the tree (deletes objects for templates removed from the
# repo). Uniform short TTL + ETag revalidation per the catalog cache contract:
# body URLs are stable but NOT immutable, so no `immutable` header.
gsutil -m -h "Cache-Control:public, max-age=300" rsync -d -r dist/v1 "gs://${BUCKET}/${DEST}"

echo "--- Done"
