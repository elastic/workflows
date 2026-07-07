# Security > Response

Incident response, case management, and remediation workflows

## Workflows (5)

| Workflow | Description |
|----------|-------------|
| [Block User Credentials — Ransomware SMB](./remediate-ransomware-smb-block-user.yaml) | Alert-triggered; reads user.id and agent.id from the alert, closes SMB sessions, then denies network logon on the victim host |
| [📁 Case workflow - Prod](./case-workflow-prod.yaml) | The YAML workflow outlines a security operations process that triggers on alerts |
| [📁 Traditional Triage](./traditional-triage.yaml) | The "Traditional Triage" workflow automates the response to security alerts, par |
| [🔒 AD - Automated Triaging](./ad-automated-triaging.yaml) | The YAML workflow outlines an automated triaging process for security operations |
| [createCaseTool](./createcasetool.yaml) | The `createCaseTool` workflow allows an agent to manually create a case with a s |
