# Security > Response

Incident response, case management, and remediation workflows

## Workflows (5)

| Workflow | Description |
|----------|-------------|
| [Remediate Behavior — Windows Script File](./remediate-behavior-windows-script-file.yaml) | Alert or daily ES|QL; extracts .js/.vbs paths from behavior alerts and deletes script files via get-file + execute |
| [Windows ClickFix Investigation](./windows-clickfix-investigation.yaml) | Uses the ClickFix Investigation Agent to analyze Windows ClickFix activity and deliver the result to an Elastic Security Case |
| [📁 Case workflow - Prod](./case-workflow-prod.yaml) | The YAML workflow outlines a security operations process that triggers on alerts |
| [📁 Traditional Triage](./traditional-triage.yaml) | The "Traditional Triage" workflow automates the response to security alerts, par |
| [🔒 AD - Automated Triaging](./ad-automated-triaging.yaml) | The YAML workflow outlines an automated triaging process for security operations |
| [createCaseTool](./createcasetool.yaml) | The `createCaseTool` workflow allows an agent to manually create a case with a s |
| [🛡️ Remediate Identity - Suspected Phishing Kit or AiTM Compromise](./remediate-identity-suspected-phishing-kit-or-aitm-compromise.yaml) | Correlate open Entra AiTM / phishing-kit alerts, corroborate post-auth persistence, and contain (revoke sessions, disable, delete devices, revoke OAuth) with analyst approval. |

### Windows ClickFix Investigation setup

The workflow is powered by Elastic Agent Builder. Create its read-only tool and then the `clickfix-investigation-agent` agent using [windows-clickfix-agent.md](./windows-clickfix-agent.md).

Before importing the workflow, replace each `REPLACE_WITH_CONNECTOR_ID` value with the ID of a configured VirusTotal connector.
