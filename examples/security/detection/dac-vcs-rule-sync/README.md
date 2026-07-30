# DaC VCS Rule Sync (Dev → GitHub PR)

A Detection-as-Code (DaC) sync into version control, built on the
[detection-rules](https://github.com/elastic/detection-rules) CLI, following the
[DaC quick start guide](https://dac-reference.readthedocs.io/en/latest/dac_quick_start_guide.html).

Rules are authored in a **dev** Kibana space. Tagging a rule with **`vcs`**
means it is *managed by the version control system* (GitHub). On a schedule,
the Elastic workflow checks whether any tagged rule changed since the last
sync, and if so uses the **Kibana GitHub connector** (created in the UI — no
API-only setup, no tokens in YAML) to open a pull request against your
detection-rules fork's `main`. The fork's GitHub Action populates the PR
branch with the exported rules and runs the detection-rules unit tests, with
results posted on the PR. Nothing is copied between Kibana spaces, and there
is no Kibana-side alerting — review, test results, and history all live in
GitHub.

> **Sync direction: Kibana → VCS (one-way).** In this pipeline **Kibana is
> the source of truth for rule content — not the detection-rules repo**.
> Rules are authored and edited in the dev Kibana space, and version control
> *receives* those updates so they can be reviewed, merged, and stored in
> git. Nothing here writes rules back to Kibana. Adding further GitHub
> Actions (for example, a `kibana import-rules` job that runs on merge to
> `main`) could evolve this into a dual-sync architecture where VCS changes
> also flow back into Kibana — but in its example form this is strictly
> Kibana syncing to VCS/GitHub.

```
┌──────────────── Kibana ────────────────┐        ┌───────────── GitHub fork ─────────────┐
│  dev space: rules tagged "vcs"         │        │                                       │
│        │ 1. _find by tag               │        │  branch vcs-sync-<timestamp>          │
│        ▼                               │        │   ├─ .vcs-sync/<branch>.json  ◀──┐    │
│  [Elastic workflow]                    │        │   └─ dac-vcs-rules/ (exported) ◀─┼─┐  │
│   2. changed since last sync?          │        │        ▲                         │ │  │
│   3. GitHub connector:                 │        │        │ 4. Action (on push):    │ │  │
│      create_branch ────────────────────┼────────┼────────┘   export-rules -e -ac ──┘ │  │
│      create_or_update_file (request) ──┼────────┼───────────  commit + unit tests ───┘  │
│      create_pull_request ──────────────┼────────┼──▶ PR vs main (tests commented) │     │
│   5. record sync watermark (ES index)  │        │      merge = rules in VCS       │     │
└────────────────────────────────────────┘        └───────────────────────────────────────┘
```

## Files

| File | Purpose | Where it goes |
|------|---------|---------------|
| [`dac-vcs-rule-sync.yaml`](./dac-vcs-rule-sync.yaml) | Elastic workflow: finds `vcs`-tagged rules, detects changes, opens the sync branch/PR via the GitHub connector | Kibana → Workflows (space-specific — it lives in the space you create it in) |
| [`github/dac-vcs-rule-sync.yml`](./github/dac-vcs-rule-sync.yml) | GitHub Action: exports tagged rules into the sync branch, commits, runs unit tests, comments on the PR | Your detection-rules fork, at `.github/workflows/dac-vcs-rule-sync.yml` |
| [`DEPLOY_AND_TEST.md`](./DEPLOY_AND_TEST.md) | Step-by-step deployment walkthrough | Reference doc |

## Configuration

Everything environment-specific is parameterized in the Elastic workflow's
`consts` block:

| Const | Default | Meaning |
|-------|---------|---------|
| `dev_space` | `dev` | Kibana space rules are authored and tagged in |
| `sync_tag` | `vcs` | Rule tag meaning "managed by version control" |
| `github_owner` | — | Owner of your detection-rules fork (user or org) |
| `github_repo_name` | `detection-rules` | Fork repository name |
| `github_base_branch` | `main` | Branch the sync PRs target |
| `github_connector_id` | — | Kibana GitHub connector used for branch/file/PR operations |
| `sync_request_dir` | `.vcs-sync` | Where sync-request files are committed (also the Action's trigger path) |
| `pr_title_prefix` | `[VCS Sync]` | PR title prefix; also used to detect an already-open sync PR |
| `state_index` | `dac-vcs-sync-state` | Elasticsearch index storing the sync watermark |

The sync cadence (default: every 30 minutes) is set on the `scheduled`
trigger directly — trigger definitions cannot reference `consts`. Unchanged
rules are skipped, so frequent runs are cheap no-ops.

## Setup

### 1. detection-rules fork

1. Fork [elastic/detection-rules](https://github.com/elastic/detection-rules).
2. Copy [`github/dac-vcs-rule-sync.yml`](./github/dac-vcs-rule-sync.yml) into
   the fork at `.github/workflows/dac-vcs-rule-sync.yml` on `main`.
3. (Recommended) Commit a custom rules directory so its config is
   version-controlled — the Action expects it at `dac-vcs-rules/`:

   ```bash
   python -m detection_rules custom-rules setup-config dac-vcs-rules
   git add dac-vcs-rules && git commit -m "Add DaC VCS custom rules dir" && git push
   ```

   If it is missing, the Action bootstraps a default one per run (but then
   only the `rules/` content lands in the PR diff, not the config).
4. Add the repository secrets (Settings → Secrets and variables → Actions).
   Provide **either** the Cloud ID **or** the Kibana URL — not both:

   | Secret | Value |
   |--------|-------|
   | `DR_CLOUD_ID` | Elastic Cloud ID (deployment overview page) — alternative to the URL |
   | `DR_KIBANA_URL` | Kibana base URL (no `/s/<space>` suffix) |
   | `DR_API_KEY` | Always required: base64 API key able to read rules in the dev space |

### 2. Kibana

1. Create a **GitHub connector** (Stack Management → Connectors → GitHub)
   whose credential can write to the fork: create branches, commit files,
   and open pull requests (fine-grained PAT: Contents read/write +
   Pull requests read/write on the fork).
2. Create a new workflow from
   [`dac-vcs-rule-sync.yaml`](./dac-vcs-rule-sync.yaml) and fill in the
   `consts` block (at minimum `github_owner` and `github_connector_id`).

   > **Workflows are space-specific.** The workflow only appears — and its
   > execution history only lives — in the space where you save it, so
   > remember which space that is. The dev space is a natural home. Steps
   > target the dev space explicitly via `/s/<space>/...` paths regardless
   > of where the workflow lives.

3. Run it once manually to confirm the consts are right.

### 3. Sync a rule

Tag any custom rule in the dev space with `vcs`. Within one schedule
interval the workflow opens a PR (`vcs-sync-<timestamp>` → `main`), and the
Action fills it with the exported rule TOML and comments the unit test
results. Merge the PR to accept the rule state into version control. Edit
the rule again and the next cycle opens a fresh sync PR with the diff.

## Behavior notes

- **One-way sync, Kibana as source of truth.** Rule content flows from
  Kibana into git only. Editing a rule's TOML directly in the repo does not
  change the rule in Kibana, and the next sync of that rule will overwrite
  the repo copy with Kibana's version.
- **Change detection.** The workflow stores a watermark (the max `updated_at`
  across tagged rules) in `dac-vcs-sync-state` after each sync PR. Runs where
  no tagged rule is newer than the watermark do nothing. Adding or removing
  the tag bumps a rule's `updated_at`, so newly tagged rules sync on the next
  cycle.
- **One sync PR at a time.** If a `[VCS Sync]` PR is already open, the
  workflow skips the cycle; changes are picked up on the first cycle after
  the PR is merged or closed.
- **Edits are included.** `export-rules` overwrites existing TOML files by
  default (there is no `--overwrite` flag on export — that flag belongs to
  `import-rules`), so edited rules update in place and show as diffs in the
  PR.
- **No-change PRs close themselves.** If the export produces no file changes
  (e.g. a rule was touched but re-normalizes identically), the Action closes
  the PR and deletes the branch.
- **Unit test results live in GitHub.** A failing test suite fails the
  Action run (red on the PR) and posts a comment with the test output tail.
  There is no Kibana-side failure alerting in this design.
- **Deletions are not synced.** Untagging (or deleting) a rule stops future
  syncs but does not remove the TOML already in the repo — prune manually.
- **`.vcs-sync/` is an audit log.** One small request JSON per sync rides
  along in each PR; merged PRs accumulate them as a history of syncs. Prune
  whenever you like.
- **Custom rules only.** The export uses `--custom-rules-only`; prebuilt
  Elastic rules are ignored even if tagged.

## Migrating from the earlier "promote dev → prod" pipeline

If you deployed the previous iteration of this example: delete the old
`.github/workflows/dac-promote-rules.yml` from the fork, remove the old
"DaC - Promote Tagged Rules from Dev to Prod" workflow in Kibana, and delete
the "DaC Promotion Failure" detection rule and `dac-promotion-failures`
index in the dev space if they were created. The `DR_ELASTICSEARCH_URL`
secret is no longer needed.
