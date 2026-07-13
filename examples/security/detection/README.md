# Security > Detection

Threat detection, alerting, and rule management workflows

## Workflows (9)

| Workflow | Description |
|----------|-------------|
| [Browser Extension Daily Reputation Check](./browser-extension-daily-reputation.yaml) | Daily ES\|QL hunt for singleton .crx extensions; Chrome search-by-ID + Edge fallback; rule-based reputation (no AI) |
| [Disable Noisy Elastic Defend Behavior Rules](./disable-noisy-endpoint-rules-from-esql.yaml) | Detects noisy Elastic Defend behavior rules via ES\|QL (FP bursts) and auto-creates scoped Endpoint Security exceptions by rule version; new artifact versions are unaffected |
| [␆ Mark Alert as Acknowledged](./mark-alert-as-acknowledged.yaml) | This workflow YAML defines a manual trigger for acknowledging security alerts |
| [🏷️ Add Alert Tag - FP](./add-alert-tag-fp.yaml) | This workflow YAML defines a manual trigger for adding a tag to a security alert |
| [🏷️ Add Alert Tag - TP](./add-alert-tag-tp.yaml) | This workflow YAML defines a manual trigger for adding tags to an alert in a sec |
| [📝 Create Alert Note](./create-alert-note.yaml) | This workflow YAML defines a manual trigger for creating an alert note in a secu |
| [🔲 Manually Run Rules](./manually-run-rules.yaml) | This YAML workflow defines a manual trigger for running security rules, allowing |
| [🚪 Mark Alert as Closed](./mark-alert-as-closed.yaml) | This workflow YAML defines a manual trigger for marking a security alert as clos |
| [Hash Threat Check](./hash-threat-check.yaml) | The "Hash Threat Check" workflow is designed to verify file hashes (MD5, SHA-1,  |
| [SNMP Link Status Monitor](./snmp-link-status-monitor.yaml) | The SNMP Link Status Monitor workflow is designed to monitor SNMP link status tr |
