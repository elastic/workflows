# workflows

## Dev docs builder

Calling workflow:

```yml
name: Dev docs
on:
  pull_request_target:
    paths:
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.png'
      - '**.gif'
    types: [closed, opened, synchronize, reopened]

env:
  DOC_DIR: 

jobs:
  internal-docs:
    uses: elastic/workflows/.github/workflows/dev-docs-builder.yml@main
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_DEV: ${{ secrets.VERCEL_PROJECT_ID_DOCS_DEV }}
```


```yml
name: Preview & publish Elastic docs

on:
  pull_request_target:
    paths:
    # Change docs dir to your repos docs dir
      - 'docs/**.mdx'
      - 'docs/**.docnav.json'
      - 'docs/**.docapi.json'
      - 'docs/**.devdocs.json'
      - 'docs/**.jpg'
      - 'docs/**.jpeg'
      - 'docs/**.png'
      - 'docs/**.gif'
    types: [closed, opened, synchronize, reopened]

jobs:
  prepare:
    uses: elastic/workflows/.github/workflows/co-docs-a-prepare.yml@v1
    with:
      # Prebuild is wordlake or wordlake-dev
      prebuild: wordlake
      # Repo is docs.elastic.co or docs.elastic.dev
      repo: docs.elastic.co
  
  portal:
    uses: elastic/workflows/.github/workflows/co-docs-b-portal.yml@v1
    with:
      # Indicate whether prebuild is wordlake or wordlake-dev
      prebuild: wordlake
    secrets:
      token: ${{ secrets.VERCEL_GITHUB_TOKEN }}
  
  preview:
    uses: elastic/workflows/.github/workflows/co-docs-c-preview.yml@v1
    with:
      project-name: docs-elastic-co
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_CO }}
  
  deploy:
    uses: elastic/workflows/.github/workflows/co-docs-d-deploy.yml@v1
    with:
      prebuild: wordlake
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
```