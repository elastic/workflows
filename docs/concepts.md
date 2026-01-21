# Workflow Concepts

This document explains the core concepts behind Elastic Workflows and how to use them effectively.

---

## Table of Contents

- [What Are Workflows?](#what-are-workflows)
- [Workflow Lifecycle](#workflow-lifecycle)
- [Triggers](#triggers)
- [Steps and Actions](#steps-and-actions)
- [Data Flow](#data-flow)
- [Variables and Templates](#variables-and-templates)
  - [Liquid Templating](#liquid-templating)
  - [Filters](#filters) (String, Array, Math, Date, Encoding)
  - [Control Flow Tags](#control-flow-tags) (if, unless, case, for)
- [Control Flow](#control-flow)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## What Are Workflows?

Elastic Workflows are **declarative automation pipelines** that define security operations as code. Instead of writing procedural scripts, you describe:

- **What** you want to accomplish (actions)
- **When** it should run (triggers)
- **With what** data (inputs, constants)
- **How** to handle failures (error handling)

### Benefits of Workflows

| Benefit | Description |
|---------|-------------|
| **Declarative** | Describe outcomes, not implementation details |
| **Portable** | YAML files can be version-controlled and shared |
| **Auditable** | Execution history is logged automatically |
| **Scalable** | Run across distributed infrastructure |
| **Maintainable** | Clear structure makes updates easy |

### Comparison: Script vs. Workflow

**Traditional Script:**
```python
import requests

def check_ip(ip):
    try:
        response = requests.get(f"https://api.threatintel.com/ip/{ip}")
        if response.status_code == 200:
            data = response.json()
            if data['risk_score'] > 70:
                send_alert(f"High risk IP: {ip}")
    except Exception as e:
        log_error(e)
        # Retry logic...
```

**Elastic Workflow:**
```yaml
name: Check IP Threat Level
inputs:
  - name: ip
    type: string

steps:
  - name: lookup_ip
    type: http
    with:
      url: "https://api.threatintel.com/ip/{{ inputs.ip }}"
    on-failure:
      retry:
        max-attempts: 3

  - name: check_risk
    type: if
    condition: steps.lookup_ip.output.data.risk_score > 70
    steps:
      - name: alert_if_risky
        type: http
        with:
          url: "{{ consts.alert_webhook }}"
          body:
            message: "High risk IP: {{ inputs.ip }}"
```

---

## Workflow Lifecycle

### 1. Definition

Workflows are defined as YAML files with a specific structure:

```yaml
name: "Workflow Name"
description: "What this workflow does"
triggers: [...]
consts: {...}
inputs: [...]
steps: [...]
```

### 2. Validation

When a workflow is created or updated, it's validated:

- YAML syntax is correct
- Required fields are present
- Step structure is valid
- References resolve correctly

### 3. Trigger

Workflows start execution when triggered:

- **Manual**: User clicks "Run" in UI or calls API
- **Scheduled**: Runs on a recurring schedule
- **Alert**: Triggered by security alerts

### 4. Execution

Steps execute in sequence (or parallel if configured):

```
[Trigger] → [Step 1] → [Step 2] → [Step 3] → [Complete]
                ↓
           [on-failure: retry or continue]
```

### 5. Completion

Workflow ends in one of three states:

| State | Description |
|-------|-------------|
| **Success** | All steps completed successfully |
| **Failed** | A step failed and was not recovered |
| **Cancelled** | Workflow was manually stopped |

---

## Triggers

Triggers define how and when a workflow starts.

### Manual Trigger

The default trigger type. Workflow runs when explicitly invoked.

```yaml
triggers:
  - type: manual
```

**Use cases:**
- On-demand investigations
- Ad-hoc enrichment
- Testing and development

### Scheduled Trigger

Runs on a recurring schedule using rrule (recurrence rule) expressions.

```yaml
triggers:
  - type: scheduled
    with:
      every: "6h"  # Every 6 hours
```

**Common schedules:**

| Cron | Description |
|------|-------------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 9 * * 1` | Weekly on Monday at 9 AM |
| `0 0 1 * *` | Monthly on the 1st |

**Use cases:**
- Periodic threat hunting
- Scheduled report generation
- Regular data cleanup

### Alert Trigger

Executes automatically when a security alert is triggered by a detection rule.

```yaml
triggers:
  - type: alert
    with:
      rule_name: "Critical Security Alert"
```

**Use cases:**
- Alert-driven response
- External system integration
- Real-time event handling

### Multiple Triggers

A single workflow can have multiple triggers:

```yaml
triggers:
  - type: manual
  - type: scheduled
    with:
      every: "1d"  # Daily
  - type: alert
    with:
      rule_name: "Emergency Alert"
```

---

## Steps and Actions

Steps are the building blocks of workflows. Each step performs a single action.

### Step Anatomy

```yaml
- name: unique_step_name     # Identifier for this step
  type: action.type          # What action to perform
  with:                      # Parameters for the action
    param1: value1
    param2: value2
  on-failure:                # Error handling (optional)
    continue: true
```

### Core Action Types

#### Console (Logging)

```yaml
- name: log_message
  type: console
  with:
    message: "Processing alert: {{ inputs.alert_id }}"
```

#### HTTP (API Calls)

```yaml
- name: call_api
  type: http
  with:
    url: "https://api.example.com/data"
    method: POST
    headers:
      Authorization: "Bearer {{ consts.token }}"
    body:
      query: "{{ inputs.search_term }}"
```

#### Elasticsearch Search

```yaml
- name: search_logs
  type: elasticsearch.search
  with:
    index: "logs-*"
    size: 100
    query:
      bool:
        must:
          - match:
              event.action: "login_failure"
```

#### Elasticsearch Index

```yaml
- name: store_result
  type: elasticsearch.index
  with:
    index: "workflow-results"
    document:
      timestamp: "{{ now }}"
      result: "{{ steps.analyze.output.verdict }}"
```

#### Kibana Cases

```yaml
- name: create_case
  type: kibana.cases
  with:
    action: create
    title: "Incident: {{ inputs.incident_name }}"
    severity: high
    tags:
      - automated
```

---

## Data Flow

Data flows through a workflow via variables and step outputs.

### Data Sources

```
┌─────────────────────────────────────────────────────────┐
│                      Workflow                            │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  consts  │  │  inputs  │  │   env    │              │
│  │ (static) │  │(runtime) │  │ (system) │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │             │             │                     │
│       └─────────────┼─────────────┘                     │
│                     ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   Step 1                         │   │
│  │  Input: {{ consts.api_url }}, {{ inputs.ip }}   │   │
│  │  Output: stored in steps.step1.output           │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        ▼                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   Step 2                         │   │
│  │  Input: {{ steps.step1.output.data }}           │   │
│  │  Output: stored in steps.step2.output           │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        ▼                                │
│                   [Continue...]                         │
└─────────────────────────────────────────────────────────┘
```

### Accessing Step Outputs

Each step's output is accessible to subsequent steps:

```yaml
steps:
  - name: fetch_user
    type: http
    with:
      url: "{{ consts.api }}/users/{{ inputs.user_id }}"
  
  - name: log_user
    type: console
    with:
      message: |
        User: {{ steps.fetch_user.output.data.name }}
        Email: {{ steps.fetch_user.output.data.email }}
        Role: {{ steps.fetch_user.output.data.role }}
```

### Output Structure

HTTP action outputs include:

```yaml
steps.http_step.output:
  status: 200
  headers:
    content-type: "application/json"
  data:
    # Response body (parsed JSON)
    key: value
```

Elasticsearch search outputs include:

```yaml
steps.search_step.output:
  hits:
    total:
      value: 42
    hits:
      - _id: "doc1"
        _source:
          field: value
```

---

## Variables and Templates

### Template Syntax

Use double curly braces for variable substitution:

```yaml
"{{ variable.path }}"
```

### Variable Contexts

| Context | Description | Example |
|---------|-------------|---------|
| `consts` | Workflow constants | `{{ consts.api_key }}` |
| `inputs` | Runtime inputs | `{{ inputs.target_ip }}` |
| `steps` | Step outputs | `{{ steps.search.output.hits }}` |
| `foreach` | Loop context | `{{ foreach.item }}` |
| `env` | Environment | `{{ env.HOME }}` |
| `now` | Current timestamp | `{{ now }}` |

### String Operations

```yaml
# Concatenation
url: "{{ consts.base }}/{{ inputs.path }}"

# Multi-line (YAML block scalar)
message: |
  Alert Summary:
  - IP: {{ inputs.ip }}
  - Severity: {{ inputs.severity }}
  - Time: {{ now }}
```

### Liquid Templating

Workflows use [Liquid](https://shopify.github.io/liquid/) as the templating language. Liquid provides powerful filters and control flow for dynamic content.

### Filters

Apply transformations to values using the pipe (`|`) operator:

```yaml
# Chain multiple filters
message: "{{ inputs.name | strip | upcase }}"

# With arguments
short_desc: "{{ description | truncate: 50 }}"
```

#### String Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `upcase` / `downcase` | Change case | `{{ "Hello" \| downcase }}` → `hello` |
| `capitalize` | Capitalize first letter | `{{ "hello" \| capitalize }}` → `Hello` |
| `strip` | Remove whitespace | `{{ "  text  " \| strip }}` → `text` |
| `truncate` | Shorten string | `{{ text \| truncate: 20 }}` → `"This is a long..."` |
| `truncatewords` | Limit word count | `{{ text \| truncatewords: 5 }}` |
| `replace` | Replace substring | `{{ "hello" \| replace: "l", "L" }}` → `heLLo` |
| `remove` | Remove substring | `{{ "hello" \| remove: "l" }}` → `heo` |
| `split` | String to array | `{{ "a,b,c" \| split: "," }}` → `["a","b","c"]` |
| `append` / `prepend` | Add to string | `{{ "world" \| prepend: "hello " }}` |
| `slice` | Extract substring | `{{ "hello" \| slice: 0, 3 }}` → `hel` |
| `strip_html` | Remove HTML tags | `{{ "<b>text</b>" \| strip_html }}` → `text` |

#### Array Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `size` | Get length | `{{ items \| size }}` → `5` |
| `first` / `last` | Get first/last item | `{{ items \| first }}` |
| `join` | Array to string | `{{ tags \| join: ", " }}` → `"a, b, c"` |
| `map` | Extract property | `{{ users \| map: "name" }}` → `["Alice", "Bob"]` |
| `where` | Filter by property | `{{ items \| where: "status", "active" }}` |
| `where_exp` | Filter by expression | `{{ items \| where_exp: "item.price > 100" }}` |
| `find` | Find first match | `{{ items \| find: "id", "123" }}` |
| `find_exp` | Find by expression | `{{ items \| find_exp: "item.score > 90" }}` |
| `sort` | Sort array | `{{ items \| sort: "name" }}` |
| `sort_natural` | Case-insensitive sort | `{{ items \| sort_natural }}` |
| `reverse` | Reverse order | `{{ items \| reverse }}` |
| `uniq` | Remove duplicates | `{{ items \| uniq }}` |
| `compact` | Remove nulls | `{{ items \| compact }}` |
| `concat` | Merge arrays | `{{ arr1 \| concat: arr2 }}` |
| `push` / `unshift` | Add to array | `{{ items \| push: "new" }}` |
| `pop` / `shift` | Remove from array | `{{ items \| pop }}` |
| `reject` | Remove matching | `{{ items \| reject: "type", "spam" }}` |
| `reject_exp` | Remove by expression | `{{ items \| reject_exp: "item.score < 10" }}` |
| `has` | Check for property | `{{ items \| has: "status", "active" }}` → `true` |
| `has_exp` | Check by expression | `{{ items \| has_exp: "item.price > 100" }}` |
| `group_by` | Group by property | `{{ items \| group_by: "category" }}` |

#### Math Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `plus` / `minus` | Add/subtract | `{{ 5 \| plus: 3 }}` → `8` |
| `times` / `divided_by` | Multiply/divide | `{{ 10 \| divided_by: 2 }}` → `5` |
| `modulo` | Remainder | `{{ 5 \| modulo: 3 }}` → `2` |
| `abs` | Absolute value | `{{ -5 \| abs }}` → `5` |
| `ceil` / `floor` | Round up/down | `{{ 4.3 \| ceil }}` → `5` |
| `round` | Round | `{{ 4.5 \| round }}` → `5` |
| `at_least` / `at_most` | Clamp value | `{{ 3 \| at_least: 5 }}` → `5` |

#### Date Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `date` | Format date | `{{ "now" \| date: "%Y-%m-%d" }}` → `2024-01-15` |
| `date_to_string` | Human-readable date | `{{ date \| date_to_string }}` |
| `date_to_rfc822` | RFC822 format | `{{ date \| date_to_rfc822 }}` |
| `date_to_xmlschema` | ISO 8601 format | `{{ date \| date_to_xmlschema }}` |

**Common date format codes:**

| Code | Description | Example |
|------|-------------|---------|
| `%Y` | 4-digit year | `2024` |
| `%m` | Month (01-12) | `01` |
| `%d` | Day (01-31) | `15` |
| `%H` | Hour (00-23) | `14` |
| `%M` | Minute (00-59) | `30` |
| `%S` | Second (00-59) | `45` |

#### Encoding Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `json` | Object to JSON string | `{{ object \| json }}` |
| `json_parse` | JSON string to object | `{{ json_string \| json_parse }}` |
| `url_encode` / `url_decode` | URL encoding | `{{ "hello world" \| url_encode }}` → `hello%20world` |
| `base64_encode` / `base64_decode` | Base64 | `{{ "text" \| base64_encode }}` |
| `xml_escape` | Escape XML chars | `{{ "<tag>" \| xml_escape }}` → `&lt;tag&gt;` |
| `cgi_escape` / `uri_escape` | CGI/URI encoding | `{{ text \| uri_escape }}` |

#### Utility Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `default` | Fallback value | `{{ name \| default: "Unknown" }}` |
| `slugify` | URL-safe string | `{{ "Hello World!" \| slugify }}` → `hello-world` |
| `normalize_whitespace` | Clean whitespace | `{{ "  too   much  " \| normalize_whitespace }}` |
| `number_of_words` | Count words | `{{ "hello world" \| number_of_words }}` → `2` |

### Control Flow Tags

#### Conditionals

```yaml
message: |
  {%- if steps.check.output.risk_score > 70 -%}
  🚨 HIGH RISK: Immediate action required
  {%- elsif steps.check.output.risk_score > 40 -%}
  ⚠️ MEDIUM RISK: Investigation recommended
  {%- else -%}
  ✅ LOW RISK: No action needed
  {%- endif -%}
```

#### Unless (Negative Conditional)

```yaml
message: |
  {%- unless user.banned -%}
  Welcome, {{ user.name }}!
  {%- endunless -%}
```

#### Case/When (Switch Statement)

```yaml
message: |
  {%- case event.severity -%}
    {%- when "critical" -%}
    🔴 CRITICAL: Escalate immediately
    {%- when "high" -%}
    🟠 HIGH: Investigate within 1 hour
    {%- when "medium" -%}
    🟡 MEDIUM: Review within 24 hours
    {%- else -%}
    🟢 LOW: Monitor and review
  {%- endcase -%}
```

#### For Loops

```yaml
message: |
  Alerts found:
  {%- for alert in event.alerts -%}
  - {{ alert.rule.name }} ({{ alert.severity }})
  {%- endfor -%}
```

**Loop variables:**

| Variable | Description |
|----------|-------------|
| `forloop.index` | Current iteration (1-based) |
| `forloop.index0` | Current iteration (0-based) |
| `forloop.first` | Is first iteration? |
| `forloop.last` | Is last iteration? |
| `forloop.length` | Total iterations |

#### Variable Assignment

```yaml
message: |
  {%- assign severity = event.alerts[0].severity -%}
  {%- assign count = event.alerts | size -%}
  Found {{ count }} alerts, highest severity: {{ severity }}
```

#### Capture (Build Strings)

```yaml
message: |
  {%- capture summary -%}
  Alert: {{ event.rule.name }}
  Host: {{ event.host.name }}
  User: {{ event.user.name | default: "unknown" }}
  {%- endcapture -%}
  {{ summary }}
```

### Whitespace Control

Use `-` to trim whitespace:

```yaml
# Without whitespace control (adds newlines)
{% if condition %}
  content
{% endif %}

# With whitespace control (clean output)
{%- if condition -%}
content
{%- endif -%}
```

### Liquid Block Syntax

For complex logic, use the `liquid` tag to write multiple statements:

```yaml
message: |
  {%- liquid
    assign high_alerts = event.alerts | where_exp: "item.severity == 'high'"
    assign high_count = high_alerts | size
    
    if high_count > 0
      echo "⚠️ " | append: high_count | append: " high severity alerts"
    else
      echo "✅ No high severity alerts"
    endif
  -%}
```

### Practical Examples

#### Build a Formatted Report

```yaml
message: |
  {%- assign total = steps.search.output.hits.total.value -%}
  {%- assign results = steps.search.output.hits.hits -%}
  
  === Search Results ({{ total }} found) ===
  
  {%- for hit in results -%}
  {{ forloop.index }}. {{ hit._source.name }}
     Score: {{ hit._score | round: 2 }}
     Category: {{ hit._source.category | default: "Uncategorized" }}
  {% endfor -%}
  
  {%- if total == 0 -%}
  No results matched your query.
  {%- endif -%}
```

#### Dynamic URL Construction

```yaml
url: |
  {%- assign base = consts.api_url -%}
  {%- assign query = inputs.search_term | url_encode -%}
  {%- assign limit = inputs.limit | default: 100 -%}
  {{ base }}/search?q={{ query }}&limit={{ limit }}
```

#### Conditional API Parameters

```yaml
body:
  query: "{{ inputs.query }}"
  filters: |
    {%- liquid
      assign filters = ""
      if inputs.start_date
        assign filters = filters | append: "date>=" | append: inputs.start_date
      endif
      if inputs.severity
        if filters != ""
          assign filters = filters | append: " AND "
        endif
        assign filters = filters | append: "severity:" | append: inputs.severity
      endif
      echo filters
    -%}
```

---

## Control Flow

### Sequential Execution

By default, steps run in order:

```yaml
steps:
  - name: step1
    type: console
    with:
      message: "First"
  
  - name: step2  # Runs after step1
    type: console
    with:
      message: "Second"
```

### Explicit Dependencies

Use `requires` for complex dependencies:

```yaml
steps:
  - name: fetch_a
    type: http
    with:
      url: "{{ consts.url_a }}"
  
  - name: fetch_b
    type: http
    with:
      url: "{{ consts.url_b }}"
  
  - name: combine
    type: console
    # Steps execute sequentially; this runs after parallel branches complete
    with:
      message: "A: {{ steps.fetch_a.output }}, B: {{ steps.fetch_b.output }}"
```

### Foreach Loops

Process arrays of items:

```yaml
steps:
  - name: get_alerts
    type: elasticsearch.search
    with:
      index: ".alerts-*"
  
  - name: process_alerts
    type: foreach
    with:
      items: "{{ steps.get_alerts.output.hits.hits }}"
    steps:
      - name: enrich
        type: http
        with:
          url: "{{ consts.enrich_api }}/{{ foreach.item._source.source.ip }}"
      
      - name: log
        type: console
        with:
          message: "Enriched: {{ foreach.item._id }}"
```

### Foreach Context Variables

| Variable | Description |
|----------|-------------|
| `foreach.item` | Current item |
| `foreach.index` | Current index (0-based) |
| `foreach.first` | Is first item? (boolean) |
| `foreach.last` | Is last item? (boolean) |

### Conditional Execution

Skip steps based on conditions:

```yaml
steps:
  - name: check_severity
    type: console
    with:
      message: "Severity: {{ inputs.severity }}"
  
  - name: check_severity
    type: if
    condition: 'inputs.severity: "high"'
    steps:
      - name: high_severity_action
        type: kibana.cases
        with:
          action: create
          title: "High Severity Alert"
```

---

## Error Handling

### Default Behavior

By default, if a step fails, the workflow stops.

### Retry Configuration

Automatically retry failed steps:

```yaml
- name: api_call
  type: http
  with:
    url: "{{ consts.flaky_api }}"
  on-failure:
    retry:
      max-attempts: 3    # Try up to 3 times
      delay: 5s          # Wait 5 seconds between attempts
```

### Continue on Failure

Allow workflow to proceed even if a step fails:

```yaml
- name: optional_enrichment
  type: http
  with:
    url: "{{ consts.enrichment_api }}"
  on-failure:
    continue: true  # Proceed to next step even if this fails
```

### Checking Step Status

After a step with `continue: true`, check if it succeeded:

```yaml
- name: enrichment
  type: http
  with:
    url: "{{ consts.api }}"
  on-failure:
    continue: true

- name: check_enrichment
  type: if
  condition: 'steps.enrichment.status: "success"'
  steps:
    - name: use_enrichment
      type: console
      with:
        message: "Enrichment data: {{ steps.enrichment.output.data }}"
  else:
    - name: fallback
      type: console
      with:
        message: "Enrichment unavailable, using defaults"
```

---

## Best Practices

### 1. Use Descriptive Names

```yaml
# ❌ Bad
- name: step1
  type: http

# ✅ Good
- name: lookup_ip_reputation
  type: http
```

### 2. Document with Comments

```yaml
# =============================================================================
# Workflow: Alert Triage
# Purpose: Automatically triage and enrich security alerts
# Author: Security Team
# =============================================================================

name: Alert Triage

# CONSTANTS - Update these for your environment
consts:
  virustotal_api_key: "YOUR_KEY"  # Get from VirusTotal dashboard
```

### 3. Use Constants for Configuration

```yaml
# ❌ Bad - Hardcoded values scattered throughout
steps:
  - name: call_api
    type: http
    with:
      url: "https://api.virustotal.com/v3/files"
      headers:
        x-apikey: "abc123"

# ✅ Good - Centralized configuration
consts:
  virustotal_url: "https://api.virustotal.com/v3"
  virustotal_key: "abc123"

steps:
  - name: call_api
    type: http
    with:
      url: "{{ consts.virustotal_url }}/files"
      headers:
        x-apikey: "{{ consts.virustotal_key }}"
```

### 4. Handle Errors Gracefully

```yaml
# Add retries for external API calls
- name: external_api
  type: http
  with:
    url: "{{ consts.api_url }}"
  on-failure:
    retry:
      max-attempts: 3
      delay: 2s
    continue: true  # Don't fail entire workflow

# Check if previous step succeeded
- name: check_result
  type: if
  condition: 'steps.external_api.status: "success"'
  steps:
    - name: use_result
      type: console
      with:
        message: "Got result: {{ steps.external_api.output.data }}"
```

### 5. Limit Foreach Scope

```yaml
# ❌ Bad - Processing unlimited items
- name: process_all
  type: foreach
  with:
    items: "{{ steps.search.output.hits.hits }}"

# ✅ Good - Limit search results
- name: search
  type: elasticsearch.search
  with:
    index: "alerts-*"
    size: 100  # Reasonable limit
```

### 6. Use Meaningful Inputs

```yaml
inputs:
  - name: target_ip
    type: string
    description: "The IP address to investigate for threats"
    required: true
  
  - name: severity_threshold
    type: number
    description: "Minimum severity level (1-10) to trigger alerts"
    default: 7
    required: false
```

---

*For the complete schema reference, see [schema.md](./schema.md).*

