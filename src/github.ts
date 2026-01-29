import {
  createReleaseFromArchive,
  createReleaseFromDll,
  isGreater
} from './addon.js'
import * as github from '@actions/github'
import * as core from '@actions/core'
import type { GetResponseDataTypeFromEndpointMethod } from '@octokit/types'
import { GithubHost, Release, ReleaseInfo } from './schema.js'

type GetLatestReleaseType = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.rest.repos.getLatestRelease
>
type GetLatestReleaseAssetType = GetLatestReleaseType['assets'][0]

const env = process.env
const envToken = env.INPUT_token
let token = core.getInput('token')
if (token === '' && envToken !== undefined) {
  token = envToken
}

const octokit = github.getOctokit(token)

export async function updateFromGithub(
  existing: Readonly<ReleaseInfo> | undefined,
  host: GithubHost
): Promise<ReleaseInfo> {
  // parse repository
  const repository = parseRepository(host.url)

  // get list of all releases
  const releases = await octokit.rest.repos.listReleases(repository)

  // try to get latest release
  // we could use the list of releases for this, but if the last 100 releases are prereleases/drafts we would not find one.
  // this guarantees we always find a release if one exists
  let latestRelease
  try {
    latestRelease = await octokit.rest.repos.getLatestRelease(repository)
  } catch {
    console.log(`Could not find latest release`)
  }

  const release = latestRelease
    ? await findAndCreateRelease(
        existing?.release,
        latestRelease.data,
        repository
      )
    : undefined

  // find pre-release until latest release
  for (const githubRelease of releases.data) {
    if (githubRelease.prerelease && !githubRelease.draft) {
      const prerelease = await findAndCreateRelease(
        existing?.prerelease,
        githubRelease,
        repository
      )

      return { release, prerelease }
    } else if (githubRelease.id === latestRelease?.data.id) {
      // no prerelease found that is newer than release
      break
    }
  }

  return { release }
}

/**
 *
 * @param addon The addon currently checked
 * @param oldRelease the old release (either addon.release or addon.prerelease)
 * @param githubRelease The github api response for the corresponding release/tag
 * @return oldRelease when the release didn't change or the new release
 * @throws Error when no valid release asset was found
 */
async function findAndCreateRelease(
  oldRelease: Readonly<Release> | undefined,
  githubRelease: GetLatestReleaseType,
  repository: Repository
): Promise<Release | undefined> {
  if (checkAssetChanged(oldRelease, githubRelease)) {
    let found = false
    for (let i = 0; i < githubRelease.assets.length; i++) {
      const asset = githubRelease.assets[i]
      const release = await downloadFromGithub(asset, repository)
      if (release !== undefined) {
        release.asset_index = i

        if (!oldRelease || isGreater(release.version, oldRelease.version)) {
          return release
        }
        found = true
        break
      }
    }
    if (!found) {
      throw new Error(`no valid release asset found`)
    }
  }
  return oldRelease
}

async function downloadFromGithub(
  asset: GetLatestReleaseAssetType,
  repository: Repository
): Promise<Release | undefined> {
  const response = await octokit.rest.repos.getReleaseAsset({
    ...repository,
    asset_id: asset.id,
    headers: {
      accept: 'application/octet-stream'
    }
  })

  // need to cast data, as typescript doesn't know about `accept: application/octet-stream`
  const fileBuffer = response.data as unknown as ArrayBuffer

  let release: Release | undefined
  if (asset.name.endsWith('.dll')) {
    release = createReleaseFromDll(
      fileBuffer,
      asset.id.toString(),
      asset.browser_download_url
    )
  } else if (asset.name.endsWith('.zip')) {
    release = await createReleaseFromArchive(
      fileBuffer,
      asset.id.toString(),
      asset.browser_download_url
    )
  } else {
    release = undefined
  }

  return release
}

function checkAssetChanged(
  release: Readonly<Release> | undefined,
  githubRelease: GetLatestReleaseType
): boolean {
  if (!release || release.asset_index === undefined) {
    return true
  }
  const last_asset = githubRelease.assets[release.asset_index]
  return last_asset === undefined || last_asset.id.toString() !== release.id
}

type Repository = { owner: string; repo: string }

function parseRepository(repository: string): Repository {
  const [owner, repo] = repository.split('/')
  return { owner, repo }
}
