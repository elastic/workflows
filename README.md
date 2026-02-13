<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt5d10f3a91df97d15/620a9ac8849cd422f315b83d/logo-elastic-vertical-reverse.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt36f2da8d650732a0/620a9ac8849cd4798f4a12c0/logo-elastic-vertical-color.svg">
    <img alt="Elastic Logo" src="https://images.contentstack.io/v3/assets/bltefdd0b53724fa2ce/blt36f2da8d650732a0/620a9ac8849cd4798f4a12c0/logo-elastic-vertical-color.svg" height="80">
  </picture>
</p>

<h1 align="center">Elastic Workflow Library</h1>

<p align="center">
  A curated collection of workflows for the Elastic platform, covering security, observability and search examples.
</p>

<!-- Navigation Tabs -->
<p align="center">
  <a href="#overview"><img src="https://img.shields.io/badge/📖_README-2D2D2D?style=for-the-badge" alt="README"></a>&nbsp;
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/👥_Contributing-2D2D2D?style=for-the-badge" alt="Contributing"></a>&nbsp;
  <a href="./LICENSE.txt"><img src="https://img.shields.io/badge/⚖️_License-2D2D2D?style=for-the-badge" alt="License"></a>&nbsp;
</p>

<!-- Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/Elastic-9.3+-00BFB3?style=flat-square&logo=elastic&logoColor=white" alt="Elastic 9.3+">&nbsp;
  <img src="https://img.shields.io/badge/Workflows-57-005EB8?style=flat-square" alt="57 Workflows">&nbsp;
  <img src="https://img.shields.io/badge/YAML-CB171E?style=flat-square&logo=yaml&logoColor=white" alt="YAML">&nbsp;
  <img src="https://img.shields.io/badge/Liquid-67B4E4?style=flat-square" alt="Liquid">&nbsp;
  <img src="https://img.shields.io/badge/License-Apache_2.0-D16C00?style=flat-square" alt="Apache 2.0">&nbsp;
  <a href="https://ela.st/slack"><img src="https://img.shields.io/badge/Slack-%23workflows-4A154B?style=flat-square&logo=slack&logoColor=white" alt="Slack"></a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Repository Structure](#repository-structure)
- [Workflow Categories](#workflow-categories)
- [Workflow Schema](#workflow-schema)
- [Key Concepts](#key-concepts)
  - [Triggers](#triggers)
  - [Variable Syntax](#variable-syntax)
  - [Liquid Templating](#liquid-templating)
  - [Error Handling](#error-handling)
- [Importing Workflows](#importing-workflows)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

This repository contains **57 workflows** designed for use with Elastic Workflows, a platform feature for automating operations across the Elastic Stack. These workflows cover a wide range of use cases:

| Category | Description |
|----------|-------------|
| **Security** | Threat detection, incident response, enrichment, and hunting |
| **Observability** | Monitoring, log analysis, and root cause analysis |
| **Search** | Elasticsearch queries, ES\|QL, semantic search |
| **Integrations** | Splunk, Slack, Jenkins, JIRA, Caldera, and more |
| **AI Agents** | Agentic workflows and AI-powered automation |
| **Data** | ETL, ingestion, and document management |

### What are Elastic Workflows?

Elastic Workflows provide a declarative YAML-based approach to automating operations across the Elastic platform. They integrate natively with:

- **Elasticsearch** - Query, aggregate, and index data with ES|QL and DSL
- **Kibana** - Create cases, manage alerts, interact with Security and Observability features
- **External Systems** - Splunk, Slack, Jenkins, JIRA, and any HTTP API
- **AI/ML** - Integrate with language models for intelligent analysis and agents

### Key Features

- **Declarative YAML** - Define what you want, not how to do it
- **Triggers** - Manual, scheduled, or alert-driven
- **Extensible** - Connect to any HTTP API or Elastic feature
- **Version Control** - Store workflows as code, track changes in Git
- **Shareable** - Import/export workflows between environments

---

## Quick Start

### 1. Browse Workflows

Explore the [`workflows/`](./workflows) directory organized by use case:

```
workflows/
├── security/           # Security operations
│   ├── detection/      # Alert management, threat detection
│   ├── response/       # Incident response, case management
│   ├── enrichment/     # Threat intel, IP/hash lookups
│   └── hunting/        # Threat hunting queries
├── integrations/       # Third-party integrations
│   ├── splunk/         # Splunk queries and enrichment
│   ├── slack/          # Channel management, notifications
│   ├── jenkins/        # CI/CD automation
│   ├── jira/           # Ticket management
│   ├── caldera/        # Adversary emulation
│   ├── firebase/       # Authentication
│   └── snowflake/      # Data warehouse queries
├── search/             # Search and query workflows
├── observability/      # Monitoring and analysis
├── ai-agents/          # AI-powered automation
├── data/               # ETL and data management
├── utilities/          # Common utility workflows
└── examples/           # Demo and getting-started
```

### 2. Review and Customize

Each workflow includes inline comments explaining every section:

```yaml
# =============================================================================
# Workflow: IP Reputation Check
# Category: security/enrichment
#
# Assess the reputation of a given IP address using threat intelligence
# =============================================================================

name: IP Reputation Check

# CONSTANTS - Update these values for your environment
consts:
  abuseipdb_api_key: YOUR-API-KEY-HERE  # Get from AbuseIPDB

# INPUTS - Parameters provided at runtime
inputs:
  - name: ip_address
    type: string
    required: true
```

### 3. Import into Kibana

**Option A: Kibana UI**
1. Navigate to **Management → Workflows** in Kibana
2. Click **Create workflow**
3. Paste the YAML content
4. Save and test

**Option B: API Import**
```bash
curl -X POST "https://your-kibana-url/api/workflows" \
  -H "kbn-xsrf: true" \
  -H "x-elastic-internal-origin: Kibana" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -d '{"yaml": "'"$(cat workflows/security/enrichment/ip-reputation-check.yaml)"'"}'
```

See [docs/importing.md](./docs/importing.md) for detailed instructions.

---

## Repository Structure

```
elastic-workflows/
├── README.md                    # This file
├── CONTRIBUTING.md              # Contribution guidelines
├── LICENSE.txt                  # Apache 2.0 license
├── workflows/                   # All workflow YAML files
│   ├── security/                # Security operations
│   │   ├── detection/           # Threat detection workflows
│   │   ├── response/            # Incident response workflows
│   │   ├── enrichment/          # Enrichment workflows
│   │   └── hunting/             # Threat hunting workflows
│   ├── integrations/            # Third-party integrations
│   │   ├── splunk/
│   │   ├── slack/
│   │   ├── jenkins/
│   │   ├── jira/
│   │   ├── caldera/
│   │   ├── firebase/
│   │   └── snowflake/
│   ├── search/                  # Search workflows
│   ├── observability/           # Observability workflows
│   ├── ai-agents/               # AI agent workflows
│   ├── data/                    # Data/ETL workflows
│   ├── utilities/               # Utility workflows
│   └── examples/                # Demo workflows
└── docs/                        # Extended documentation
    ├── schema.md                # Complete YAML schema reference
    ├── concepts.md              # Workflow concepts explained
    └── importing.md             # Import instructions
```

---

## Workflow Categories

### Security

Workflows for security operations, threat detection, and incident response.

| Category | Count | Description |
|----------|-------|-------------|
| [security/detection](./workflows/security/detection/) | 8 | Alert management, threat detection, rule execution |
| [security/enrichment](./workflows/security/enrichment/) | 5 | VirusTotal, IP reputation, threat intel lookups |
| [security/response](./workflows/security/response/) | 4 | Incident response, triage, and case management |

### Integrations

Workflows for connecting Elastic with external systems.

| Category | Count | Description |
|----------|-------|-------------|
| [integrations/splunk](./workflows/integrations/splunk/) | 5 | Splunk queries, enrichment, data retrieval |
| [integrations/caldera](./workflows/integrations/caldera/) | 4 | MITRE Caldera adversary emulation |
| [integrations/slack](./workflows/integrations/slack/) | 3 | Channel creation, user management, notifications |
| [integrations/firebase](./workflows/integrations/firebase/) | 2 | Firebase authentication |
| [integrations/jenkins](./workflows/integrations/jenkins/) | 1 | CI/CD build automation |
| [integrations/jira](./workflows/integrations/jira/) | 1 | Ticket creation |
| [integrations/snowflake](./workflows/integrations/snowflake/) | 1 | Data warehouse queries |

### Platform Features

| Category | Count | Description |
|----------|-------|-------------|
| [search](./workflows/search/) | 4 | ES\|QL, semantic search, web search |
| [observability](./workflows/observability/) | 1 | Monitoring, log analysis, AI-powered observability |
| [ai-agents](./workflows/ai-agents/) | 2 | AI agent invocation and automation |
| [data](./workflows/data/) | 3 | ETL, ingestion, document management |
| [utilities](./workflows/utilities/) | 11 | Common operations and helpers |
| [examples](./workflows/examples/) | 2 | Getting started demos |

### Featured Workflows

| Workflow | Category | Description |
|----------|----------|-------------|
| [IP Reputation Check](./workflows/security/enrichment/ip-reputation-check.yaml) | Security | Check IP against AbuseIPDB and geolocation |
| [Hash Threat Check](./workflows/security/detection/hash-threat-check.yaml) | Security | VirusTotal file hash analysis |
| [Splunk Query](./workflows/integrations/splunk/splunk-query.yaml) | Integration | Execute Splunk searches |
| [Create Slack Channel](./workflows/integrations/slack/create-slack-channel.yaml) | Integration | Automated Slack channel creation |
| [Semantic Knowledge Search](./workflows/search/semantic-knowledge-search.yaml) | Search | AI-powered semantic search |
| [AD Automated Triaging](./workflows/security/response/ad-automated-triaging.yaml) | Security | Automated security alert triage workflow |

---

## Workflow Schema

Every workflow follows a consistent YAML schema:

```yaml
# Required fields
name: "Workflow Name"           # Human-readable name
steps:                          # At least one step required
  - name: "Step Name"           # Step identifier
    type: "action.type"         # Action to perform
    with:                       # Action parameters
      key: value

# Optional fields
description: "What this does"   # Detailed description
tags:                           # Categories for organization
  - observability
  - search
triggers:                       # How the workflow is invoked
  - type: scheduled
    with:
      every: "1d"              # Daily
consts:                         # Reusable constants
  api_key: "value"
inputs:                         # Runtime parameters
  - name: query
    type: string
    required: true
```

### Common Action Types

| Action | Description | Use Case |
|--------|-------------|----------|
| `http` | HTTP requests | API calls, webhooks |
| `elasticsearch.search` | Search ES indices | Data retrieval |
| `elasticsearch.index` | Index documents | Data storage |
| `kibana.cases` | Case management | Incident response |
| `kibana.alert` | Alert operations | Detection |
| `console` | Log output | Debugging |
| `foreach` | Loop over arrays | Batch processing |

See [docs/schema.md](./docs/schema.md) for the complete schema reference.

---

## Key Concepts

### Triggers

Workflows support multiple trigger types:

```yaml
# Manual (on-demand)
triggers:
  - type: manual

# Scheduled (simple interval)
triggers:
  - type: scheduled
    with:
      every: "6h"  # Every 6 hours

# Alert-driven
triggers:
  - type: alert
```

### Variable Syntax

Reference values using double curly braces:

```yaml
# Constants
url: "{{ consts.api_url }}/endpoint"

# Inputs
query: "host.ip: {{ inputs.target_ip }}"

# Step outputs
message: "Found {{ steps.search.output.hits.total }} results"
```

### Liquid Templating

Workflows support [Liquid](https://shopify.github.io/liquid/) templating for dynamic content. Use filters to transform data inline.

#### Common Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `json` | Convert to JSON string | `{{ object \| json }}` |
| `json_parse` | Parse JSON string to object | `{{ json_string \| json_parse }}` |
| `size` | Get array length or string length | `{{ items \| size }}` |
| `first` / `last` | Get first/last array item | `{{ items \| first }}` |
| `map` | Extract property from array | `{{ users \| map: "name" }}` |
| `where` | Filter array by property | `{{ items \| where: "status", "active" }}` |
| `where_exp` | Filter with expression | `{{ items \| where_exp: "item.price > 100" }}` |
| `join` | Join array to string | `{{ tags \| join: ", " }}` |
| `split` | Split string to array | `{{ csv \| split: "," }}` |
| `default` | Fallback value | `{{ name \| default: "Unknown" }}` |
| `date` | Format date | `{{ "now" \| date: "%Y-%m-%d" }}` |
| `upcase` / `downcase` | Change case | `{{ text \| upcase }}` |
| `strip` | Remove whitespace | `{{ text \| strip }}` |
| `replace` | Replace substring | `{{ text \| replace: "old", "new" }}` |
| `truncate` | Shorten string | `{{ text \| truncate: 50 }}` |
| `base64_encode` / `base64_decode` | Base64 encoding | `{{ text \| base64_encode }}` |
| `url_encode` / `url_decode` | URL encoding | `{{ text \| url_encode }}` |

#### Array Manipulation

```yaml
# Filter products where price > 100
{{ products | where_exp: "item.price > 100" }}

# Find first matching item
{{ products | find: "type", "book" }}

# Check if any item matches
{{ products | has: "category", "electronics" }}

# Remove items matching condition
{{ products | reject_exp: "item.stock == 0" }}

# Sort by property
{{ products | sort: "name" }}

# Get unique values
{{ items | uniq }}

# Concatenate arrays
{{ array1 | concat: array2 }}
```

#### String Operations

```yaml
# Format message with data
message: "Alert: {{ event.rule.name | upcase }} on {{ event.host.name }}"

# Build URL with encoding
url: "https://api.example.com/search?q={{ query | url_encode }}"

# Extract substring
short_hash: "{{ file.hash.sha256 | slice: 0, 8 }}"

# Default values for missing data
user: "{{ event.user.name | default: 'unknown' }}"
```

#### Control Flow

Use Liquid tags for conditional logic and loops:

```yaml
message: |
  {%- if steps.search.output.hits.total > 0 -%}
  Found {{ steps.search.output.hits.total }} results
  {%- else -%}
  No results found
  {%- endif -%}
```

```yaml
# Loop over items
message: |
  {%- for alert in event.alerts -%}
  - {{ alert.rule.name }}: {{ alert.severity }}
  {%- endfor -%}
```

```yaml
# Assign variables
message: |
  {%- assign severity = event.alerts[0].severity -%}
  {%- case severity -%}
    {%- when "critical" -%}
    🔴 CRITICAL: Immediate action required
    {%- when "high" -%}
    🟠 HIGH: Investigate promptly
    {%- else -%}
    🟢 Normal priority
  {%- endcase -%}
```

<details>
<summary><strong>All Supported Filters</strong> (click to expand)</summary>

**Math**: `abs`, `at_least`, `at_most`, `ceil`, `divided_by`, `floor`, `minus`, `modulo`, `plus`, `round`, `times`

**String**: `append`, `capitalize`, `downcase`, `escape`, `lstrip`, `prepend`, `remove`, `remove_first`, `remove_last`, `replace`, `replace_first`, `replace_last`, `rstrip`, `slice`, `split`, `strip`, `strip_html`, `strip_newlines`, `truncate`, `truncatewords`, `upcase`

**Array**: `compact`, `concat`, `first`, `group_by`, `group_by_exp`, `join`, `last`, `map`, `pop`, `push`, `reverse`, `shift`, `size`, `sort`, `sort_natural`, `uniq`, `unshift`, `where`, `where_exp`, `find`, `find_exp`, `has`, `has_exp`, `reject`, `reject_exp`

**Date**: `date`, `date_to_long_string`, `date_to_rfc822`, `date_to_string`, `date_to_xmlschema`

**Encoding**: `base64_decode`, `base64_encode`, `cgi_escape`, `uri_escape`, `url_decode`, `url_encode`, `xml_escape`, `json`, `json_parse`

**Utility**: `default`, `escape_once`, `normalize_whitespace`, `number_of_words`, `slugify`, `array_to_sentence_string`

</details>

### Error Handling

```yaml
steps:
  - name: api_call
    type: http
    with:
      url: "{{ consts.api_url }}"
    on-failure:
      retry:
        max-attempts: 3
        delay: 5s
      continue: true   # Proceed even on failure
```

See [docs/concepts.md](./docs/concepts.md) for detailed explanations.

---

## Importing Workflows

### Kibana UI

1. Open Kibana → **Management → Workflows**
2. Click **Create workflow**
3. Paste YAML content
4. Update constants for your environment
5. Save

### API

```bash
cat workflow.yaml | jq -Rs '{yaml: .}' | \
  curl -X POST "https://KIBANA_URL/api/workflows" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: Kibana" \
    -H "Content-Type: application/json" \
    -H "Authorization: ApiKey API_KEY" \
    -d @-
```

### Bulk Import

```bash
for file in workflows/security/**/*.yaml; do
  echo "Importing: $file"
  cat "$file" | jq -Rs '{yaml: .}' | \
    curl -s -X POST "https://KIBANA_URL/api/workflows" \
      -H "kbn-xsrf: true" \
      -H "x-elastic-internal-origin: Kibana" \
      -H "Content-Type: application/json" \
      -H "Authorization: ApiKey API_KEY" \
      -d @-
done
```

See [docs/importing.md](./docs/importing.md) for complete instructions.

---

## Examples

### Example 1: ES|QL Query

Query Elasticsearch with ES|QL and process results:

```yaml
name: ES|QL Query Example
triggers:
  - type: manual

inputs:
  - name: query
    type: string
    default: "FROM logs-* | LIMIT 10"

steps:
  - name: execute_query
    type: elasticsearch.esql.query
    with:
      format: json
      query: "{{ inputs.query }}"
  
  - name: store_count
    type: data.set
    with:
      row_count: "{{ steps.execute_query.output.values | size }}"
```

### Example 2: Scheduled Report Workflow

Run an ES|QL query and send a summary to Slack:

```yaml
name: Daily Security Summary
triggers:
  - type: scheduled
    with:
      every: "1d"  # Daily

consts:
  slack_webhook: "https://hooks.slack.com/..."

steps:
  - name: query_alerts
    type: elasticsearch.esql.query
    with:
      format: json
      query: |
        FROM .alerts-security.alerts-default
        | WHERE @timestamp > NOW() - 24 hours
        | STATS alert_count = COUNT(*) BY host.name
        | SORT alert_count DESC
        | LIMIT 10
  
  - name: notify_slack
    type: http
    with:
      url: "{{ consts.slack_webhook }}"
      method: POST
      body:
        text: "🔔 Daily Alert Summary: {{ steps.query_alerts.output.values | size }} hosts with alerts in the last 24h"
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### How to Contribute

1. Fork this repository
2. Add your workflow to the appropriate category
3. Include inline comments explaining each step
4. Test in a Kibana environment
5. Submit a pull request

### Workflow Guidelines

- Include header comment block with description
- Add section comments (CONSTANTS, INPUTS, STEPS)
- Use meaningful step names
- Document required inputs and constants
- No hardcoded credentials

---

## License

This project is licensed under the Apache License 2.0 - see [LICENSE](./LICENSE.txt) for details.

---

## Resources

- [Elastic Workflows Documentation](https://www.elastic.co/docs/explore-analyze/workflows)
- [ES|QL Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/esql.html)
- [Kibana API Reference](https://www.elastic.co/guide/en/kibana/current/api.html)

