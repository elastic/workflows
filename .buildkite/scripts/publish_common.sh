#!/usr/bin/env bash

configure_publish_target() {
  local target=$1
  DEST=$2
  case "$target" in
    prod)
      BUCKET="elastic-workflows-library-prod"
      CDN_BASE="https://workflows.elastic.co/${DEST}"
      ;;
    staging)
      BUCKET="elastic-workflows-library-staging"
      CDN_BASE="https://workflows-staging.elastic.co/${DEST}"
      ;;
    *)
      echo "Unknown target '${target}' (expected 'prod' or 'staging')" >&2
      exit 1
      ;;
  esac
}

retry() {
  local attempts=$1
  shift
  local delay=$1
  shift
  local n=1
  until "$@"; do
    local rc=$?
    if ((n >= attempts)); then return "$rc"; fi
    echo "Retry ${n}/$((attempts - 1)) after failure (rc=${rc}); sleeping ${delay}s" >&2
    sleep "$delay"
    n=$((n + 1))
  done
}

is_gcloud_not_found() {
  local message=$1
  [[ "${message}" == *"HTTPError 404"* ||
    "${message}" == *"The following URLs matched no objects or files:"* ]]
}

authenticate_gcs_publisher() {
  echo "--- Fetch GCS publisher credentials from Vault"
  local secret_path="kv/ci-shared/workflows-library/gcs-publish"
  local service_account_key
  service_account_key="$(retry 5 5 vault kv get -field=credentials "${secret_path}")"
  if [[ -z "${service_account_key}" ]]; then
    echo "Vault returned empty GCS credentials (${secret_path}, field credentials)" >&2
    exit 1
  fi

  echo "--- Authenticate to GCP"
  set +x
  trap 'gcloud auth revoke --all 2>/dev/null || true' EXIT
  gcloud auth activate-service-account --key-file <(echo "${service_account_key}")
}
