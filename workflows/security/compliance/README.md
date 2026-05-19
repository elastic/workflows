# Security > Compliance

PCI DSS and compliance automation workflows powered by Agent Builder's `pci-compliance` skill.

## Prerequisites

- Elastic Stack **9.3+** with Workflows and Agent Builder enabled
- The **pci-compliance** skill available in Agent Builder (see [elastic/kibana#256060](https://github.com/elastic/kibana/pull/256060))
- An **elastic-ai-agent** (or custom agent with the pci-compliance skill attached)
- For notifications: a Slack or email connector ID configured in `consts.notification_connector_id`
- For trending: create the `pci-compliance-results` index (created automatically on first index step)

## Workflows (2)

| Workflow | Description |
|----------|-------------|
| [PCI DSS Daily Compliance Assessment](./pci-daily-assessment.yaml) | Scheduled daily PCI DSS v4.0.1 posture assessment via Agent Builder; indexes results and sends a summary notification |
| [PCI Violation Case Creator](./pci-violation-case-creator.yaml) | On-demand or weekly check for RED findings; opens a Kibana case when violations are detected |

## Typical setup

1. Import **PCI DSS Daily Compliance Assessment**, set `notification_connector_id`, and enable the schedule.
2. Import **PCI Violation Case Creator** for case tracking on RED requirements (optional `requirements` input).
3. Build a dashboard over `pci-compliance-results` in Kibana (manual or Lens) using indexed `report` documents.
