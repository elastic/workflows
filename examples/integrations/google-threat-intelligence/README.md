# Integrations > Google Threat Intelligence

Google Threat Intelligence enrichment workflows for Elastic Security.

## Workflows (12)

| Workflow | Description |
|----------|-------------|
| [GTI MITRE ATT&CK Techniques](./gti-mitre-attack-techniques.yaml) | Retrieve the MITRE ATT&CK tactics and techniques GTI observed for a file hash, grouped by sandbox. Indexes the full response and summarises it on the triggering alert. |
| [GTI File Sandbox Behaviour](./gti-file-sandbox-behaviour.yaml) | Retrieve GTI sandbox detonation reports for a file hash, paging until GTI has no more to give. Indexes every report as its own document and summarises the whole fetched batch on the triggering alert, one heading per report. |
| [GTI IP Address Report](./gti-ip-address-report.yaml) | Retrieve the GTI reputation and detection report for an IP address (verdict, threat score, last analysis stats, network ownership, geolocation, tags). Indexes the full response and summarises it on the triggering alert. No pagination, same shape as MITRE ATT&CK Techniques. |
| [GTI IP Address Relationships](./gti-ip-address-relationships.yaml) | Retrieve objects related to an IP address by relationship type (e.g. communicating files, historical resolutions, hosted URLs). Indexes every related object as its own document and summarises the fetched page on the triggering alert. Manual only - no detection-rule trigger. |
| [GTI Domain Report](./gti-domain-report.yaml) | Retrieve the GTI reputation and detection report for a domain name (verdict, threat score, last analysis stats, registrar/WHOIS, categorisation, popularity ranks, tags). Indexes the full response and summarises it on the triggering alert. No pagination, same shape as IP Address Report. |
| [GTI Domain Relationships](./gti-domain-relationships.yaml) | Retrieve objects related to a domain name by relationship type (e.g. subdomains, historical resolutions, communicating files - 30 relationship values, the largest enum after File Hash Relationships). Indexes every related object as its own document and summarises the fetched batch on the triggering alert. Manual only. |
| [GTI File Hash Report](./gti-file-hash-report.yaml) | Retrieve the GTI reputation and detection report for a file by hash (verdict, threat score, popular threat classification, file type metadata, signature info, tags). A different action from File Sandbox Behaviour (sandbox detonation) and MITRE ATT&CK Techniques (technique tree) - this one is the reputation report, the file-hash equivalent of IP Address Report / Domain Report. |
| [GTI File Hash Relationships](./gti-file-hash-relationships.yaml) | Retrieve objects related to a file by relationship type (e.g. contacted domains, dropped files, sandbox behaviours - 49 relationship values, by far the largest of the four GTI relationship actions). Indexes every related object as its own document and summarises the fetched batch on the triggering alert. Manual only. |
| [GTI URL Report](./gti-url-report.yaml) | Retrieve the GTI reputation and detection report for a URL (verdict, threat score, last analysis stats, final resolved destination, HTTP response metadata, categorisation, tags). Indexes the full response and summarises it on the triggering alert. No pagination, same shape as the other three report workflows. |
| [GTI URL Relationships](./gti-url-relationships.yaml) | Retrieve objects related to a URL by relationship type (e.g. redirects, contacted domains, downloaded files - 31 relationship values). Indexes every related object as its own document and summarises the fetched batch on the triggering alert. Manual only. |
| [GTI URL Scan (Public)](./gti-url-scan-public.yaml) | Submit a URL to GTI for public analysis, poll until the scan completes, then retrieve and index the full report. Unlike the report/relationship workflows above, this one submits new content to GTI rather than reading an already-computed verdict, so it chains three actions (submit, poll, retrieve) in one execution instead of one lookup. Public sibling of GTI URL Scan (Private) below - same pipeline, but a fresh scan's multi-engine stats are populated immediately (unlike private) and the note links to GTI's real public GUI page. |
| [GTI URL Scan (Private)](./gti-url-scan-private.yaml) | Submit a URL to GTI for private analysis (not shared with the wider GTI community), poll until the scan completes, then retrieve and index the full report. Unlike every other workflow above, this one submits new content to GTI rather than reading an already-computed verdict, so it chains three actions (submit, poll, retrieve) in one execution instead of one lookup. Summarises the result on the triggering alert. |

