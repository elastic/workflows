# Workflow YAML Schema Reference

This document provides a complete reference for the Elastic Workflow YAML schema.

---

## Table of Contents

- [Overview](#overview)
- [Required Fields](#required-fields)
- [Optional Fields](#optional-fields)
- [Step Structure](#step-structure)
- [Action Types](#action-types)
- [Variable Syntax](#variable-syntax)
- [Validation Rules](#validation-rules)
- [Common Patterns](#common-patterns)

---

## Overview

Elastic Workflows use YAML to define automated security operations. Each workflow is a declarative configuration that specifies:

- **What** actions to perform (steps)
- **When** to execute (triggers)
- **With what** parameters (inputs, constants)
- **How** to handle errors (on-failure)

### Minimal Valid Workflow

```yaml
name: "Minimal Workflow"
steps:
  - name: "Log Message"
    type: console
    with:
      message: "Hello, World!"
```

---

## Required Fields

### `name` (string)

The human-readable name of the workflow.

```yaml
name: "My Security Workflow"
```

**Requirements:**
- Must be a non-empty string
- Should be descriptive and unique
- Used for display in Kibana UI

### `steps` (array)

An array of workflow steps. Must contain at least one step.

```yaml
steps:
  - name: "First Step"
    type: "console"
    with:
      message: "Executing first step"
  
  - name: "Second Step"
    type: "http"
    with:
      url: "https://api.example.com"
```

**Requirements:**
- Must be a non-empty array
- Each step must be a valid step object
- Steps execute in order by default

---

## Optional Fields

### `description` (string)

Detailed description of what the workflow does.

```yaml
description: |
  This workflow monitors for suspicious login attempts,
  enriches alerts with threat intelligence, and creates
  cases for high-severity incidents.
```

### `tags` (array of strings)

Categories and labels for organizing workflows.

```yaml
tags:
  - security
  - detection
  - threat-intel
  - production
```

**Usage:**
- Used for filtering and searching in the UI
- Helps categorize workflows by purpose
- Recommended: 3-8 tags per workflow

### `triggers` (array)

Defines how the workflow is triggered. If omitted, defaults to manual trigger.

```yaml
triggers:
  # Manual trigger (executed on demand)
  - type: manual
  
  # Scheduled trigger (simple interval)
  - type: scheduled
    with:
      every: "6h"  # Every 6 hours
  
  # Alert trigger
  - type: alert
    with:
      rule_name: "High severity alerts"
```

#### Trigger Types

| Type | Description | Configuration |
|------|-------------|---------------|
| `manual` | Executed on demand via UI or API | None required |
| `scheduled` | Runs on a recurring schedule | `every`: simple interval (e.g., "5m", "2h") or `rrule`: with `freq`, `interval` |
| `alert` | Triggered by security alerts | `rule_id` or `rule_name` (optional) |

#### Scheduled Trigger Formats

**Simple interval format (`every`):**
```yaml
- type: scheduled
  with:
    every: "5m"   # Every 5 minutes
    every: "2h"   # Every 2 hours
    every: "1d"   # Every day
    every: "30s"  # Every 30 seconds
```

**Recurrence rule format (`rrule`):**
```yaml
- type: scheduled
  with:
    rrule:
      freq: DAILY          # DAILY, WEEKLY, or MONTHLY
      interval: 1          # Run every N freq periods
      tzid: "UTC"          # Timezone (optional)
      dtstart: "2025-01-01T09:00:00.000Z"  # Start time (optional)
      byhour: [9, 17]      # Specific hours (optional)
      byweekday: ["MO", "TU", "WE", "TH", "FR"]  # Specific days (optional)
```

### `trigger` (string or object)

Alternative to `triggers` for single trigger workflows.

```yaml
# String form
trigger: manual

# Object form
trigger:
  type: scheduled
  with:
    rrule:
      freq: DAILY
      interval: 1
```

### `consts` (object)

Workflow-level constants. Values that don't change between executions.

```yaml
consts:
  # API configuration
  api_base_url: "https://api.virustotal.com/v3"
  api_key: "your-api-key-here"
  
  # Threshold values
  severity_threshold: 7
  max_results: 100
  
  # Index patterns
  alerts_index: ".alerts-security*"
```

**Usage in steps:**
```yaml
steps:
  - name: query_api
    type: http
    with:
      url: "{{ consts.api_base_url }}/files"
      headers:
        x-apikey: "{{ consts.api_key }}"
```

### `inputs` (object or array)

Parameters provided at workflow execution time.

```yaml
# Array form (recommended)
inputs:
  - name: target_ip
    type: string
    description: The IP address to investigate
    required: true
  
  - name: severity
    type: number
    description: Minimum severity level
    default: 5
    required: false

# Object form
inputs:
  target_ip:
    type: string
    required: true
  severity:
    type: number
    default: 5
```

#### Input Field Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Input identifier |
| `type` | string | Data type: `string`, `integer`, `boolean`, `array`, `object` |
| `description` | string | Human-readable description |
| `required` | boolean | Whether input must be provided |
| `default` | any | Default value if not provided |

**Usage in steps:**
```yaml
steps:
  - name: search
    type: elasticsearch.search
    with:
      query: "source.ip: {{ inputs.target_ip }}"
```

### `outputs` (object)

Define workflow outputs for use by other systems.

```yaml
outputs:
  threat_score:
    value: "{{ steps.analyze.output.score }}"
  is_malicious:
    value: "{{ steps.analyze.output.verdict == 'malicious' }}"
```

### `settings` (object)

Workflow-level settings and configuration.

```yaml
settings:
  timeout: 300s        # Maximum execution time
  max_retries: 3       # Global retry count
  log_level: debug     # Logging verbosity
```

---

## Step Structure

Each step in the `steps` array must follow this structure:

```yaml
- name: "Step Name"            # Required: unique identifier
  type: "action.type"          # Required: action to perform
  with:                        # Optional: action parameters
    param1: "value1"
    param2: "value2"
  on-failure:                  # Optional: error handling
    continue: true
    retry:
      max-attempts: 3
      delay: 5s
```

### Step Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Unique step identifier |
| `type` | Yes | string | Action type to execute |
| `with` | No | object | Parameters for the action |
| `on-failure` | No | object | Error handling configuration |
| `foreach` | No | string | Iterate over a collection |
| `timeout` | No | string | Step timeout (e.g., "30s") |

#### Control Flow Steps

For conditional logic, use `type: if`:

```yaml
- name: check_condition
  type: if
  condition: steps.previous.output.value > 10
  steps:
    - name: action_if_true
      type: http
      with:
        url: "{{ consts.url }}"
  else:
    - name: action_if_false
      type: console
      with:
        message: "Condition not met"
```

### Step Dependencies

Control execution order with `requires`:

```yaml
steps:
  - name: fetch_data
    type: elasticsearch.search
    with:
      index: "logs-*"
  
  - name: process_data
    type: console
    with:
      message: "Processing {{ steps.fetch_data.output.hits.total }} documents"
```

### Error Handling

Configure behavior on step failure:

```yaml
on-failure:
  # Retry configuration
  retry:
    max-attempts: 3     # Number of retry attempts
    delay: 5s           # Delay between retries
    condition: 'error.type: "NetworkError"'  # Optional: retry condition
  
  # Continue to next step on failure
  continue: true
  
  # Or fail the entire workflow
  continue: false       # Default behavior
```

### Conditional Execution

Execute steps based on conditions:

```yaml
steps:
  - name: check_severity
    type: console
    with:
      message: "Severity: {{ inputs.severity }}"
  
  - name: check_severity
    type: if
    condition: inputs.severity >= 7
    steps:
      - name: high_severity_action
        type: http
        with:
          url: "{{ consts.alert_url }}"
```

---

## Action Types

### Built-in Actions

| Action | Description |
|--------|-------------|
| `console` | Log a message |
| `http` | Make HTTP requests |
| `elasticsearch.search` | Search Elasticsearch |
| `elasticsearch.index` | Index documents |
| `kibana.request` | Make Kibana API requests |
| `kibana.cases` | Create/update cases |
| `foreach` | Loop over arrays |
| `parallel` | Execute steps in parallel |
| `wait` | Pause execution |

### HTTP Action

```yaml
- name: api_call
  type: http
  with:
    url: "https://api.example.com/endpoint"
    method: POST  # GET, POST, PUT, DELETE, PATCH
    headers:
      Authorization: "Bearer {{ consts.token }}"
      Content-Type: application/json
    body:
      key: "value"
    timeout: 30s
```

### Elasticsearch Search

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
              event.type: "authentication"
          - range:
              "@timestamp":
                gte: "now-1h"
    sort:
      - "@timestamp": desc
```

### Foreach Loop

```yaml
- name: process_items
  type: foreach
  with:
    items: "{{ steps.search.output.hits.hits }}"
  steps:
    - name: process_item
      type: console
      with:
        message: "Processing: {{ foreach.item._id }}"
    
    - name: enrich_item
      type: http
      with:
        url: "{{ consts.enrich_url }}/{{ foreach.item._source.ip }}"
```

### Kibana Cases

```yaml
- name: create_case
  type: kibana.cases
  with:
    action: create
    title: "Security Incident: {{ inputs.incident_name }}"
    description: |
      Automated case created by workflow.
      
      Details:
      - Source IP: {{ steps.search.output.source_ip }}
      - Severity: {{ inputs.severity }}
    tags:
      - automated
      - security
    severity: high
```

---

## Variable Syntax

### Template Syntax

Use double curly braces to reference values:

```yaml
"{{ variable.path }}"
```

### Available Contexts

| Context | Description | Example |
|---------|-------------|---------|
| `consts` | Workflow constants | `{{ consts.api_key }}` |
| `inputs` | Workflow inputs | `{{ inputs.target_ip }}` |
| `steps` | Step outputs | `{{ steps.search.output.hits }}` |
| `foreach` | Current loop item | `{{ foreach.item._id }}` |
| `env` | Environment variables | `{{ env.API_KEY }}` |

### Accessing Nested Values

```yaml
# Object properties
{{ steps.search.output.hits.total.value }}

# Array elements
{{ steps.search.output.hits.hits[0]._source }}

# Dynamic keys
{{ steps.lookup.output.data[inputs.key] }}
```

### Filters and Functions

```yaml
# String manipulation
{{ inputs.name | uppercase }}
{{ inputs.query | urlencode }}

# Math operations
{{ steps.count.output.value | plus: 10 }}

# Default values
{{ inputs.optional | default: "fallback" }}

# Conditionals
{% if steps.search.output.hits.total > 0 %}
Found results
{% else %}
No results
{% endif %}
```

---

## Validation Rules

Workflows are validated on upload. The following rules apply:

### Required Validations

1. **Valid YAML Syntax** - Must parse without errors
2. **Name Field** - Must be a non-empty string
3. **Steps Field** - Must be a non-empty array
4. **Step Names** - Each step must have a `name` (non-empty string)
5. **Step Types** - Each step must have `type` or `action` (non-empty string)

### Optional Field Validations

| Field | Validation |
|-------|------------|
| `triggers` | Must be an array if present |
| `trigger` | Must be string or object if present |
| `consts` | Must be an object (not array) if present |
| `inputs` | Must be object or array if present |
| `tags` | Must be array of strings if present |

### Common Validation Errors

```yaml
# ❌ Missing name
steps:
  - name: "Step"
    type: console

# ✅ Fixed
name: "My Workflow"
steps:
  - name: "Step"
    type: console
```

```yaml
# ❌ Step missing type
steps:
  - name: "My Step"
    with:
      message: "Hello"

# ✅ Fixed
steps:
  - name: "My Step"
    type: console
    with:
      message: "Hello"
```

---

## Common Patterns

### API Integration Pattern

```yaml
name: API Integration
consts:
  api_url: "https://api.service.com"
  api_key: "your-key"

steps:
  - name: fetch_data
    type: http
    with:
      url: "{{ consts.api_url }}/data"
      headers:
        Authorization: "Bearer {{ consts.api_key }}"
    on-failure:
      retry:
        max-attempts: 3
        delay: 2s

  - name: process_response
    type: console
    with:
      message: "Received: {{ steps.fetch_data.output.data }}"
```

### Search and Enrich Pattern

```yaml
name: Search and Enrich
steps:
  - name: search_alerts
    type: elasticsearch.search
    with:
      index: ".alerts-*"
      size: 100
      query:
        range:
          "@timestamp":
            gte: "now-1h"

  - name: enrich_alerts
    type: foreach
    with:
      items: "{{ steps.search_alerts.output.hits.hits }}"
    steps:
      - name: lookup_ip
        type: http
        with:
          url: "{{ consts.enrich_api }}/ip/{{ foreach.item._source.source.ip }}"
```

### Conditional Alerting Pattern

```yaml
name: Conditional Alert
inputs:
  - name: threshold
    type: number
    default: 10

steps:
  - name: count_events
    type: elasticsearch.search
    with:
      index: "events-*"
      size: 0
      aggs:
        event_count:
          value_count:
            field: "_id"

  - name: check_threshold
    type: if
    condition: steps.count_events.output.aggregations.event_count.value > inputs.threshold
    steps:
      - name: alert_if_high
        type: http
        with:
          url: "{{ consts.alert_webhook }}"
          method: POST
          body:
            message: "High event count: {{ steps.count_events.output.aggregations.event_count.value }}"
```

---

*For more examples, see the [workflows](../workflows) directory.*

