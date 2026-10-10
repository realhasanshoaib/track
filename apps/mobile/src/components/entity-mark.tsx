import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

import { resolveEntityMark, type EntityMarkKind } from '@track/shared';
import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { Radius } from '@/constants/theme';

const icons = {
  analytics: 'analytics',
  archive: 'archive',
  board: 'view-board',
  bookmark: 'bookmark',
  book: 'file-document-outline',
  building: 'office-building',
  bug: 'bug',
  calendar: 'calendar',
  channel: 'channel',
  checklist: 'task',
  code: 'code',
  conversation: 'thread',
  design: 'image',
  files: 'file-archive',
  globe: 'earth',
  idea: 'lightbulb-outline',
  inbox: 'inbox',
  integration: 'link',
  people: 'account-group',
  milestone: 'star',
  mobile: 'smartphone',
  project: 'project',
  question: 'information-outline',
  support: 'email-outline',
  launch: 'flag',
  media: 'image-multiple',
  shield: 'shield-lock-outline',
  target: 'target',
  timeline: 'calendar-clock',
  video: 'video',
} as const satisfies Record<ReturnType<typeof resolveEntityMark>['iconKey'], IconName>;

type Props = {
  colorKey?: string | null;
  iconKey?: string | null;
  id: string;
  imageUrl?: string | null;
  kind: EntityMarkKind;
  name: string;
  size?: number;
};

export function EntityMark({ colorKey, iconKey, id, imageUrl, kind, name, size = 40 }: Props) {
  const identity = resolveEntityMark({ colorKey, iconKey, id, kind, name });
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  const radius = kind === 'channel' ? Radius.pill : Math.round(size * 0.28);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { backgroundColor: kind === 'company' && imageUrl && !imageFailed ? 'transparent' : identity.palette.background, borderRadius: radius, height: size, width: size }]}
    >
      {kind === 'company' && imageUrl && !imageFailed ? (
        <Image contentFit="contain" onError={() => setImageFailed(true)} source={{ uri: imageUrl }} style={{ height: size * 0.72, width: size * 0.72 }} transition={120} />
      ) : (
        <PlatformIcon color={identity.palette.foreground} name={icons[identity.iconKey]} size={Math.max(14, Math.round(size * 0.48))} weight="semibold" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', borderCurve: 'continuous', justifyContent: 'center', overflow: 'hidden' },
});
