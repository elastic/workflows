# Connector catalog signing keys

This directory holds the **public** Ed25519 SPKI PEM keys Kibana (and this
repo's publish checks) use to verify `catalog.json.sig`.

- `dev-1.pem` and `dev-2.pem` are the two rotation slots. Kibana accepts a
  signature that verifies against either key.
- Private keys never live in this repository. The publish pipeline reads the
  signing private key from Vault at
  `kv/ci-shared/workflows-library/connector-catalog-signing` (field
  `private_key`). That path is a placeholder and can change without changing
  the checks.
- To rotate: add the new public key here, publish with the new private key,
  then remove the retired public key after Kibana builds that trust the old
  key have rolled out.
