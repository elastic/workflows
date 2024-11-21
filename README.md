# workflows

:wave: Contains public GitHub Action workflows
## Elastic docs

Elastic docs require that we install an "agent" in each content source.

A content source is a repository which contains MDX files across a given topic.

There are two contexts, internal & external docs. 

Each pairs with a "separate" web app.

The web apps are built by Vercel, and as a result we get 2x "prod" instances.

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

Public repos require an extra level of security and we require that a `ci:doc-build` label be added by a repo maintainer.

We also use a different set of secrets that we have to provide the content source access to the Vercel tokens for. For internal and private repos, the token access is automatically provided. 

### Dev docs builder, calling workflow

Change values as needed.

Install as `.github/workflows/dev-docs-builder.yml` in the content source.

:wave: Provide the content source access to the Vercel_ tokens.

```yml
name: Dev Docs

on:
  pull_request_target:
    # The paths property can be omitted entirely if the repo is mainly used for docs. Leaving it in can result in builds that 
    # have branch protection checks in place lose the ability to merge because the workflow is not starting. If this property 
    # is included, please ensure that branch protection checks are disabled for the repo. 
    paths:
      # Preface with your docs dir if you need further specificity (optional)
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.png'
      - '**.svg'
      - '**.gif'
    types: [opened, closed, synchronize]

jobs:
  publish:
    name: Vercel Build Check
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

You can optionally pass a `subdirectory` to this workflow from a content repo if you only want to grab files from a specific subdirectory in the content repo. If you do not specify a `subdirectoy`, the workflow will grab all relevant files from the entire repo.

>[!IMPORTANT]
>Always include a trailing slash when defining a `subdirectory`. For example:
>```
>  with:
>    subdirectory: 'docs/en/serverless/'
>```

Install as `.github/workflows/co-docs-builder.yml` in content source.

#### Private repos

```yml
name: Elastic docs

on:
  pull_request_target:
    # The paths property can be omitted entirely if the repo is mainly used for docs. Leaving it in can result in builds that 
    # have branch protection checks in place lose the ability to merge because the workflow is not starting. If this property 
    # is included, please ensure that branch protection checks are disabled for the repo. 
    paths:
      # Preface with your docs dir if you need further specificity (optional)
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.svg'
      - '**.png'
      - '**.gif'
    types: [closed, opened, synchronize]

jobs:
  publish:
    uses: elastic/workflows/.github/workflows/docs-elastic-co-publish.yml@main
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_CO }}
```

#### Public repos

```yml
name: Elastic docs

on:
  pull_request_target:
    # The paths property can be omitted entirely if the repo is mainly used for docs. Leaving it in can result in builds that 
    # have branch protection checks in place lose the ability to merge because the workflow is not starting. If this property 
    # is included, please ensure that branch protection checks are disabled for the repo. 
    paths:
      # Preface with your docs dir if you need further specificity (optional)
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.svg'
      - '**.png'
      - '**.gif'
    types: [closed, opened, synchronize, labeled]

jobs:
  publish:
    if: contains(github.event.pull_request.labels.*.name, 'ci:doc-build')
    uses: elastic/workflows/.github/workflows/docs-elastic-co-publish.yml@main
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN_PUBLIC }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN_PUBLIC }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID_PUBLIC }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_CO_PUBLIC }}
```


### Staging docs builder, calling workflow

Change values as needed.

Install as `.github/workflows/staging-docs-builder.yml` in content source.

#### Private repos

```yml
name: Elastic docs

on:
  pull_request_target:
    # The paths property can be omitted entirely if the repo is mainly used for docs. Leaving it in can result in builds that 
    # have branch protection checks in place lose the ability to merge because the workflow is not starting. If this property 
    # is included, please ensure that branch protection checks are disabled for the repo. 
    paths:
      # Preface with your docs dir if you need further specificity (optional)
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.svg'
      - '**.png'
      - '**.gif'
    types: [closed, opened, synchronize]

jobs:
  publish:
    uses: elastic/workflows/.github/workflows/docs-elastic-staging-publish.yml@main
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_STAGING }}
```

#### Public repos

```yml
name: Elastic docs

on:
  pull_request_target:
    # The paths property can be omitted entirely if the repo is mainly used for docs. Leaving it in can result in builds that 
    # have branch protection checks in place lose the ability to merge because the workflow is not starting. If this property 
    # is included, please ensure that branch protection checks are disabled for the repo. 
    paths:
      # Preface with your docs dir if you need further specificity (optional)
      - '**.mdx'
      - '**.docnav.json'
      - '**.docapi.json'
      - '**.devdocs.json'
      - '**.jpg'
      - '**.jpeg'
      - '**.svg'
      - '**.png'
      - '**.gif'
    types: [closed, opened, synchronize, labeled]

jobs:
  publish:
    if: contains(github.event.pull_request.labels.*.name, 'ci:doc-build')
    uses: elastic/workflows/.github/workflows/docs-elastic-co-publish.yml@main
    secrets:
      VERCEL_GITHUB_TOKEN: ${{ secrets.VERCEL_GITHUB_TOKEN_PUBLIC }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN_PUBLIC }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID_PUBLIC }}
      VERCEL_PROJECT_ID_DOCS_CO: ${{ secrets.VERCEL_PROJECT_ID_DOCS_CO }}
```
