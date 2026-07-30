# Deploy & Test Guide — DaC VCS Rule Sync

End-to-end walkthrough for deploying and validating the VCS rule sync
pipeline (see [README.md](./README.md) for the architecture). It assumes you
already have:

- a fork of [elastic/detection-rules](https://github.com/elastic/detection-rules)
- an Elastic stack that can reach GitHub, and GitHub Actions runners that can
  reach your Kibana

Everything on the Kibana side is configured through the UI — the GitHub
connector does all the GitHub work (no PATs in YAML, no API-only connector
setup).

Note the sync direction: **Kibana is the source of truth for rules, not the
detection-rules repo**. This pipeline pushes rule state from Kibana into
GitHub so it can be reviewed, merged, and stored in VCS; it never writes
rules back to Kibana. Additional GitHub Actions (e.g. importing to Kibana on
merge) could turn this into a dual-sync architecture — in its example form
it is one-way, Kibana → VCS/GitHub.

---

## Phase 0 — One-time prerequisites

### 1. Enable Workflows in Kibana

Kibana 9.3+ (tech preview): in the space where you'll work, go to
**Stack Management → Advanced Settings**, search "workflows", and enable the
Workflows UI. Your user needs the **Workflows: All** privilege.

### 2. Create the dev space

**Stack Management → Spaces** → create `dev` (or use an existing space). The
workflow `consts` take the space **ID** (the lowercase URL slug), not the
display name.

### 3. Create the export API key (becomes `DR_API_KEY`)

**Stack Management → API Keys → Create API key**, created as a user who can
**read rules in the dev space** (Security feature privilege). That's all the
pipeline needs — it never writes to Kibana or Elasticsearch from CI. Copy
the **Encoded** value.

### 4. Create the GitHub connector in Kibana

Generate a GitHub credential that can write to your fork — fine-grained PAT
scoped to the fork with **Contents: read/write** and **Pull requests:
read/write**. Then **Stack Management → Connectors → Create connector →
GitHub**, paste the credential. Grab the connector ID from the connector's
details (or Dev Tools: `GET kbn:/api/actions/connectors`).

The workflow only uses tools this connector is verified to expose:
`create_branch`, `create_or_update_file`, `create_pull_request`, and PR
search. It never dispatches GitHub Actions directly.

### 5. Network sanity check

GitHub-hosted runners must be able to reach your Kibana URL (for the rule
export). If your stack is not internet-reachable, use a self-hosted runner.

---

## Phase 1 — Set up the fork

1. Copy [`github/dac-vcs-rule-sync.yml`](./github/dac-vcs-rule-sync.yml) into
   your fork at `.github/workflows/dac-vcs-rule-sync.yml` and push it to
   `main`.
2. In the fork, **Settings → Secrets and variables → Actions**, add the
   connection secrets. Pick **one** connection form:

   | Secret | Value |
   |--------|-------|
   | `DR_CLOUD_ID` | Cloud ID from the deployment overview page (Elastic Cloud) |
   | `DR_KIBANA_URL` | …or the Kibana base URL, no `/s/<space>` suffix (self-managed) |
   | `DR_API_KEY` | Always: the encoded key from Phase 0 |

   Don't set both `DR_CLOUD_ID` and `DR_KIBANA_URL` — the Action fails fast
   on that combination.
3. (Recommended) Commit the custom rules directory so its config is
   version-controlled:

   ```bash
   python -m detection_rules custom-rules setup-config dac-vcs-rules
   git add dac-vcs-rules && git commit -m "Add DaC VCS custom rules dir" && git push
   ```

---

## Phase 2 — Deploy the Elastic workflow

1. In Kibana: **Workflows → Create workflow**, paste
   [`dac-vcs-rule-sync.yaml`](./dac-vcs-rule-sync.yaml).

   > **Workflows are space-specific.** The workflow is saved into whichever
   > space you're in when you create it, and that's the only space where it
   > (and its execution history) will show up — note which space you use.

2. Edit `consts`: at minimum `github_owner` and `github_connector_id`; also
   `dev_space`/`sync_tag` if you diverged from the defaults.
3. Save, run it manually, and open the execution. With nothing tagged yet
   you should see: `No rules tagged "vcs" found in space "dev" — nothing to
   sync.` That proves the rule search and consts are wired correctly.

---

## Phase 3 — First sync (happy path)

1. In the **dev** space, create or pick a custom rule and add the tag
   **`vcs`**.
2. Run the workflow manually (or wait for the schedule). The execution log
   should show `VCS sync PR opened for 1 changed rule(s): <PR URL> ...`.
3. On the fork, verify the chain:
   - a branch `vcs-sync-<timestamp>` exists, containing
     `.vcs-sync/vcs-sync-<timestamp>.json`;
   - the **DaC - VCS rule sync** Action ran on that branch: exported the rule
     (`Export tagged rules...`), committed it (`[VCS Sync] Export 'vcs'
     tagged rules from space 'dev'`), and ran the unit tests;
   - the PR against `main` now shows the rule TOML in its diff and a
     ✅ *unit tests passed* comment.
4. **Merge the PR.** The rule is now in version control.
5. Run the workflow again without touching the rule: the log should show
   `... none changed since the last sync ...` — the watermark works, no new
   PR.
6. Edit the tagged rule in dev (e.g. tweak the description) and run again: a
   fresh sync PR opens with just that diff.

---

## Phase 4 — Failure and edge-case behavior

- **Unit test failure:** if the exported rules fail the detection-rules test
  suite, the Action run goes red on the PR and posts a ❌ comment with the
  test output tail. The rules are still committed, so the diff stays
  reviewable. Fix the rule in dev and let the next cycle re-sync (close the
  failing PR first, or push a fix to its branch).
- **No-change sync:** if a sync PR's export produces no file changes, the
  Action closes the PR and deletes the branch automatically, with a comment.
- **Open PR gate:** while any `[VCS Sync]` PR is open, the workflow skips
  new syncs (`... a "[VCS Sync]" PR is already open ...`). Merge or close it
  to resume.
- **Failed sync retry:** the watermark only advances after the PR opens
  successfully, so a failed branch/PR creation is retried on the next cycle.

---

## Phase 5 — Go live

Nothing else to do — the workflow saved enabled with a 30-minute schedule,
and idle cycles are no-ops. Adjust the cadence on the `scheduled` trigger if
you want, and keep an eye on the workflow's execution history for the first
day (it's only visible in the space where you saved the workflow).

---

## Troubleshooting map

| Symptom | Likely cause |
|---------|--------------|
| Branch/file/PR steps fail in the Elastic workflow | Wrong `github_connector_id`, or the connector's credential lacks Contents/Pull requests write on the fork |
| PR opened but the Action never ran | The Action file isn't at `.github/workflows/dac-vcs-rule-sync.yml` on `main`, or Actions are disabled on the fork; note the trigger only matches `vcs-sync-*` branches and `.vcs-sync/**` paths |
| Action fails at "Validate connection settings" | Neither `DR_CLOUD_ID` nor `DR_KIBANA_URL` set, both set at once, or `DR_API_KEY` missing |
| Action export finds 0 rules | Tag/space mismatch between workflow consts and reality, or the rule is prebuilt rather than custom |
| Every run says "none changed" but you expect a sync | The watermark in `dac-vcs-sync-state` is ahead — check `GET dac-vcs-sync-state/_search` in Dev Tools; delete the index to force a full re-sync |
| Sync PRs keep opening and closing with no changes | A rule's `updated_at` is being bumped without content changes (e.g. repeated tag toggling); harmless, the Action closes them |
| Workflow or its execution history "missing" from the Workflows page | Workflows are space-specific — switch to the space where you created it |
