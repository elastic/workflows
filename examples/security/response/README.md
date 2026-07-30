# Security > Response

Incident response, case management, and remediation workflows

## Workflows (5)

| Workflow | Description |
|----------|-------------|
| [Windows ClickFix Investigation](./windows-clickfix-investigation.yaml) | Uses the ClickFix Investigation Agent to analyze Windows ClickFix activity and deliver the result to an Elastic Security Case |
| [📁 Case workflow - Prod](./case-workflow-prod.yaml) | The YAML workflow outlines a security operations process that triggers on alerts |
| [📁 Traditional Triage](./traditional-triage.yaml) | The "Traditional Triage" workflow automates the response to security alerts, par |
| [🔒 AD - Automated Triaging](./ad-automated-triaging.yaml) | The YAML workflow outlines an automated triaging process for security operations |
| [createCaseTool](./createcasetool.yaml) | The `createCaseTool` workflow allows an agent to manually create a case with a s |

### Windows ClickFix Investigation setup

The workflow is powered by Elastic Agent Builder. Create its read-only tool and then the `clickfix-investigation-agent` agent using [windows-clickfix-agent.md](./windows-clickfix-agent.md).

Before importing the workflow, replace each `REPLACE_WITH_CONNECTOR_ID` value with the ID of a configured VirusTotal connector.
