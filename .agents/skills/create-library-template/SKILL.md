---
name: create-library-template
description: Author or modify a Workflow Template Library template. Use when creating a template, migrating an example to a template, editing template-metadata or install.form, or preparing a template PR.
---

# Create a Workflow Template Library template

## Where the rules are

**Read [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) § "Authoring a template" before writing anything — do not work from memory.** It is the single source of truth for the file layout, the `template-metadata` block, the categories vocabulary (`library/categories.yaml`), `install.form` and how `__install__.*` references render (the most common source of broken templates), step-type rules, and style. Local validation and the PR checklist are in § "Validating locally" and § "Pull request flow" of the same file.

Templates live at `library/workflows/<slug>/<slug>.yaml` — one directory per slug; directory, file name, and `template-metadata.slug` must match.

## Migration references

Some templates were migrated from a plain workflow in `examples/`. Study a pair or two before authoring — the diff shows exactly what "templatizing" means (add the `template-metadata` block, promote operator-specific values and connector ids to `install.form`, drop banner comments, tidy step comments):

| Template (`library/workflows/`) | Original example (`examples/`) |
|---|---|
| `create-slack-channel/create-slack-channel.yaml` | `integrations/slack/create-slack-channel.yaml` |
| `hash-threat-check/hash-threat-check.yaml` | `security/detection/hash-threat-check.yaml` |
| `ip-reputation-check/ip-reputation-check.yaml` | `security/enrichment/ip-reputation-check.yaml` |
| `mark-alert-as-acknowledged/mark-alert-as-acknowledged.yaml` | `security/detection/mark-alert-as-acknowledged.yaml` |
| `root-cause-analysis/root-cause-analysis.yaml` | `observability/root-cause-analysis-rca-workflow.yaml` |
| `semantic-knowledge-search/semantic-knowledge-search.yaml` | `search/semantic-knowledge-search.yaml` |
| `web-search/web-search.yaml` | `search/web-search.yaml` |

`ip-reputation-check` is the golden example referenced throughout CONTRIBUTING.md.

## Workflow

1. Read the CONTRIBUTING.md sections above.
2. Pick the closest migration pair from the table and mirror its structure.
3. Author the template; follow every rule in § "Authoring a template" (especially the `__install__.*` rendering rules).
4. Validate per § "Validating locally" and open the PR per § "Pull request flow", including the validation output and a test plan.
