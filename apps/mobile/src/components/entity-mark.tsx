import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { resolveEntityMark, type EntityMarkKind } from '@track/shared';
import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { Radius } from '@/constants/theme';
import { MediaPlaceholder, MediaTransition } from '@/constants/motion';

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
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);
  const reducedMotion = useReducedMotion();
  const radius = kind === 'channel' ? Radius.pill : Math.round(size * 0.28);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { backgroundColor: kind === 'company' && imageUrl && !imageFailed ? 'transparent' : identity.palette.background, borderRadius: radius, height: size, width: size }]}
    >
      {kind === 'company' && imageUrl && !imageFailed ? (
        <Image cachePolicy="memory-disk" contentFit="contain" onError={() => setFailedImageUrl(imageUrl ?? null)} placeholder={MediaPlaceholder} placeholderContentFit="contain" recyclingKey={`${id}:${imageUrl}`} source={{ uri: imageUrl }} style={{ height: size * 0.72, width: size * 0.72 }} transition={reducedMotion ? 0 : MediaTransition} />
      ) : identity.pattern ? (
        <View style={[styles.pattern, { gap: size * 0.035, height: size * 0.62, width: size * 0.62 }]}>
          {identity.pattern.map((filled, index) => <View key={index} style={{
            backgroundColor: filled ? identity.palette.foreground : 'transparent',
            borderRadius: Math.max(0.5, size * 0.02),
            height: size * 0.09,
            width: size * 0.09,
          }} />)}
        </View>
      ) : (
        <PlatformIcon color={identity.palette.foreground} name={icons[identity.iconKey]} size={Math.max(14, Math.round(size * 0.48))} weight="semibold" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', borderCurve: 'continuous', justifyContent: 'center', overflow: 'hidden' },
  pattern: { alignContent: 'center', alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