## Prerequisites

| Requirement | Detail |
|---|---|
| Elastic Stack | 9.6.0 or later |
| Elastic license | Enterprise |
| GTI subscription | Enterprise. The connector's Test action fails with a clear message on a lower tier, because `gti_assessment` is absent from responses. |
| Connector | A configured **Google Threat Intelligence** connector (`.google_threat_intelligence`). Set `consts.gti_connector_id` in each workflow to its id. **As of this writing the connector itself ships only on the `google_threat_intelligence-connector` Kibana branch, not on `main` and not in any released build.** These workflows will fail at the connector-resolution step on a stock Kibana instance until that connector PR merges. Do not treat "Kibana 9.6.0" alone as the compatibility bar; the real bar is "Kibana 9.6.0 with that connector merged," which is why this line calls it out separately from the Elastic Stack row above. |

## Kibana privileges

The user or API key running these workflows needs:

- **Analytics > Workflows**: `All` to create and run, `Read` to view
- **Security > Alerts**: read on the alert indices to fetch the observable, and write for the tag step
- **Security > Notes**: `notes_read` and `notes_write`. Both are used: read to find a previous note so a re-run replaces it rather than stacking a second copy, write to save it.
- **Index privileges**: `write` on `gti-soar-*`

## Setup

### 1. Data view for the note's Discover link (automatic, no action needed)

Each workflow finds or creates its own data view, one per destination index (id and title both equal
`consts.index`, e.g. `gti-soar-mitre-attack`), the first time it runs with an alert to annotate. A
standalone run (no alert) never touches this, since there is no note to link from.

Creation can fail on a role that has everything else this workflow needs but not
`indexPatterns:manage`, a normal and expected privilege split, not a bug. When that happens the note
falls back to printing the index and document id as plain text instead of linking with a broken or
missing data view segment. Either way the workflow keeps working; only the note's presentation changes.

If you would rather pre-create the data view yourself (e.g. to control its name, or because the role
running the workflow will never have `indexPatterns:manage`), do it once per space per workflow:

```
POST kbn:/api/data_views/data_view
{
  "data_view": {
    "id": "gti-soar-mitre-attack",
    "title": "gti-soar-mitre-attack",
    "name": "gti-soar-mitre-attack",
    "timeFieldName": "@timestamp",
    "allowNoIndex": true
  }
}
```

### 2. Index template (automatic, no action needed)

Every workflow self-provisions its own index template as its own first step (`bootstrap_index_template`,
`type: elasticsearch.request`, `PUT _index_template/<its own index name>`), every run. There is nothing to
run by hand before the first real execution - this replaced an earlier design that required an operator to
apply a shared template manually, which this project's own dev instance proved unreliable: indices created
before that manual step was run (or before the template existed at all) silently never picked up its
settings, invisible until their raw `_settings` were checked directly.

Each workflow's template sets, on its own index only:

```json
{
  "index.mapping.total_fields.limit": 2000,
  "index.mapping.total_fields.ignore_dynamic_beyond_limit": true,
  "index.mapping.ignore_malformed": true
}
```

This is not a theoretical safety valve:

- `getIpReport`'s response for a heavily-annotated address (`rdap`, `last_https_certificate`,
  `gti_assessment.gti_description_cards`) pushed `gti-soar-ip-report` past the default 1000-field limit
  and failed the index step until `total_fields.limit`/`ignore_dynamic_beyond_limit` were applied.
- `getDomainReport` and `getUrlReport` both carry vendor-name-keyed maps (`categories`,
  `popularity_ranks`) - every new vendor GTI aggregates adds a new field path under the raw `gti.*` dump.
