/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import path from 'node:path'

// Mock the GitHub Actions core library
jest.unstable_mockModule('@actions/core', () => core)

// get test directory
const dirname = path.resolve('./__tests__/')

// import main dynamically to ensure mocks are setup first
const main = await import('../src/main.js')

describe('action', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('local test', async () => {
    const manifest = await main.generateManifest({
      addonsPath: path.resolve(dirname, 'addons'),
      manifestPath: undefined
    })

    expect(manifest.data.addons).toHaveLength(4)
    expect(core.setFailed).not.toHaveBeenCalled()
  }, 20_000)

  it('should merge (legacy array) manifest', async () => {
    const manifest = await main.generateManifest({
      addonsPath: path.resolve(dirname, 'empty'),
      manifestPath: path.resolve(dirname, 'manifest-array.json')
    })

    expect(manifest.data.addons).toHaveLength(0)
    expect(core.warning).toHaveBeenCalledWith(
      'Addon gw2radial was removed from manifest!'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should merge manifest', async () => {
    const manifest = await main.generateManifest({
      addonsPath: path.resolve(dirname, 'empty'),
      manifestPath: path.resolve(dirname, 'manifest.json')
    })

    expect(manifest.data.addons).toHaveLength(0)
    expect(core.warning).toHaveBeenCalledWith(
      'Addon gw2radial was removed from manifest!'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should fail if manifest is invalid', async () => {
    const manifestPromise = main.generateManifest({
      addonsPath: path.resolve(dirname, 'empty'),
      manifestPath: path.resolve(dirname, 'invalid.json')
    })

    await expect(manifestPromise).rejects.toHaveProperty(
      'message',
      'Invalid manifest'
    )
  })
})
