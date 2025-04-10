import {
  createReleaseFromArchive,
  createReleaseFromDll,
  isGreater
} from './addon.js'
import { addAddonName } from './main.js'
import { Addon, Release, StandaloneHost } from './schema.js'

export async function updateStandalone(
  addon: Addon,
  host: StandaloneHost
): Promise<void> {
  if (!host.version_url) {
    throw new Error(`no version_url for addon ${addon.package.name}`)
  }
  addon.release = await downloadAndCheckVersion(
    addon,
    addon.release,
    host.version_url,
    host.url
  )

  // only run when configured and release was found
  if (host.prerelease_url && host.prerelease_version_url && addon.release) {
    const prerelease = await downloadAndCheckVersion(
      addon,
      addon.prerelease,
      host.prerelease_version_url,
      host.prerelease_url
    )

    // check if prerelease is later than release, if not, remove prerelease
    if (prerelease) {
      if (isGreater(prerelease.version, addon.release.version)) {
        // TODO: new release was found die zweite
        addon.prerelease = prerelease
        return
      }
    }
  }

  // TODO: if prerelease is set, we removed it
  addon.prerelease = undefined
}

async function downloadAndCheckVersion(
  addon: Addon,
  oldRelease: Release | undefined,
  version_url: string,
  host_url: string
): Promise<Release | undefined> {
  const versionRes = await fetch(version_url)
  if (versionRes.status !== 200) {
    throw new Error(
      `version response status for addon ${addon.package.name}: ${versionRes.status}`
    )
  }
  let version = await versionRes.text()
  version = version.trim()

  if (!oldRelease || oldRelease.id !== version) {
    const release = await downloadStandalone(addon, host_url, version)
    if (release !== undefined) {
      if (!oldRelease || isGreater(release.version, oldRelease.version)) {
        return release

        // TODO: new release was found
      }
      return oldRelease
    }

    throw new Error(`no release asset found for addon ${addon.package.name}`)
  }

  return oldRelease
}

async function downloadStandalone(
  addon: Addon,
  host_url: string,
  id: string
): Promise<Release | undefined> {
  const file = await fetch(host_url)
  if (!file.ok) {
    throw new Error(`Unable to download asset ${host_url}`)
  }

  const fileBuffer = await file.arrayBuffer()
  let release: Release | undefined
  if (file.url.endsWith('.dll')) {
    release = createReleaseFromDll(addon, fileBuffer, id, file.url)
  } else if (file.url.endsWith('.zip')) {
    release = await createReleaseFromArchive(addon, fileBuffer, id, file.url)
  } else {
    throw new Error(`given host url has not supported file ending ${host_url}`)
  }

  if (release !== undefined) {
    addAddonName(addon, release.name)
  }

  return release
}