- `gti-soar-ip-relationship` shares one index across GTI's 22 relationship object types, and genuinely
  collides on the same field path with an incompatible value type across some of them (confirmed live:
  `attributes.threat_severity.version` is a number on file-family objects, the string `"U3"` on url
  objects). `ignore_malformed` absorbs this by dropping just the losing field into `_ignored` for that one
  document rather than rejecting it outright - a deliberate trade-off over marking the whole `gti` field
  `enabled: false`, which would guarantee safety against a harder (object-vs-scalar) collision not yet
  observed in 18 of the 22 relationship types, at the cost of losing search/aggregation on every field
  under `gti` for every item, colliding or not.

**This can only protect an index that does not exist yet at the moment a workflow first runs against it**
- an index template only takes effect at index-creation time, never retroactively. If you already have a
`gti-soar-*` index from before this existed (check with `GET <index>/_settings`),
`total_fields.limit`/`ignore_dynamic_beyond_limit` can be added to it directly (`PUT <index>/_settings`),
but `ignore_malformed` needs `?reopen=true` on that same settings call (a brief close/reopen), and any
mapping override needs the index recreated (or a proper reindex-and-repoint if it already holds real data
you can't lose).

Do not rename these indices to `logs-gti-*`. That pattern is claimed by the built-in `logs` template, which creates data streams only, so a plain index write is refused outright.

## Running the workflows

Each workflow supports three paths, and the body is identical across them - **except the four
relationship workflows (IP Address, Domain, File Hash, URL), which support only the last two.** Each
declares `triggers: [manual]` with no `alert` trigger at all, since a relationship response can be far
larger than any other action's, and there is no relationship worth choosing automatically on every alert.

| Path | How it starts | What it writes | Supported by |
|---|---|---|---|
| Detection rule | Rule action using the `.workflows` connector | Index, alert note, alert tag | MITRE ATT&CK Techniques, File Sandbox Behaviour, IP Address Report, Domain Report, File Hash Report, URL Report |
| Manual against an alert | **Run workflow** from the alert table or flyout, or supply `alert_index` and `alert_id` | Index, alert note, alert tag | All ten |
| Manual, standalone | Workflows app, supplying the observable directly | Index only | All ten |

Turn on **Run per alert** on the `.workflows` connector when using a rule action. In summary mode the alert batch arrives together and the workflow processes only the observables of the alerts in that batch.

### Choosing which alert fields are read

Each workflow reads observables from the alert fields listed in `consts.observable_fields`, resolved by dotted path at run time. We have provided some default example fields - please update them according to your own needs. Add or remove entries there and no step needs editing:

```yaml
consts:
  observable_fields: ["file.hash.sha256", "process.hash.sha256", "dll.hash.sha256"]
```

Values that repeat across fields are enriched once. On the three file-hash workflows (MITRE ATT&CK
Techniques, File Sandbox Behaviour, File Hash Report), a value that is not a valid hash length (32/40/64
hex characters) is skipped, because the connector validates `fileHash` against a SHA-256, SHA-1 or MD5
pattern before the request is made. On the two IP workflows, `observable_fields` defaults to
`["source.ip", "destination.ip", "host.ip", "client.ip", "server.ip"]` - no length/format guard is applied
there, since these are ECS `ip`-typed fields, already validated by the mapping before they ever reach an
alert. Domain Report defaults to `["url.domain", "dns.question.name", "destination.domain",
"source.domain"]`; URL Report and both URL Scan workflows (public and private) all default to
`["url.full", "url.original"]`.

### Pagination (GTI File Sandbox Behaviour and all four relationship workflows)

`getFileBehaviours` pages via `limit`/`cursor`, unlike the MITRE ATT&CK action. GTI File Sandbox Behaviour
pages with a native `while` step until GTI's own cursor comes back blank — there is no fixed page or item
ceiling by design. Each page's reports are indexed immediately and then discarded, rather than accumulated
for a single pass at the end, so memory stays bounded to one page (40 reports) regardless of how many total
reports a hash has. A large iteration count (250 pages, set on the `paginate` step's `max-iterations`) exists purely as a
backstop against a vendor-side cursor bug that should never fire in practice; if it ever does, that's
surfaced as an "unexpectedly large result set" callout in the note rather than failing silently. An
optional `limit` input overrides the per-page fetch size (defaults to 40, GTI's own maximum for this
endpoint) - it does not cap the total number of reports collected. On a standalone run only, an optional
`cursor` input lets you resume from the cursor surfaced in that callout if the backstop is ever hit.

`getIpRelationship`/`getDomainRelationship`/`getFileRelationship`/`getUrlRelationship` all page via
`limit`/`cursor` the identical way, to full exhaustion, using the same `while` loop and safety backstop
File Sandbox Behaviour uses - **not** one page per run. A relationship collection can be far larger than
any single hash's sandbox history (`communicating_files` on a busy IP has been observed reporting a
`meta.count` in the millions, and real runs have collected far more items than that count even reported),
so the safety backstop matters more here than anywhere else in this project, but the design is the same:
page until GTI's cursor goes blank, index each page immediately, write exactly one note per
observable+relationship pair covering every page fetched - never one page per run and never one note per
page. `limit` on these four workflows works the same way as on File Sandbox Behaviour above - it only
overrides the per-page fetch size, not the total items collected. `cursor` is only meaningful on a
standalone run that previously hit the safety backstop, to resume from where it left off.

### Polling (GTI URL Scan (Public) and GTI URL Scan (Private))

Unlike every other workflow above, these two submit new content to GTI (`scanUrl`/`scanPrivateUrl`) rather
than reading an already-computed verdict, then poll (`getAnalysis`/`getPrivateAnalysis`) until the scan
finishes before retrieving the report (`getUrlScanReport`/`getPrivateUrlReport`) - three actions chained in
one execution, not one lookup. The poll loop checks status immediately each iteration and only sleeps 10
seconds if the scan is still `queued`/`in-progress`, up to 60 iterations (a 10-minute ceiling), modeled on
Censys's own shipped `Rescan` workflow's identical submit-poll-refetch shape. If GTI hasn't finished by the
time the ceiling is hit, the run is marked `partial` rather than `failed` - the scan was genuinely submitted
and is still processing on GTI's side, so the note and indexed record carry the analysis id for the analyst
to check back on later, instead of reporting an error that didn't happen. All six of `scanPrivateUrl`'s
optional parameters (user agent, sandboxes, retention period, storage region, interaction sandbox,
interaction timeout) are exposed as workflow inputs on the private workflow only; any left blank are omitted
from the request entirely so GTI applies its own default rather than the workflow sending an empty override.
`scanUrl` (the public workflow) takes no optional parameters at all - just the URL.

One real behavioral difference between the two, confirmed live rather than assumed: a public scan's
multi-engine analysis stats (`last_analysis_stats`, `reputation`, `total_votes`) are populated immediately on
a fresh, never-before-seen URL, while a private scan's are not (private analysis is isolated from GTI's
public multi-engine pipeline). Both workflows guard their note's Detection/Reputation/Community-votes
sections on whether this data actually came back, rather than defaulting to `0` and rendering a false "0
detections" for a URL nothing has actually analyzed yet.

