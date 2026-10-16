import { describe, expect, it } from 'vitest'

import { resolveReleaseConfig, resolveReleaseConfigState } from './release-config'

describe('web release config', () => {
  it('fails closed while the server projection is unavailable', () => {
    expect(resolveReleaseConfig(undefined)).toEqual({
      companyModel: false,
    })
  })

  it('keeps loading separate from a disabled server projection', () => {
    expect(resolveReleaseConfigState(undefined)).toEqual({
      status: 'loading',
      config: {
        companyModel: false,
      },
    })
    expect(resolveReleaseConfigState(null)).toEqual({
      status: 'ready',
      config: {
        companyModel: false,
      },
    })
  })
})
