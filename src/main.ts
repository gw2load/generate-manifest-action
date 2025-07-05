import * as core from '@actions/core'
import {
  addon as addonSchema,
  Addon,
  manifest as manifestSchema,
  Manifest,
  addonConfig,
  ReleaseInfo
} from './schema.js'
import { updateFromGithub } from './github.js'
import { updateStandalone } from './standalone.js'
import * as fs from 'node:fs'
import toml from 'smol-toml'
import path from 'node:path'
import { isZodErrorLike } from 'zod-validation-error'
import { z } from 'zod'

/** Add addon name to addon if not already known */
function addAddonName(addon: Addon, name: string): void {
  if (addon.addon_names === undefined) {
    addon.addon_names = [name]
  } else {
    if (!addon.addon_names.includes(name)) {
      addon.addon_names.push(name)
    }
  }
}

async function update(addon: Addon): Promise<void> {
  // get releases
  const { release, prerelease } =
    'github' in addon.host
      ? await updateFromGithub(addon, addon.host.github)
      : await updateStandalone(addon, addon.host.standalone)

  // mutate addon (the update functions above will return the old release if no new one was found)
  addon.release = release
  addon.prerelease = prerelease

  // add known addon names from releases
  if (release) {
    addAddonName(addon, release.name)
  }
  if (prerelease) {
    addAddonName(addon, prerelease.name)
  }
}

/** The main function for the action. */
export async function run(): Promise<void> {
  try {
    // get addons path (defaults to `addons`)
    const addonsPathInput = core.getInput('addons_path', { required: true })
    const addonsPath = path.resolve(addonsPathInput)

    // get manifest path
    const manifestPathInput = core.getInput('manifest_path')
    const manifestPath =
      manifestPathInput !== '' ? path.resolve(manifestPathInput) : undefined

    // get loader repo
    const loaderRepoInput = core.getInput('loader_repository')
    const loaderRepo = loaderRepoInput !== '' ? loaderRepoInput : undefined

    // generate manifest
    const manifest = await generateManifest({
      addonsPath,
      manifestPath,
      loaderRepo
    })

    // if manifest path is set, write to manifest to file, otherwise print
    if (manifestPath) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    } else {
      console.log(JSON.stringify(manifest, null, 2))
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.log(errorMessage)
    core.setFailed(errorMessage)
  }
}

export async function generateManifest({
  addonsPath,
  manifestPath,
  loaderRepo
}: {
  addonsPath: string
  manifestPath: string | undefined
  loaderRepo: string | undefined
}): Promise<Manifest> {
  // make sure addons directory exists
  if (!fs.existsSync(addonsPath)) {
    throw new Error(`Addon directory does not exist: ${addonsPath}`)
  }

  // manifest path should either be undefined to output to STDOUT
  // or a path to a file, but never empty
  if (manifestPath === '') {
    throw new Error(
      'Invalid manifest path. Set to undefined to output to STDOUT.'
    )
  }

  // list of addons
  const addons: Addon[] = []
  const addonFiles = new Map<string, string>()

  // flag if a validation error was encountered while reading addon configs
  let encounteredValidationError = false

  // collect addons from addon directory
  for (const fileName of fs.readdirSync(addonsPath)) {
    // skip files that don't end with .toml
    if (!fileName.endsWith('.toml')) {
      continue
    }

    const filePath = path.join(addonsPath, fileName)
    const tomlContent = fs.readFileSync(filePath)

    try {
      const config = addonConfig.parse(toml.parse(tomlContent.toString()))
      addons.push(config)
      addonFiles.set(config.package.id, filePath)
    } catch (error) {
      if (isZodErrorLike(error)) {
        // flag that we encountered a validation error so we can fail later
        // we don't instantly fail so we can validate all addons first
        encounteredValidationError = true

        for (const validationError of error.errors) {
          core.error(validationError.message, { file: filePath })
          console.error(`${fileName}: ${validationError.message}`)
        }
      } else {
        // if this was not just a validation error, rethrow the error
        throw error
      }
    }
  }

  // if any addon failed validation, we don't continue
  if (encounteredValidationError) {
    throw Error('Validation of some addons failed')
  }

  // read existing manifest if it exists
  let existingManifest
  if (manifestPath && fs.existsSync(manifestPath)) {
    existingManifest = await readManifest(manifestPath)
  }

  // merge addon definitions
  if (existingManifest?.addons) {
    for (const existingAddon of existingManifest.addons) {
      const found = addons.find(
        (value) => value.package.id === existingAddon.package.id
      )
      if (!found) {
        core.warning(
          `Addon ${existingAddon.package.id} was removed from manifest!`
        )
        continue
      }

      found.release = existingAddon.release
      found.prerelease = existingAddon.prerelease
      found.addon_names = existingAddon.addon_names
    }
  }

  // update addons
  for (const addon of addons) {
    try {
      await update(addon)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const message = `Addon ${addon.package.name} failed to update: ${errorMessage}`
      core.error(message, {
        title: addon.package.name,
        file: addonFiles.get(addon.package.id),
        startLine: 1,
        endLine: 1
      })
      console.log(error)
    }
  }

  // update loader
  let loader: ReleaseInfo = existingManifest?.loader ?? {}
  try {
    if (loaderRepo) {
      loader = await updateFromGithub(existingManifest?.loader, {
        url: loaderRepo
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const message = `gw2load failed to update: ${errorMessage}`
    core.error(message)
    console.log(error)
  }

  const manifest: Manifest = {
    version: 1,
    data: {
      addons,
      loader
    }
  }

  return manifest
}

async function readManifest(
  manifestPath: string
): Promise<{ addons: Addon[]; loader?: ReleaseInfo }> {
  const manifestJson: unknown = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8')
  )

  // manifest has to be an object (arrays are objects too)
  if (typeof manifestJson !== 'object' || !manifestJson) {
    throw new Error('Invalid manifest')
  }

  // if the manifest is just an array, try to parse as array of addons
  if (Array.isArray(manifestJson)) {
    return { addons: z.array(addonSchema).parse(manifestJson) }
  }

  // if the manifest has a version, we can parse it
  if ('version' in manifestJson) {
    const manifest = manifestSchema.parse(manifestJson)
    return manifest.data
  }

  // the manifest was neither an array nor had it version set
  throw new Error('Invalid manifest')
}
