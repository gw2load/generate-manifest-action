import { PeFileParser } from 'pe-toolkit'
import { unzipSync } from 'fflate'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import { execSync } from 'child_process'
import { Release, Version } from './schema.js'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

export function isGreater(a: Version, b: Version): boolean {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i]
    }
  }
  return false
}

export async function createReleaseFromArchive(
  fileBuffer: ArrayBuffer,
  id: string,
  downloadUrl: string
): Promise<Release> {
  const unzipped = unzipSync(new Uint8Array(fileBuffer))
  const files = Object.keys(unzipped)
    .filter((value) => value.endsWith('.dll'))
    .map((value) => new File([unzipped[value]], value))

  for (const file of files) {
    // save file to tmp
    await using tempFile = await saveToTmp(file)

    // check if dll has exports, skip if not
    if (!checkDllExports(tempFile.filePath)) {
      continue
    }

    // create release
    const subFileBuffer = await file.arrayBuffer()
    return createReleaseFromDll(subFileBuffer, id, downloadUrl)
  }

  throw new Error(`no valid release assets found in archive`)
}

async function saveToTmp(file: File) {
  // generate tmp file name
  const prefix = randomBytes(4).toString('base64url')
  const fileName = path.basename(file.name)
  const filePath = path.resolve(tmpdir(), `${prefix}-${fileName}`)

  // write file contents
  const buffer = await file.arrayBuffer()
  await fs.writeFile(filePath, Buffer.from(buffer))

  return {
    filePath,
    [Symbol.asyncDispose]: () => fs.rm(filePath)
  }
}

function checkDllExports(filepath: string): boolean {
  // get path to winedump binary
  // we can't use the working directory for this, as that is set to the workflow directory inside the action
  const winedump = fileURLToPath(new URL('../winedump', import.meta.url))
  const command = `${winedump} -j export ${filepath} | grep -e "get_init_addr" -e "GW2Load_GetAddonAPIVersion"`

  try {
    execSync(command)
    return true
  } catch {
    return false
  }
}

export function createReleaseFromDll(
  fileBuffer: ArrayBuffer,
  id: string,
  downloadUrl: string
): Release {
  // parse dll
  const fileParser = new PeFileParser()
  fileParser.parseBytes(fileBuffer)

  const versionInfoResource = fileParser.getVersionInfoResources()
  if (versionInfoResource === undefined) {
    throw new Error(`No versionInfoResource found`)
  }

  const vsInfoSub = Object.values(versionInfoResource)[0]
  if (vsInfoSub === undefined) {
    throw new Error(`no vsInfoSub found`)
  }

  const versionInfo = Object.values(vsInfoSub)[0]
  if (versionInfo === undefined) {
    throw new Error(`No versionInfo found`)
  }

  const fixedFileInfo = versionInfo.getFixedFileInfo()
  if (fixedFileInfo === undefined) {
    throw new Error(`No fileInfo found`)
  }

  // read version
  const {
    dwFileVersionMS,
    dwFileVersionLS,
    dwProductVersionMS,
    dwProductVersionLS
  } = fixedFileInfo.getStruct()

  const version =
    parseVersion(dwFileVersionMS, dwFileVersionLS) ??
    parseVersion(dwProductVersionMS, dwProductVersionLS)

  if (!version) {
    throw new Error(`no addonVersion found`)
  }

  // get string file info for `name` and optional `version_str`
  const stringFileInfo = versionInfo.getStringFileInfo()
  if (stringFileInfo === undefined) {
    throw new Error(`No StringFileInfo found`)
  }

  const stringInfo = Object.values(
    stringFileInfo.getStringTables()
  )[0].toObject()

  // read name
  const name = stringInfo['ProductName'] ?? stringInfo['FileDescription']
  if (name === undefined) {
    throw new Error(`No addonName found`)
  }

  // read version string (fallback to version)
  const versionStr =
    stringInfo['FileVersion'] ??
    stringInfo['ProductVersion'] ??
    version.join('.')

  // return release
  return {
    id,
    name,
    version,
    version_str: versionStr,
    download_url: downloadUrl
  }
}

/** Combines the most significant and least significant bits to a version */
function parseVersion(ms: number, ls: number): Version | undefined {
  // 0.0.0.0 (=0x00000000 0x00000000) is not a valid version
  if (ms === 0 && ls === 0) {
    return undefined
  }

  return [(ms >> 16) & 0xffff, ms & 0xffff, (ls >> 16) & 0xffff, ls & 0xffff]
}