## Destination indices

One index per action, so responses of different shapes are never mixed.

| Workflow | Index |
|---|---|
| GTI MITRE ATT&CK Techniques | `gti-soar-mitre-attack` |
| GTI File Sandbox Behaviour | `gti-soar-file-behaviour` |
| GTI IP Address Report | `gti-soar-ip-report` |
| GTI IP Address Relationships | `gti-soar-ip-relationship` |
| GTI Domain Report | `gti-soar-domain-report` |
| GTI Domain Relationships | `gti-soar-domain-relationship` |
| GTI File Hash Report | `gti-soar-file-report` |
| GTI File Hash Relationships | `gti-soar-file-relationship` |
| GTI URL Report | `gti-soar-url-report` |
| GTI URL Relationships | `gti-soar-url-relationship` |
| GTI URL Scan (Public) | `gti-soar-url-scan-public` |
| GTI URL Scan (Private) | `gti-soar-url-scan-private` |

**GTI MITRE ATT&CK Techniques**, **GTI IP Address Report**, **GTI Domain Report**, **GTI File Hash
Report**, **GTI URL Report**, **GTI URL Scan (Public)**, and **GTI URL Scan (Private)** each write one document per
observable, id `sha256("<alert id or 'manual'>-<observable>")`. **GTI URL Scan (Public)** and **GTI URL Scan
(Private)** are each their own separate index, distinct from GTI URL Report and from each other, even though
all three retrieve the same underlying report object shape for a URL - a scan document represents that
workflow's own submission (it carries the analysis id), and, unlike every other workflow's id scheme,
re-running either scan workflow against the same URL triggers a genuinely new GTI submission each time
rather than repeating a free, idempotent lookup; the id still refreshes the same document in place so
re-runs don't pile up copies.
**GTI File Sandbox Behaviour** writes one document *per sandbox report* returned for that hash (a hash with
5 sandbox runs gets 5 documents), id `sha256("<alert id or 'manual'>-<observable>-<report id>")` — the same
scheme with the report's own id folded in, so a document's identity survives a re-run regardless of which
page happened to return it.
**All four relationship workflows** (IP Address, Domain, File Hash, URL) write one document *per related
object* returned for that observable+relationship pair, id
`sha256("<alert id or 'manual'>-<observable>-<relationship>-<related object id>")` — the relationship
name is folded in alongside the item's own id, so the same observable enriched for two different
relationships (e.g. `resolutions` and `communicating_files`) never collides on id even if a vendor item id
were ever reused across object types.

