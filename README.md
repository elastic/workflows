test
# workflows

:wave: Contains public GitHub Action workflows
## Elastic docs

Elastic docs require that we install an "agent" in each content source.

A content source is a repository which contains MDX files across a given topic.

There are two contexts, internal & external docs. 

Each pairs with a "separate" web app.

The webapps are built by Vercel, and as a result we get 2x "prod" instances.

Before prod is built in each instance, we need to:

1. Organize contents 
2. Test contents
3. Create a PR preview
4. Transform content
5. Ship content

This step-sequence gives us space to do "whatever we need" to the content.

After agent installation, requires token access.

After token access, new PRs will trigger the Action.

🏴‍☠️Successful PRs are **required** for building to prod.

⚠️ Merging to main will not trigger a build.

### Dev docs builder, calling workflow

Change values as needed.

For example, if you do not have a docs dir, use the correct dir or no dir instead.

Install as `.github/workflows/dev-docs-builder.yml` in the content source.

:wave: Provide the content source access to the Vercel_ tokens.

```yml
name: Elastic dev docs

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
      - 'docs/**.svg'
      - 'docs/**.gif'
    types: [opened, closed, synchronize]

jobs:
  publish:
    uses: elastic/workflows/.github/workflows/docs-elastic-dev-publish.yml@main
    with:
      # Refers to Vercel project
      project-name: docs-elastic-dev
      # Which prebuild step (dev or not)
      prebuild: wordlake-dev
      # Docsmobile project dir
      repo: docs.elastic.dev
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_DEV: ${{ secrets.VERCEL_PROJECT_ID_DOCS_DEV }}
```


### Public docs builder, calling workflow

Change values as needed.

For example, if you do not have a docs dir, use the correct dir or no dir instead.

Install as `.github/workflows/co-docs-builder.yml` in content source.

:wave: Provide the content source access to the Vercel_ tokens.

```yml
name: Elastic docs

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
      - 'docs/**.svg'
      - 'docs/**.png'
      - 'docs/**.gif'
    types: [closed, opened, synchronize]

jobs:
  publish:
    uses: elastic/workflows/.github/workflows/docs-elastic-co-publish.yml@main
    with:
      # Refers to Vercel project
      project-name: docs-elastic-co
      # Which prebuild step (dev or not)
      prebuild: wordlake
      # Docsmobile project dir
      repo: docs.elastic.co
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_CO }}
```
