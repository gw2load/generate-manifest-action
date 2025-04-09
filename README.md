# generate-manifest-action

[![GitHub Super-Linter](https://github.com/gw2load/generate-manifest-action/actions/workflows/linter.yml/badge.svg)](https://github.com/gw2load/generate-manifest-action/actions/workflows/linter.yml)
[![CI](https://github.com/gw2load/generate-manifest-action/actions/workflows/ci.yml/badge.svg)](https://github.com/gw2load/generate-manifest-action/actions/workflows/ci.yml)
[![Check dist/](https://github.com/gw2load/generate-manifest-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/gw2load/generate-manifest-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/gw2load/generate-manifest-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/gw2load/generate-manifest-action/actions/workflows/codeql-analysis.yml)

This action is used to generate the addon manifest for
[gw2load/manifest](https://github.com/gw2load/manifest).

## Contribute

### Setup

1. You will need Node.js 20.6.0 or later to run this action locally.
1. Clone this repository or
   [make a fork](https://docs.github.com/en/github/getting-started-with-github/quickstart/fork-a-repo)
   if you plan to submit your changes.
1. Run `npm install` to install the required dependencies.

### Making Changes

- The [`src/`](./src/) directory contains the source code of the action.
- The [`action.yml`](action.yml) file defines metadata about the action, such as
  input(s) and output(s). For details about this file, see
  [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).
- The [`__tests__/`](./__tests__/) directory contains tests for this action.

### Test

1. Package the changes by running `npm run bundle`
1. Test your changes by running `npm run test`.  
   This requires an environment variable called `INPUT_TOKEN` set to a valid
   GitHub token (can be created on
   [github.com/settings/tokens](https://github.com/settings/tokens)).

### Commit your Changes

1. Commit the changes to a new branch and push them to your fork.
1. Create a new
   [Pull Request](https://docs.github.com/en/github/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests).

## License

Licensed under the [MIT License](./LICENSE).