Either way, ids are hashed rather than concatenated raw because Elasticsearch rejects any `_id` over 512
bytes, and while a file hash observable is always short, this id scheme is meant to carry over unchanged to
workflows whose observable is a URL, which can comfortably exceed that limit on its own. The hash keeps the
id a fixed 64 characters regardless of observable length while staying fully deterministic, so re-running
against the same alert refreshes the same document(s) rather than accumulating near-duplicates. The
readable identity is not lost, it just moves into the document body: every document also carries
`kibana.alert.uuid`, the alert index, `rule.id`, `rule.name`, `observable`, `trigger_mode` and
`workflow.execution_id`, which is what links it back to the alert and back to the run that produced it.

## What happens when a fetch fails

Every workflow handles this identically, on every trigger path: a failed fetch (after the standard 2
retries) is never silent on any surface.

- **Console**: always logs a line starting `STATUS: succeeded` / `STATUS: partial` (paginated workflows,
  when the safety backstop is hit; GTI URL Scan and GTI URL Scan (Private), when the poll loop's own
  backstop is hit before GTI reports the scan complete) / `STATUS: failed`, regardless of path or workflow.
- **Index**: a `fetch_failure` document is written for any non-`succeeded` outcome - `event.outcome:
  failure`, ECS `error.message`/`error.type` (left blank, not fabricated, when the underlying event genuinely
  isn't an API error - e.g. the pagination safety backstop firing, or either URL Scan workflow's own poll
  timeout), plus the same correlation block every document already carries. Same deterministic id scheme as
  every other document, so a re-run refreshes it in place rather than piling up copies, and it never
  overwrites the last actually-successful document for that observable.
- **Alert note** (paths 1/2 only - a standalone run has no alert to annotate): on `failed`, the note is
  **replaced** with a short status message pointing at the indexed failure record - including replacing a
  prior *successful* note, so a failed re-run is never mistaken for "nothing changed since last time." A
  paginated workflow's `partial` result still shows the real data collected, with an "Incomplete" or "safety
  limit reached" callout. Either URL Scan workflow's own `partial` is different in kind, not just in wording -
  its scan genuinely has no report data yet (GTI is still processing it), so the note instead surfaces the
  analysis id and says so plainly, pointing the analyst at re-running later or polling GTI directly.
- **Tag**: never applied on `failed` (nothing was actually enriched). Still applied on `partial` - for a
  paginated workflow, because real data was retrieved even though the run didn't finish; for either URL Scan
  workflow, because a scan was genuinely submitted and is in flight, even though no report exists yet.

## Notes on the alert

