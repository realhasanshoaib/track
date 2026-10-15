import { useQuery } from 'convex/react';
import {
  type ReleaseFeatureFlags,
  type ReleaseFeatureProjection,
  unavailableReleaseFeatureFlags,
} from '@track/shared/feature-flags';
import { api } from '../../../../convex/_generated/api';

export function resolveReleaseConfig(
  serverProjection: ReleaseFeatureProjection | null | undefined,
): ReleaseFeatureFlags {
  return serverProjection
    ? { ...serverProjection, projectSnapshots: serverProjection.projectSnapshots === true }
    : unavailableReleaseFeatureFlags;
}

export function canOpenExistingThread(isLoading: boolean, threadsEnabled: boolean) {
  return isLoading || threadsEnabled;
}

export function useReleaseConfig() {
  return useReleaseConfigState().config;
}

export function useReleaseConfigState() {
  const projection = useQuery(api.releaseConfig.getReleaseConfig);
  return {
    config: resolveReleaseConfig(projection),
    isLoading: projection === undefined,
  };
}
