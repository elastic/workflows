# Security > Response

Incident response, case management, and remediation workflows

## Workflows (7)

| Workflow | Description |
|----------|-------------|
| [Remediate Startup Folder Persistence](./remediate-persistence-windows-startup-folder.yaml) | ES\|QL correlates user/ProgramData Startup persistence with endpoint alerts in 5m windows; skips if get-file exists in history, then downloads, waits 20s, and deletes |
| [Remediate Run Key Persistence](./remediate-persistence-windows-run-key.yaml) | ES\|QL correlates Run-key registry persistence with endpoint alerts in 5m windows; skips if delete exists in history, then removes the Run value via PowerShell |
| [Remediate Scheduled Task Persistence](./remediate-persistence-windows-scheduled-task.yaml) | ES\|QL correlates scheduled task creation with endpoint alerts in 5m windows; skips if schtasks delete exists in history, then removes the task |
| [📁 Case workflow - Prod](./case-workflow-prod.yaml) | The YAML workflow outlines a security operations process that triggers on alerts |
| [📁 Traditional Triage](./traditional-triage.yaml) | The "Traditional Triage" workflow automates the response to security alerts, par |
| [🔒 AD - Automated Triaging](./ad-automated-triaging.yaml) | The YAML workflow outlines an automated triaging process for security operations |
| [createCaseTool](./createcasetool.yaml) | The `createCaseTool` workflow allows an agent to manually create a case with a s |
