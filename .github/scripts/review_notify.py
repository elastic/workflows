#!/usr/bin/env python3

# This script checks for open PRs that need review and sends a Slack notification.
# Hardcoded for ingest docs team right now. Can adjust as needed.
import os, requests, urllib.parse, datetime

GH   = os.environ["GITHUB_TOKEN"] # GitHub token will only work for public repos. Will need PAT for private.
SLK  = os.environ["SLACK_WEBHOOK_URL"]
TEAM = "<!subteam^S08R9RDP3D3|ingest-docs-team>"   # pings the ingest-docs team in Slack

query = ("type:pr state:open review:required "
         "team-review-requested:elastic/ingest-docs")
url   = ("https://api.github.com/search/issues?q="
         + urllib.parse.quote_plus(query)
         + "&sort=updated&order=desc&per_page=100")

resp = requests.get(url, headers={
    "Authorization": f"Bearer {GH}",
    "Accept": "application/vnd.github+json"
})
resp.raise_for_status()
prs = resp.json()["items"]

if not prs:  # nothing to do
    exit()

blocks = [{
    "type": "section",
    "text": {"type": "mrkdwn",
             "text": f"<{pr['html_url']}|{pr['title']}> — last touched *{pr['updated_at'][:10]}*"}
} for pr in prs]

payload = {"text": f"{TEAM} {len(prs)} PR(s) need review", "blocks": blocks}
requests.post(SLK, json=payload).raise_for_status()
