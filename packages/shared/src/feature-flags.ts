export const releaseFeatureNames = ['companyModel', 'threads'] as const
export type ReleaseFeatureName = (typeof releaseFeatureNames)[number]

export type ReleaseFeatureFlags = Readonly<Record<ReleaseFeatureName, boolean>>

export const defaultReleaseFeatureFlags = Object.freeze({
  companyModel: true,
  threads: true,
}) satisfies ReleaseFeatureFlags

export const unavailableReleaseFeatureFlags = Object.freeze({
  companyModel: false,
  threads: false,
}) satisfies ReleaseFeatureFlags

export function resolveReleaseFeatureFlag(value: string | undefined) {
  return value === undefined || value === 'true'
}

export const projectAccessProfiles = ['legacy', 'company'] as const
export type ProjectAccessProfile = (typeof projectAccessProfiles)[number]

export function resolveProjectAccessProfile(
  persistedProfile: ProjectAccessProfile | null | undefined,
): ProjectAccessProfile {
  return persistedProfile ?? 'legacy'
}