One note per observable, regardless of how many documents that observable's run produced. A re-run finds
its previous note by a marker containing the observable and replaces it, so notes do not stack. The note is
machine-owned and says so: anything typed into it by hand is overwritten on the next run, so analyst
commentary belongs in a separate note.

The File Sandbox Behaviour and IP Address Relationships notes each render one heading section per fetched
item (sandbox name/related-object type+id, verdict or reputation, tags, and a link to the exact indexed
document for that item) — the same heading-plus-bullet-list shape the MITRE ATT&CK and IP Address Report
workflows' own notes use, not a markdown table. That's a deliberate, tested choice, not a style preference:
the alert note list renders through EUI's default markdown plugins, which do not include `remark-gfm`, so
pipe-table syntax (`| a | b |`) never renders as an actual table there — it shows as literal, broken text.

Every note surfaces more than the bare minimum: GTI IP Address Report's note includes GTI's own
plain-English verdict rationale, community vote counts, and crowdsourced threat-intel context when present,
not just verdict/network/geo. Domain Report, File Hash Report, and URL Report follow the same pattern with
fields specific to each observable type - registrar/WHOIS excerpt/popularity ranks for domains, popular
threat classification/signature info/file metadata for hashes, final resolved destination/HTTP
status/redirection chain for URLs - all live-verified against real GTI responses, not guessed field names.
Domain Report and URL Report also flatten GTI's vendor-name-keyed `categories` map (`alphaMountain.ai`,
`BitDefender`, `Sophos`, ...) into a plain "vendor: category" string via the `entries` filter, rather than
indexing it as an object, so a new vendor GTI adds never grows that curated summary block's own field
count. IP Address Relationships' per-item sections are type-aware, not one generic
template: `getIpRelationship` covers 22 different relationship values, each returning a differently-shaped
object, all sharing the same `{id, type, links.self, attributes}` envelope but not the same `attributes`
fields. **All 22 relationship names are covered** by a dedicated section for the object type they return
(`resolution`, `file`, `url`, `vote`, `comment`, `collection`, `ssl_cert`, `graph`, `whois`) — nine types in
total, since several relationship names share a type (e.g. `votes`/`user_votes` both return `vote`;
`campaigns`/`software_toolkits`/`related_threat_actors`/`vulnerabilities`/`malware_families`/`associations`/
`collections`/`reports`/`related_reports` all return `collection`, just with a different `collection_type`).
Coverage for four of those relationship names (`related_threat_actors`, `vulnerabilities`, `campaigns`,
`software_toolkits`) rests on the vendor's own reference docs rather than a directly-observed populated
response — every address tried returned zero items for those four specifically. A bare generic fallback
(`last_analysis_stats`/`reputation`/`tags` if present) still exists, purely as a safety net for any
relationship GTI adds in the future.

