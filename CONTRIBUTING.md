# Contributing to Elastic Workflows Library

Thank you for your interest in contributing to the Elastic Workflows Library! This document provides guidelines for contributing workflows and improvements.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Workflow Contribution Guidelines](#workflow-contribution-guidelines)
- [Submission Process](#submission-process)
- [Code of Conduct](#code-of-conduct)

---

## Ways to Contribute

### 1. Submit New Workflows

Share workflows you've developed for:
- Threat detection and alerting
- Incident response automation
- Data enrichment with threat intelligence
- Threat hunting queries
- Integration with external tools
- Scheduled maintenance tasks

### 2. Improve Existing Workflows

- Fix bugs or issues
- Improve documentation and comments
- Optimize performance
- Add error handling
- Extend functionality

### 3. Improve Documentation

- Fix typos or unclear explanations
- Add examples
- Improve schema documentation
- Translate to other languages

### 4. Report Issues

- Report bugs in workflows
- Suggest improvements
- Request new workflow types

---

## Workflow Contribution Guidelines

### File Structure

Place your workflow in the appropriate category:

```
workflows/
├── detection/      # Threat detection, alerting
├── response/       # Incident response, case management
├── enrichment/     # Threat intel, data enrichment
├── hunting/        # Threat hunting queries
├── notification/   # Alerts, messaging
├── automation/     # Scheduled tasks, utilities
└── uncategorized/  # Miscellaneous
```

### Naming Conventions

- Use lowercase with hyphens: `ip-reputation-check.yaml`
- Be descriptive: `virustotal-hash-lookup.yaml` not `vt-lookup.yaml`
- Include the primary action: `slack-alert-notification.yaml`

### Required Documentation

Every workflow must include:

#### 1. Header Comment Block

```yaml
# =============================================================================
# Workflow: [Descriptive Name]
#
# [2-4 sentence description of what this workflow does, when to use it,
# and what it integrates with]
#
# Author: [Your Name]
# Date: [YYYY-MM-DD]
# Tags: [tag1, tag2, tag3]
# =============================================================================
```

#### 2. Section Comments

```yaml
# ---------------------------------------------------------------------------
# CONSTANTS
# [Brief description of what needs to be configured]
# ---------------------------------------------------------------------------
consts:
  api_key: "YOUR-API-KEY"  # Explain where to get this
```

#### 3. Step Comments

```yaml
steps:
  # Step 1: [What this step does]
  # Purpose: [Why this step is needed]
  - name: descriptive_step_name
    type: action.type
```

### Code Quality

#### Use Meaningful Names

```yaml
# ❌ Bad
- name: step1
  type: http
  with:
    url: "{{ consts.u }}"

# ✅ Good  
- name: lookup_ip_reputation
  type: http
  with:
    url: "{{ consts.virustotal_api_url }}/ip-address/{{ inputs.ip }}"
```

#### Include Error Handling

```yaml
- name: external_api_call
  type: http
  with:
    url: "{{ consts.api_url }}"
  on-failure:
    retry:
      max-attempts: 3
      delay: 5s
    continue: true  # Or false if critical
```

#### Use Constants for Configuration

```yaml
# ✅ Good - Easy to customize
consts:
  api_endpoint: "https://api.example.com/v2"
  timeout_seconds: 30
  max_results: 100

steps:
  - name: query_api
    with:
      url: "{{ consts.api_endpoint }}/search"
      timeout: "{{ consts.timeout_seconds }}s"
```

### Security Requirements

#### 1. Never Commit Real Credentials

```yaml
# ❌ Bad
consts:
  api_key: "sk-abc123xyz789"  # Real API key!

# ✅ Good
consts:
  api_key: "YOUR-API-KEY-HERE"  # Placeholder
```

#### 2. Document Required Permissions

```yaml
# =============================================================================
# Workflow: Case Creator
#
# Required Permissions:
# - Kibana: Cases > All
# - Elasticsearch: Read access to .alerts-* indices
# =============================================================================
```

#### 3. Validate Inputs

```yaml
inputs:
  - name: ip_address
    type: string
    description: "IPv4 or IPv6 address (validated format)"
    required: true
```

### Testing Requirements

Before submitting, verify:

1. **YAML Syntax**: Passes `yamllint` or similar
2. **Schema Validation**: Imports into Kibana without errors
3. **Functional Test**: Executes successfully with test data
4. **Error Handling**: Behaves correctly when external services fail

---

## Submission Process

### Step 1: Fork the Repository

```bash
# Fork on GitHub, then clone
git clone https://github.com/YOUR_USERNAME/elastic-workflows.git
cd elastic-workflows
```

### Step 2: Create a Branch

```bash
git checkout -b add-workflow/my-new-workflow
# or
git checkout -b fix/workflow-name-issue
```

### Step 3: Add Your Workflow

1. Create the YAML file in the appropriate category folder
2. Include all required documentation (header, section comments, step comments)
3. Test the workflow in your Kibana environment

### Step 4: Update Category README (Optional)

If adding a significant workflow, add it to the category's README.md:

```markdown
| [My Workflow](./my-workflow.yaml) | Brief description | Author |
```

### Step 5: Commit and Push

```bash
git add workflows/category/my-workflow.yaml
git commit -m "Add: My New Workflow for XYZ use case"
git push origin add-workflow/my-new-workflow
```

### Step 6: Submit Pull Request

1. Go to the original repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template:

```markdown
## Description
[What does this workflow do?]

## Category
[detection/response/enrichment/etc.]

## Testing
- [ ] Tested in Kibana [version]
- [ ] YAML validates without errors
- [ ] Workflow executes successfully

## Checklist
- [ ] Header comment block included
- [ ] Section comments included
- [ ] Step comments included
- [ ] No real credentials/secrets
- [ ] Error handling configured
```

### Review Process

1. Maintainers review the PR
2. Automated checks run (YAML validation, linting)
3. Feedback provided if changes needed
4. Once approved, PR is merged

---

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the contribution, not the contributor
- Accept criticism gracefully

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or inflammatory comments
- Publishing others' private information
- Submitting malicious code

### Reporting

Report issues to the maintainers via GitHub Issues or email.

---

## Questions?

- Open a GitHub Issue for questions
- Check existing workflows for examples
- Review the [schema documentation](./docs/schema.md)

---

Thank you for contributing!

