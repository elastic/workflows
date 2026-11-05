# Setup — Remediate AWS: Stolen Access Key

This workflow contains a compromised AWS **identity** (not a network path). Network
controls can't stop stolen-credential API calls, so the containment acts on the
principal: deactivate its access keys, revoke already-issued sessions, and quarantine
it. Elastic Workflow steps can't SigV4-sign AWS API calls, so a small, least-privilege
**containment Lambda** in the customer's account performs the IAM mutations; the
workflow invokes it through the `.aws_lambda` connector.

You deploy three things in your own account/Kibana — all included below:

1. The containment **Lambda** (code below).
2. Two **IAM** pieces: the Lambda execution role, and a least-privilege user/role whose
   keys back the `.aws_lambda` connector.
3. The Kibana **`.aws_lambda` connector**, then wire the workflow placeholders.

> **Safety:** these are real, disruptive control-plane changes. Maintain an
> **allowlist** of principals the Lambda must refuse (break-glass, admins, automation),
> prefer **deactivate over delete** (reversible, preserves forensics), and consider
> gating `quarantine_principal` behind a `waitForApproval` step.

---

## 1. Containment Lambda

Validates a shared bearer token, derives the IAM user name from the alert's principal
ARN, and performs the requested action. Refuses any ARN that is not an IAM user or that
matches the allowlist. Runtime: `python3.12`.

```python
import datetime
import json
import os

import boto3

TOKEN = os.environ["CONTAIN_TOKEN"]
# Comma-separated IAM user names the Lambda must NEVER contain (break-glass/admin/automation).
ALLOWLIST = {u.strip() for u in os.environ.get("CONTAIN_ALLOWLIST", "").split(",") if u.strip()}

iam = boto3.client("iam")


def _resp(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"},
            "body": json.dumps(body)}


def _user_from_arn(arn):
    if not arn or ":user/" not in arn:
        return None
    return arn.split(":user/", 1)[1]


def handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("authorization", "") != f"Bearer {TOKEN}":
        return _resp(401, {"error": "unauthorized"})
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _resp(400, {"error": "bad json"})

    action = body.get("action")
    arn = body.get("principal_arn", "")
    uname = _user_from_arn(arn)
    if not uname:
        # Only IAM users are supported here; assumed-role/instance creds need
        # revoke-older-sessions on the ROLE plus host remediation (out of scope).
        return _resp(422, {"error": "not an IAM user arn", "principal_arn": arn})
    if uname in ALLOWLIST:
        return _resp(403, {"error": "refused: principal is allowlisted", "user": uname})

    if action == "deactivate_access_key":
        akid = body.get("access_key_id")
        akids = [akid] if akid else [
            k["AccessKeyId"] for k in iam.list_access_keys(UserName=uname)["AccessKeyMetadata"]]
        for k in akids:
            iam.update_access_key(UserName=uname, AccessKeyId=k, Status="Inactive")
        return _resp(200, {"deactivate_access_key": {"user": uname, "deactivated": akids}})

    if action == "revoke_sessions":
        now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        deny = {"Version": "2012-10-17", "Statement": [
            {"Sid": "AWSRevokeOlderSessions", "Effect": "Deny", "Action": "*", "Resource": "*",
             "Condition": {"DateLessThan": {"aws:TokenIssueTime": now}}}]}
        iam.put_user_policy(UserName=uname, PolicyName="revoke-older-sessions",
                            PolicyDocument=json.dumps(deny))
        return _resp(200, {"revoke_sessions": {"user": uname, "revoked_before": now}})

    if action == "quarantine_principal":
        deny = {"Version": "2012-10-17", "Statement": [
            {"Sid": "QuarantineDenyAll", "Effect": "Deny", "Action": "*", "Resource": "*"}]}
        iam.put_user_policy(UserName=uname, PolicyName="quarantine-deny-all",
                            PolicyDocument=json.dumps(deny))
        return _resp(200, {"quarantine_principal": {"user": uname, "status": "deny-all attached"}})

    return _resp(400, {"error": "unknown action", "action": action})
```

