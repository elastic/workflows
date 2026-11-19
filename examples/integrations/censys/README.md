# Integrations > Censys

Censys threat intelligence enrichment workflows for Security alerts

## Workflows (6)

| Workflow | Description |
|----------|-------------|
| [Censys Host Enrichment](./host-enrichment.yaml) | Enrich alert IP fields (host.ip, source.ip, destination.ip) with Censys host data, write results back to `censys.host_enrichment.*` on the alert document, and add a summary note per enriched IP. |
| [Censys Web Property Enrichment](./web-property-enrichment.yaml) | Enrich alert (hostname/IP, port) pairs derived from url.domain/url.port, destination.domain/destination.ip + destination.port, and source.ip + source.port with Censys web property data, write results back to `censys.webproperty_enrichment.*` on the alert document, and add a summary note per enriched field. |
| [Censys Certificate Enrichment](./certificate-enrichment.yaml) | Enrich alert TLS fingerprints (tls.server.hash.sha256, tls.client.hash.sha256) with Censys certificate data, write results back to `censys.certificate_enrichment.*` on the alert document, and add a summary note per fingerprint. |
| [Censys Host History](./host-history.yaml) | Retrieve the Censys scan timeline for a host over a configurable time window and attach it as a Kibana alert note (timeline data is note-only, no alert document fields are written); includes a human-in-the-loop review step on alert triggers. |
| [Censys Rescan](./rescan.yaml) | Submit a host service or web property for a fresh Censys scan, poll until complete, refetch the updated record into `censys.rescanned_host.*` (service) or `censys.rescanned_webproperty.*` (web property) on the alert document, and add a rescan summary note (manual trigger only). |
| [Censys Related Infrastructure](./related-infrastructure.yaml) | Pivot-hunt related infrastructure via the Censys Censeye API for a single target (IP, certificate SHA-256, or web property), write normalized pivots to `censys.related_infrastructure.*` on the alert document, and attach a summary note with the results. |

## Prerequisites

- **Enterprise license** — The Censys connector requires an Enterprise Kibana license (`minimumLicense: enterprise`).
- **Censys connector** — A `.censys` connector must be configured in Kibana with valid Censys Platform credentials. Set `consts.connector_id` in each workflow to your connector's ID.
- **Elasticsearch write access** — The service account running these workflows needs write permission to the alert indices used by the `elasticsearch.update` write-back steps.
- **Threat Hunting entitlement** *(Censys Related Infrastructure only)* — The Censeye Related Infrastructure workflow additionally requires Threat Hunting (Adversary Investigation) access on the Censys organization. Without it the Censeye job submission will fail.

## Usage Notes

- **Run per alert** — When attaching any alert-triggered workflow as a Kibana rule action, enable the **"Run per alert"** toggle. All workflows read `event.alerts[0]`, so without this toggle only the first alert in a batch is processed.
- **Host enrichment endpoint fallback** — Host enrichment workflows use `consts.use_host_enrichment` (default: `true`) to prefer the SOC-optimized [`censys.getHostEnrichment`](https://docs.censys.com/docs/host-enrichment) endpoint, which is **credit-free** and designed for high-volume automated lookups. If the Censys credentials do not have access to that endpoint, the workflow automatically falls back to the standard `censys.getHost` API (which does consume credits). Set `consts.use_host_enrichment: false` to always use `getHost` and skip the enrichment endpoint entirely.
- **Manual trigger fallback** — All workflows except Censys Rescan support both manual and alert triggers. On manual runs without `inputs.alert_index` and `inputs.alert_id`, results are logged to the workflow console instead of written back to the alert document.
- **Rescan is manual-only** — Censys Rescan does not support alert triggers. Use it to interactively request a fresh scan for a specific host service (`service`) or web property (`webproperty`) via the `inputs.type` selector.

## Known Limitations

- **Host History human-in-the-loop review panel** — The `waitForInput` step in `host-history.yaml` displays a review panel before calling Censys. Until [elastic/kibana#276414](https://github.com/elastic/kibana/pull/276414) merges, dynamic values (IP, time window) will not be interpolated in the review panel message. The workflow still runs correctly; the analyst just sees the raw variable references rather than their resolved values.
