import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readConvexDeployment,
  requireConfirmedProductionDeployment,
} from './deploy-convex-production.mjs'

test('reads quoted and unquoted Convex deployment selectors', () => {
  assert.equal(readConvexDeployment('CONVEX_DEPLOYMENT=prod:track-live'), 'prod:track-live')
  assert.equal(readConvexDeployment('CONVEX_DEPLOYMENT="prod:track-live"'), 'prod:track-live')
})

test('rejects a missing or non-production deployment selector', () => {
  assert.throws(
    () => requireConfirmedProductionDeployment('SITE_URL=https://track.example', 'prod:track-live'),
    /must select a production deployment/,
  )
  assert.throws(
    () => requireConfirmedProductionDeployment('CONVEX_DEPLOYMENT=dev:track', 'dev:track'),
    /must select a production deployment/,
  )
})

test('requires an exact production deployment confirmation', () => {
  const environment = 'CONVEX_DEPLOYMENT=prod:track-live'
  assert.throws(
    () => requireConfirmedProductionDeployment(environment, undefined),
    /CONFIRM_CONVEX_PRODUCTION_DEPLOYMENT/,
  )
  assert.throws(
    () => requireConfirmedProductionDeployment(environment, 'prod:another-deployment'),
    /CONFIRM_CONVEX_PRODUCTION_DEPLOYMENT/,
  )
  assert.equal(
    requireConfirmedProductionDeployment(environment, 'prod:track-live'),
    'prod:track-live',
  )
})