> You can swap the inline `quarantine-deny-all` for the AWS managed
> `AWSCompromisedKeyQuarantineV3` policy (`iam:AttachUserPolicy`) if you prefer AWS's
> curated quarantine set.

---

## 2. IAM

**Lambda execution role** — only the containment actions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "IdentityContainment",
      "Effect": "Allow",
      "Action": [
        "iam:ListAccessKeys",
        "iam:UpdateAccessKey",
        "iam:PutUserPolicy"
      ],
      "Resource": "arn:aws:iam::<account-id>:user/*"
    }
  ]
}
```

> Scope `Resource` further (e.g. a path prefix) if your compromised users live under a
> known IAM path. Do not grant `iam:*`.

**Connector credentials** — a dedicated user/role that can only invoke the function:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeContainmentLambda",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:<region>:<account-id>:function:<containment-function-name>"
    }
  ]
}
```

---

## 3. Deploy (example CLI)

```bash
REGION=us-east-1
FN=aws-stolen-key-containment
TOKEN=$(openssl rand -hex 24)                     # store this; paste into the workflow const
ALLOW="breakglass-admin,ops-automation"           # IAM users the Lambda must never touch

zip -q function.zip lambda_function.py
aws --region "$REGION" lambda create-function \
  --function-name "$FN" --runtime python3.12 --handler lambda_function.handler \
  --role "arn:aws:iam::<account-id>:role/<lambda-exec-role>" \
  --zip-file fileb://function.zip \
  --environment "Variables={CONTAIN_TOKEN=$TOKEN,CONTAIN_ALLOWLIST=$ALLOW}"
```

---

## 4. Kibana connector + workflow wiring

1. **Stack Management → Connectors → Create → AWS Lambda**: set **Region** and the
   access key id / secret of the invoker user from step 2. Note the connector id.
2. In `remediate-aws-stolen-access-key.yaml`, replace the placeholders:
   - `connector-id: "[AWS_LAMBDA_CONNECTOR_ID]"` → your connector id (three steps)
   - `consts.containment_function` → your function name (`$FN`)
   - `consts.containment_token` → the `$TOKEN` value (prefer a secret reference)
   - `consts.rule_id` → the AWS rule(s) that identify compromised principals
3. Enable the workflow (ships `enabled: false`) and/or attach it as a "Run workflow"
   action on the rule.

### Connector contract (important)

The `.aws_lambda` connector delivers the step's **`payload` object** as the Lambda
event — it serializes it to JSON for you. Do **not** pass the event as a `body`
*string*; that is sent as `{}` and the Lambda returns `unauthorized`. Each containment
step therefore uses:

```yaml
with:
  functionName: "{{ consts.containment_function }}"
  payload:
    headers:
      authorization: "Bearer {{ consts.containment_token }}"
    body: '{"action":"deactivate_access_key","principal_arn":"{{ foreach.item.fields.rt_principal_arn[0] }}"}'
```

### Why the correlation uses a DSL search, not ES|QL

ES|QL over `.alerts-security.alerts-*` cannot read passthrough fields such as
`aws.cloudtrail.user_identity.arn` (they are in `_source` but not mapped as ES|QL
columns, which raises `verification_exception`). The workflow uses an
`elasticsearch.request` `_search` with **runtime fields** to project the ARN and
identity type into clean, dotless keys (`rt_principal_arn`, `rt_principal_type`).

### Scope / limits

- Handles **IAM user** principals. Assumed-role / instance-profile creds are temporary
  and can't be deactivated — contain those with `revoke_sessions` on the **role** plus
  host remediation (stop/replace instance, require IMDSv2); not performed here.
- IP/NACL blocking is intentionally **not** used: stolen-credential API calls hit the
  AWS API endpoints and never cross your subnets, so a NACL can't see them.
