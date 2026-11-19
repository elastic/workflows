#!/usr/bin/env bash
#
# Publishes the Workflow Template Library catalog to its CDN-backed GCS buckets.
#
# Usage: publish_catalog.sh [prod|staging ...]   (default: every target)
#
# Every target is served from one build of the catalog, so the CDNs cannot
# drift apart: deployments pointed at either host see the same templates.
#
# Runs on a Buildkite agent, which already has repo-scoped Vault access
# (kv/ci-shared/workflows-library/gcs-publish) via the standard agent env
# hook — no explicit `vault login` is needed. The only privileged action is
# uploading generated, public catalog files to a public, read-only bucket.
#
# See tracking issue elastic/security-team#18016.

set -euo pipefail

# No arguments publishes everywhere, prod first so a problem with another
# bucket cannot hold up the catalog customers actually read.
if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=(prod staging)
fi

# The catalog is served under a `/library/` path prefix (e.g.
# https://workflows.elastic.co/library/v1/...) so the same host/bucket can host
# other content (public schemas, managed workflows, ...) under sibling prefixes.
# `library/v1` is a real object-key prefix in the bucket, not a CDN rewrite, and
# is the same for every target — they differ only by bucket and public host.
DEST="library/v1"

# Echoes "<bucket> <cdn base>" for a target; non-zero for an unknown name.
target_config() {
  case "$1" in
    prod)
      echo "elastic-workflows-library-prod https://workflows.elastic.co/library/v1"
      ;;
    staging)
      echo "elastic-workflows-library-staging https://workflows-staging.elastic.co/library/v1"
      ;;
    *)
      return 1
      ;;
  esac
}

# Reject unknown targets before building anything or reading credentials.
for target in "${TARGETS[@]}"; do
  if ! target_config "${target}" > /dev/null; then
    echo "Unknown target '${target}' (expected 'prod' or 'staging')" >&2
    exit 1
  fi
done
echo "Publishing to: ${TARGETS[*]}"

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

# Mirror the tree with `gcloud storage rsync` (the recommended CLI; gsutil's
# rsync is deprecated and unreliable on some platforms).
# `--delete-unmatched-destination-objects` removes objects for templates deleted
# from the repo. Short TTL per the catalog cache contract: body URLs are stable
# but NOT immutable, so no `immutable` cache directive.
for target in "${TARGETS[@]}"; do
  read -r bucket cdn_base <<< "$(target_config "${target}")"

  echo "--- Publish dist/v1 → gs://${bucket}/${DEST}"
  gcloud storage rsync dist/v1 "gs://${bucket}/${DEST}" \
    --recursive \
    --delete-unmatched-destination-objects \
    --cache-control="public, max-age=300"

  # Per-target context; a shared one would overwrite the previous annotation.
  buildkite-agent annotate --style "success" --context "catalog-publish-${target}" \
    "Published to ${cdn_base}/ — verify: \`curl -s ${cdn_base}/main/catalogs/templates.json | jq '.templates[].slug'\`"
done

echo "--- Done"
