import {
  createReleaseFromArchive,
  createReleaseFromDll,
  isGreater
} from './addon.js'
import * as github from '@actions/github'
import * as core from '@actions/core'
import { addAddonName } from './main.js'
import type { GetResponseDataTypeFromEndpointMethod } from '@octokit/types'
import { GithubHost, Addon, Release } from './schema.js'

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
  addon: Addon,
  host: GithubHost
): Promise<void> {
  const [owner, repo] = host.url.split('/')

  const releases = await octokit.rest.repos.listReleases({
    owner,
    repo
  })

  const latestRelease = await octokit.rest.repos.getLatestRelease({
    owner,
    repo
  })

  addon.release = await findAndCreateRelease(
    addon,
    addon.release,
    latestRelease.data
  )

  // find pre-release until latest release
  for (const release of releases.data) {
    if (release.prerelease) {
      addon.prerelease = await findAndCreateRelease(
        addon,
        addon.prerelease,
        release
      )
      break
    } else if (release.tag_name === latestRelease.data.tag_name) {
      // TODO: if prerelease is set, we removed it
      addon.prerelease = undefined
      break
    }
  }
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
  addon: Addon,
  oldRelease: Release | undefined,
  githubRelease: GetLatestReleaseType
): Promise<Release | undefined> {
  if (checkAssetChanged(oldRelease, githubRelease)) {
    let found = false
    for (let i = 0; i < githubRelease.assets.length; i++) {
      const asset = githubRelease.assets[i]
      const release = await downloadFromGithub(addon, asset)
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
      throw new Error(
        `no valid release asset found for addon ${addon.package.name}`
      )
    }
  }
  return oldRelease
}

async function downloadFromGithub(
  addon: Addon,
  asset: GetLatestReleaseAssetType
): Promise<Release | undefined> {
  const file = await fetch(asset.browser_download_url)
  if (!file.ok) {
    throw new Error(`Unable to download asset: ${asset.browser_download_url}`)
  }
  const fileBuffer = await file.arrayBuffer()
  let release: Release | undefined
  if (asset.name.endsWith('.dll')) {
    release = createReleaseFromDll(
      addon,
      fileBuffer,
      asset.id.toString(),
      asset.browser_download_url
    )
  } else if (asset.name.endsWith('.zip')) {
    release = await createReleaseFromArchive(
      addon,
      fileBuffer,
      asset.id.toString(),
      asset.browser_download_url
    )
  } else {
    release = undefined
  }

  if (release !== undefined) {
    addAddonName(addon, release.name)
  }

  return release
}

function checkAssetChanged(
  release: Release | undefined,
  githubRelease: GetLatestReleaseType
): boolean {
  if (!release || release.asset_index === undefined) {
    return true
  }
  const last_asset = githubRelease.assets[release.asset_index]
  return last_asset === undefined || last_asset.id.toString() !== release.id
}