**GTI Domain Relationships, GTI File Hash Relationships, and GTI URL Relationships share this exact
type-aware note mechanism**, reusing the same nine per-item cases unchanged and adding new ones only
where the underlying object type genuinely differs:
- Domain Relationships adds a `domain` case (several of its 30 relationship names - `subdomains`,
  `ns_records`, `mx_records`, `caa_records`, `cname_records`, `parent`/`immediate_parent`/`siblings`,
  `soa_records` - return a related *domain* rather than one of the nine types above; confirmed live to
  carry `last_analysis_stats`, `reputation`, `tags`, `tld`, `registrar`, and `threat_severity`, but never
  `gti_assessment`, which only appears on GTI Domain Report's own primary lookup).
- File Hash Relationships adds `ip_address` (same field shape as GTI IP Address Report's own response)
  and `file_behaviour` (the identical shape GTI File Sandbox Behaviour's own action already returns),
  reusing `domain` from Domain Relationships too. Its own relationship set is the largest of the four (49
  values); four names (`analyses`, `attack_techniques`/`related_attack_techniques`, `screenshots`,
  `submissions`) fall through to the generic fallback, not yet confirmed populated on any hash tried.
- URL Relationships introduces no new object type at all - its 31 relationship names are fully covered by
  cases already built across the other three relationship workflows, except `analyses` and `submissions`,
  which fall through to the generic fallback for the same reason.

There is also no single link that opens every fetched document at once. A pre-filtered Discover `_a`
app-state URL is technically possible (verified against Kibana's real rison encoder), but it depends on
Discover's internal state shape rather than a stable, versioned route, and was deliberately not shipped for
that reason. Each report's own document link instead uses the same stable
`/app/discover#/doc/<dataViewId>/<index>?id=` route the MITRE ATT&CK workflow's note link already relies
on.

## Limits

- `xpack.actions.maxResponseContentLength` defaults to 1 MB and the Actions framework rejects larger responses. `getFileMitreAttackTechniques` and `getIpReport` have no limit or cursor parameter, so a file with many sandbox detonations, or an IP with a very large report, returns everything in one response and can approach this bound. `getFileBehaviours` and `getIpRelationship` bound their own per-call response via `limit`, so a single page is *usually* small regardless of how many total items exist — but **`limit` does not always help**: `malware_families`/`related_threat_actors` (`collection`-typed items, deeply nested `aggregations`/`counters`/activity-history data) and `graphs` (items carrying hundreds of `nodes`) can each individually exceed 1 MB, confirmed live even at `limit: 1`. When this happens, `on-failure: retry` then `continue` catches it, the run is marked `fetch_incomplete`, a queryable `fetch_failure` document is written (same `doc_type` every GTI workflow's failure record uses), and the note shows either an "Incomplete" callout (if some earlier pages already succeeded, `run_status: partial`) or a `STATUS: failed` replacement (if the very first page failed) — see "What happens when a fetch fails" below; never a crash or a silently-stale note.
- Relationship actions are exposed on manual runs only. There is no relationship worth selecting automatically, the responses are the largest GTI returns (`getIpRelationship`'s own `meta.count` has been observed in the millions for a single address+relationship pair, and is not a reliable total besides — real runs have collected far more items than `meta.count` reported), and an automated pivot on every alert would spend API quota on questions nobody asked.
- `gti-soar-ip-relationship` shares one index across all 22 relationship object types, each with its own independently-shaped `attributes`. Left fully dynamic, a field name reused across object types with an incompatible value shape can fail an otherwise-healthy document (Elasticsearch locks a field's type from the first document it sees), and confirmed live this genuinely happens (`attributes.threat_severity.version`: a number on file-family objects, the string `"U3"` on url objects; several `attributes.exiftool.*` size fields inconsistently string vs number even within one object type). `index.mapping.ignore_malformed: true` on this index's own bootstrap template absorbs every case actually found - the losing document's field drops into `_ignored` rather than the document being rejected. A harder case (a field that's an object on one relationship type and a plain scalar on another) would not be saved by `ignore_malformed` alone, but was checked live across 18 of the 22 relationship types and not found - if a future action's collision turns out to need it, `mappings.properties.gti: { enabled: false }` is the fallback, at the cost of losing search/aggregation on every field under `gti` for every item, not just the colliding one.
- GTI fields are not ECS aligned and no ingest pipeline is applied, so they do not populate ECS dashboards or feed Indicator Match rules. Each workflow additionally writes exactly one, unconditional alert tag (`gti:mitre-attack`, `gti:file-sandbox`, `gti:ip-report`, `gti:ip-relationship`, `gti:domain-report`, `gti:domain-relationship`, `gti:file-report`, `gti:file-relationship`, `gti:url-report`, `gti:url-relationship`) — indexed and therefore filterable from the alerts table, unlike `gti.*` itself. By design there is no second, verdict-reflecting tag (e.g. a `gti:malicious`) on any GTI workflow, even where the underlying data carries a verdict — kept deliberately simple; the verdict itself is still visible in the note and the indexed document.
- `getIpReport`'s response can be considerably wider than a file-hash report: a real, heavily-annotated public address indexed to well over 1000 dynamically-mapped fields in testing. Every workflow's own bootstrap step (see "Index template" above) sets a field-count safety margin automatically now, so this is no longer something an operator needs to apply by hand.
