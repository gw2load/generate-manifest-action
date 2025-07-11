import * as core from '@actions/core'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>(console.debug)
export const error = jest.fn<typeof core.error>(console.error)
export const info = jest.fn<typeof core.info>(console.info)
export const getInput = jest.fn<typeof core.getInput>(core.getInput)
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
export const warning = jest.fn<typeof core.warning>(console.error)
