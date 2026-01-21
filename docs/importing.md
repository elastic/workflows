# Importing Workflows

This guide explains how to import workflows from this repository into your Elastic/Kibana environment.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Method 1: Kibana UI](#method-1-kibana-ui)
- [Method 2: Kibana API](#method-2-kibana-api)
- [Method 3: Bulk Import Script](#method-3-bulk-import-script)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before importing workflows, ensure you have:

### 1. Kibana Access

- Kibana 9.3 or later with Workflows feature enabled (Via Advanced Settings)
- User with appropriate permissions:

<img width="575" height="560" alt="image" src="https://github.com/user-attachments/assets/c4ed0461-3b39-453e-8d0b-19464e329d4b" />


  - Access to relevant data indices

### 2. API Key (for API imports)

Create an API key in Kibana:

1. Go to **Stack Management → API Keys**
2. Click **Create API key**
3. Configure any relevant permissions
4. Save the generated API key

### 3. Network Access

For API imports, ensure your client can reach the Kibana API endpoint.

---

## Method 1: Kibana UI

The simplest way to import a single workflow.

### Step-by-Step

1. **Navigate to Workflows**
   - Open Kibana
   - Go to **Workflows** in your left hand navigation,  (or **Management → Workflows** if using the classic navigation menu)

2. **Create New Workflow**
   - Click **Create workflow** button

3. **Paste YAML Content**
   - Open the desired workflow file from this repository
   - Copy the entire YAML content
   - Paste into the Kibana editor

4. **Customize Configuration**
   - Update `consts` section with your API keys and URLs
   - Modify inputs as needed for your environment

5. **Validate and Save**
   - Kibana will validate the YAML automatically
   - Fix any validation errors
   - Click **Save**

### Example: Importing Hash Threat Check

1. Open [`workflows/security/detection/hash-threat-check.yaml`](../workflows/security/detection/hash-threat-check.yaml)
2. Copy the content
3. In Kibana, create new workflow and paste
4. Update the VirusTotal API key:
   ```yaml
   consts:
     virustotal_api_key: YOUR_ACTUAL_API_KEY  # Replace this
   ```
5. Save and test

---

## Method 2: Kibana API

Import workflows programmatically using the Kibana REST API.

### Basic API Call

```bash
curl -X POST "https://YOUR_KIBANA_URL/api/workflows" \
  -H "kbn-xsrf: true" \
  -H "x-elastic-internal-origin: Kibana" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -d '{"yaml": "YOUR_YAML_CONTENT"}'
```

### Import from File

```bash
# Read file and escape for JSON
YAML_CONTENT=$(cat workflows/detection/hash-threat-check.yaml)

curl -X POST "https://YOUR_KIBANA_URL/api/workflows" \
  -H "kbn-xsrf: true" \
  -H "x-elastic-internal-origin: Kibana" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -d @- << EOF
{
  "yaml": $(echo "$YAML_CONTENT" | jq -Rs .)
}
EOF
```

### Using jq for Proper Escaping

```bash
# Install jq if not available: brew install jq (macOS) or apt install jq (Linux)

cat workflows/detection/hash-threat-check.yaml | \
  jq -Rs '{yaml: .}' | \
  curl -X POST "https://YOUR_KIBANA_URL/api/workflows" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: Kibana" \
    -H "Content-Type: application/json" \
    -H "Authorization: ApiKey YOUR_API_KEY" \
    -d @-
```

### Python Script

```python
#!/usr/bin/env python3
"""Import a workflow into Kibana."""

import requests
import sys

KIBANA_URL = "https://your-kibana-url"
API_KEY = "your-api-key"

def import_workflow(filepath):
    with open(filepath, 'r') as f:
        yaml_content = f.read()
    
    response = requests.post(
        f"{KIBANA_URL}/api/workflows",
        headers={
            "kbn-xsrf": "true",
            "x-elastic-internal-origin": "Kibana",
            "Content-Type": "application/json",
            "Authorization": f"ApiKey {API_KEY}"
        },
        json={"yaml": yaml_content}
    )
    
    if response.ok:
        data = response.json()
        print(f"✅ Imported: {data.get('name', 'Unknown')}")
        print(f"   ID: {data.get('id', 'Unknown')}")
    else:
        print(f"❌ Failed: {response.status_code}")
        print(f"   {response.text}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_workflow.py <workflow.yaml>")
        sys.exit(1)
    
    import_workflow(sys.argv[1])
```

### Node.js Script

```javascript
#!/usr/bin/env node
/**
 * Import a workflow into Kibana
 */

const fs = require('fs');
const https = require('https');

const KIBANA_URL = 'https://your-kibana-url';
const API_KEY = 'your-api-key';

async function importWorkflow(filepath) {
  const yaml = fs.readFileSync(filepath, 'utf-8');
  
  const url = new URL('/api/workflows', KIBANA_URL);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'Kibana',
      'Content-Type': 'application/json',
      'Authorization': `ApiKey ${API_KEY}`
    },
    body: JSON.stringify({ yaml })
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log(`✅ Imported: ${data.name}`);
    console.log(`   ID: ${data.id}`);
  } else {
    console.error(`❌ Failed: ${response.status}`);
    console.error(`   ${await response.text()}`);
  }
}

const filepath = process.argv[2];
if (!filepath) {
  console.log('Usage: node import_workflow.js <workflow.yaml>');
  process.exit(1);
}

importWorkflow(filepath);
```

---

## Method 3: Bulk Import Script

Import multiple workflows at once.

### Bash Script

```bash
#!/bin/bash
# bulk_import.sh - Import all workflows from a directory

KIBANA_URL="${KIBANA_URL:-https://your-kibana-url}"
API_KEY="${API_KEY:-your-api-key}"
WORKFLOW_DIR="${1:-workflows}"

import_workflow() {
  local file="$1"
  echo "Importing: $file"
  
  local response
  response=$(cat "$file" | jq -Rs '{yaml: .}' | \
    curl -s -X POST "${KIBANA_URL}/api/workflows" \
      -H "kbn-xsrf: true" \
      -H "x-elastic-internal-origin: Kibana" \
      -H "Content-Type: application/json" \
      -H "Authorization: ApiKey ${API_KEY}" \
      -d @-)
  
  local name
  name=$(echo "$response" | jq -r '.name // "unknown"')
  local id
  id=$(echo "$response" | jq -r '.id // "error"')
  
  if [ "$id" != "error" ] && [ "$id" != "null" ]; then
    echo "  ✅ Success: $name (ID: $id)"
  else
    echo "  ❌ Failed: $(echo "$response" | jq -r '.error // .message // "Unknown error"')"
  fi
}

# Find all YAML files
find "$WORKFLOW_DIR" -name "*.yaml" -type f | while read -r file; do
  import_workflow "$file"
  sleep 0.5  # Rate limiting
done

echo ""
echo "Import complete!"
```

### Usage

```bash
# Import all workflows
./bulk_import.sh workflows/

# Import specific category
./bulk_import.sh workflows/detection/

# With environment variables
KIBANA_URL=https://my-kibana.example.com API_KEY=abc123 ./bulk_import.sh
```

### Python Bulk Import

```python
#!/usr/bin/env python3
"""Bulk import workflows into Kibana."""

import os
import sys
import time
import requests
from pathlib import Path

KIBANA_URL = os.environ.get("KIBANA_URL", "https://your-kibana-url")
API_KEY = os.environ.get("API_KEY", "your-api-key")

def import_workflow(filepath):
    """Import a single workflow."""
    with open(filepath, 'r') as f:
        yaml_content = f.read()
    
    response = requests.post(
        f"{KIBANA_URL}/api/workflows",
        headers={
            "kbn-xsrf": "true",
            "x-elastic-internal-origin": "Kibana",
            "Content-Type": "application/json",
            "Authorization": f"ApiKey {API_KEY}"
        },
        json={"yaml": yaml_content},
        timeout=30
    )
    
    return response

def bulk_import(directory):
    """Import all workflows from a directory."""
    workflow_dir = Path(directory)
    yaml_files = list(workflow_dir.rglob("*.yaml"))
    
    print(f"Found {len(yaml_files)} workflow files")
    print()
    
    success = 0
    failed = 0
    
    for filepath in yaml_files:
        # Skip README files
        if filepath.name == "README.md":
            continue
            
        print(f"Importing: {filepath}")
        
        try:
            response = import_workflow(filepath)
            
            if response.ok:
                data = response.json()
                print(f"  ✅ Success: {data.get('name', 'Unknown')}")
                success += 1
            else:
                print(f"  ❌ Failed: {response.status_code}")
                error = response.json() if response.text else {}
                print(f"     {error.get('error', error.get('message', response.text[:100]))}")
                failed += 1
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed += 1
        
        time.sleep(0.5)  # Rate limiting
    
    print()
    print(f"Import complete: {success} succeeded, {failed} failed")

if __name__ == "__main__":
    directory = sys.argv[1] if len(sys.argv) > 1 else "workflows"
    bulk_import(directory)
```

---

## Customization

Before importing, customize workflows for your environment.

### 1. Update API Keys

Replace placeholder values in `consts`:

```yaml
# Before
consts:
  virustotal_api_key: API-KEY
  slack_webhook: https://hooks.slack.com/...

# After
consts:
  virustotal_api_key: abcd1234efgh5678  # Your actual key
  slack_webhook: https://hooks.slack.com/services/T00/B00/XXX
```

### 2. Update Elasticsearch Indices

Modify index patterns for your environment:

```yaml
# Before
with:
  index: ".alerts-security*"

# After (if using custom index)
with:
  index: "my-company-alerts-*"
```

### 3. Update Kibana URLs

For workflows that make Kibana API calls:

```yaml
consts:
  kibana_url: https://your-kibana-instance.cloud.es.io
```

### 4. Adjust Schedules

Modify cron expressions for your needs:

```yaml
# Every 6 hours (default)
triggers:
  - type: scheduled
    with:
      every: "6h"  # Every 6 hours

# Every hour (more frequent)
triggers:
  - type: scheduled
    with:
      every: "1h"
```

### Customization Script

Automate customization with sed:

```bash
#!/bin/bash
# customize.sh - Replace placeholders before import

INPUT_FILE="$1"
OUTPUT_FILE="$2"

# Read environment variables or use defaults
VT_KEY="${VIRUSTOTAL_KEY:-YOUR_VT_KEY}"
SLACK_HOOK="${SLACK_WEBHOOK:-YOUR_SLACK_WEBHOOK}"
KIBANA="${KIBANA_URL:-https://your-kibana.example.com}"

cat "$INPUT_FILE" | \
  sed "s/API-KEY/${VT_KEY}/g" | \
  sed "s|https://hooks.slack.com/.*|${SLACK_HOOK}|g" | \
  sed "s|https://your-kibana-url|${KIBANA}|g" \
  > "$OUTPUT_FILE"

echo "Customized: $OUTPUT_FILE"
```

---

## Troubleshooting

### Common Errors

#### 1. Invalid YAML Syntax

```
Error: YAML parsing failed
```

**Solution:** Validate YAML with an online validator or `yamllint`:
```bash
yamllint workflows/detection/my-workflow.yaml
```

#### 2. Missing Required Fields

```
Error: Missing or invalid "name" field
Error: Missing or invalid "steps" field
```

**Solution:** Ensure workflow has required fields:
```yaml
name: "Workflow Name"  # Required
steps:                 # Required
  - name: "Step"
    type: console
```

#### 3. Authentication Failed

```
Error: 401 Unauthorized
```

**Solution:** 
- Verify API key is correct
- Check API key has workflow permissions
- Ensure `Authorization: ApiKey` header is correct

#### 3b. Not Found Error (404)

```
Error: 404 Not Found
```

**Solution:**
- Ensure you include the required `x-elastic-internal-origin: Kibana` header
- Verify the API endpoint URL is correct
- Check that you're using the correct Kibana space path (e.g., `/s/my-space/api/workflows`)

#### 4. Permission Denied

```
Error: 403 Forbidden
```

**Solution:**
- User/API key needs `Workflows: All` privilege
- Check Kibana space permissions

#### 5. Rate Limiting

```
Error: 429 Too Many Requests
```

**Solution:**
- Add delays between imports
- Use bulk import with `sleep` between calls

### Validation Before Import

Validate workflows locally before importing:

```bash
# Check YAML syntax
python -c "import yaml; yaml.safe_load(open('workflow.yaml'))"

# Or with Node.js
node -e "require('js-yaml').load(require('fs').readFileSync('workflow.yaml'))"
```

### Debug API Calls

Enable verbose output:

```bash
curl -v -X POST "https://KIBANA_URL/api/workflows" \
  -H "kbn-xsrf: true" \
  -H "x-elastic-internal-origin: Kibana" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey API_KEY" \
  -d '{"yaml": "..."}'
```

---

## Next Steps

After importing workflows:

1. **Test**: Run workflows manually to verify they work
2. **Configure Triggers**: Set up schedules or alert rules as needed
3. **Monitor**: Check workflow execution logs for errors
4. **Iterate**: Refine workflows based on results

---

*For schema details, see [schema.md](./schema.md). For conceptual explanations, see [concepts.md](./concepts.md).*

