import { createHash } from 'node:crypto'
import {
  createReleaseFromArchive,
  createReleaseFromDll,
  isGreater
} from './addon.js'
import { Release, ReleaseInfo, StandaloneHost } from './schema.js'

export async function updateStandalone(
  existing: Readonly<ReleaseInfo>,
  host: StandaloneHost
): Promise<ReleaseInfo> {
  const release = await downloadAndCheckVersion(
    existing.release,
    host.version_url,
    host.url
  )

  // only run when configured and release was found
  if (host.prerelease_url && host.prerelease_version_url && release) {
    const prerelease = await downloadAndCheckVersion(
      existing.prerelease,
      host.prerelease_version_url,
      host.prerelease_url
    )

    // check if prerelease is later than release, if not, remove prerelease
    if (prerelease) {
      if (isGreater(prerelease.version, release.version)) {
        return { release, prerelease }
      }
    }
  }

  return { release }
}

async function downloadAndCheckVersion(
  oldRelease: Readonly<Release> | undefined,
  version_url: string,
  host_url: string
): Promise<Release | undefined> {
  // load version
  const versionRes = await fetch(version_url, {
    signal: AbortSignal.timeout(10_000)
  })
  if (!versionRes.ok) {
    throw new Error(`fetching version failed (${versionRes.status})`)
  }

  // create hash of version response
  const id = createHash('sha256')
    .update(Buffer.from(await versionRes.arrayBuffer()))
    .digest('hex')

  // only download addon if its new or the id has changed
  if (!oldRelease || oldRelease.id !== id) {
    const release = await createRelease(host_url, id)

    // ensure the new release is actually newer
    if (!oldRelease || isGreater(release.version, oldRelease.version)) {
      return release
    }
  }

  return oldRelease
}

async function createRelease(host_url: string, id: string): Promise<Release> {
  // download addon
  const file = await fetch(host_url, { signal: AbortSignal.timeout(10_000) })
  if (!file.ok) {
    throw new Error(`Unable to download asset ${host_url}`)
  }

  // read addon to memory
  const fileBuffer = await file.arrayBuffer()

  // handle addon depending on file extension
  if (file.url.endsWith('.dll')) {
    return createReleaseFromDll(fileBuffer, id, file.url)
  } else if (file.url.endsWith('.zip')) {
    return await createReleaseFromArchive(fileBuffer, id, file.url)
  }

  throw new Error(`given host url has not supported file ending ${host_url}`)
}
