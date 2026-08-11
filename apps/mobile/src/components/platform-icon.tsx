import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { Platform } from 'react-native';

import { useLocale } from '@/contexts/locale-context';

export type IconName =
  | 'apple'
  | 'arrow-up'
  | 'bell-outline'
  | 'bell-off-outline'
  | 'briefcase-outline'
  | 'calendar'
  | 'check-box'
  | 'check-box-outline'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'dots-horizontal'
  | 'email-outline'
  | 'edit'
  | 'file-document-outline'
  | 'filter'
  | 'flag'
  | 'folder-outline'
  | 'forum-outline'
  | 'inbox'
  | 'link'
  | 'list'
  | 'logout'
  | 'microphone-outline'
  | 'paperclip'
  | 'shield-lock-outline'
  | 'stop'
  | 'trash-can-outline'
  | 'account-edit-outline'
  | 'clock-outline'
  | 'white-balance-sunny'
  | 'theme-light-dark'
  | 'moon-waning-crescent'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'view-column'
  | 'cloud-off'
  | 'person';

const SF_MAP: Partial<Record<IconName, SFSymbol>> = {
  'apple': 'apple.logo',
  'arrow-up': 'arrow.up',
  'bell-outline': 'bell',
  'bell-off-outline': 'bell.slash',
  'briefcase-outline': 'briefcase',
  'calendar': 'calendar',
  'check-box': 'checkmark.square.fill',
  'check-box-outline': 'square',
  'check-circle': 'checkmark.circle.fill',
  'chevron-down': 'chevron.down',
  'chevron-left': 'chevron.left',
  'chevron-right': 'chevron.right',
  'close': 'xmark',
  'dots-horizontal': 'ellipsis',
  'email-outline': 'envelope',
  'edit': 'pencil',
  'file-document-outline': 'doc.text',
  'filter': 'line.3.horizontal.decrease',
  'flag': 'flag',
  'folder-outline': 'folder',
  'forum-outline': 'bubble.left.and.bubble.right',
  'inbox': 'tray',
  'link': 'link',
  'list': 'list.bullet',
  'logout': 'rectangle.portrait.and.arrow.right',
  'microphone-outline': 'mic',
  'paperclip': 'paperclip',
  'shield-lock-outline': 'lock.shield',
  'stop': 'stop.fill',
  'trash-can-outline': 'trash',
  'account-edit-outline': 'person.crop.circle',
  'clock-outline': 'clock',
  'white-balance-sunny': 'sun.max',
  'theme-light-dark': 'circle.lefthalf.filled',
  'moon-waning-crescent': 'moon',
  'plus': 'plus',
  'refresh': 'arrow.clockwise',
  'search': 'magnifyingglass',
  'view-column': 'rectangle.split.3x1',
  'cloud-off': 'icloud.slash',
  'person': 'person',
};

// Android Material Icons mapping for a more native Android feel
const ANDROID_MAP: Partial<Record<IconName, React.ComponentProps<typeof MaterialIcons>['name']>> = {
  'apple': 'apple',
  'arrow-up': 'arrow-upward',
  'bell-outline': 'notifications-none',
  'bell-off-outline': 'notifications-off',
  'briefcase-outline': 'work-outline',
  'calendar': 'event',
  'check-box': 'check-box',
  'check-box-outline': 'check-box-outline-blank',
  'check-circle': 'check-circle',
  'chevron-down': 'keyboard-arrow-down',
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  'close': 'close',
  'dots-horizontal': 'more-horiz',
  'email-outline': 'mail-outline',
  'edit': 'edit',
  'file-document-outline': 'description',
  'filter': 'filter-list',
  'flag': 'flag',
  'folder-outline': 'folder-open',
  'forum-outline': 'forum',
  'inbox': 'inbox',
  'link': 'link',
  'list': 'view-list',
  'logout': 'logout',
  'microphone-outline': 'mic-none',
  'paperclip': 'attach-file',
  'shield-lock-outline': 'security',
  'stop': 'stop',
  'trash-can-outline': 'delete-outline',
  'account-edit-outline': 'person-outline',
  'clock-outline': 'access-time',
  'white-balance-sunny': 'wb-sunny',
  'theme-light-dark': 'brightness-medium',
  'moon-waning-crescent': 'nightlight',
  'plus': 'add',
  'refresh': 'refresh',
  'search': 'search',
  'view-column': 'view-column',
  'cloud-off': 'cloud-off',
  'person': 'person-outline',
};

// iOS-friendly Ionicons fallback for any unmatched icons
const ION_MAP: Partial<Record<IconName, React.ComponentProps<typeof Ionicons>['name']>> = {
  'white-balance-sunny': 'sunny-outline',
  'theme-light-dark': 'contrast-outline',
  'moon-waning-crescent': 'moon-outline',
};

type Props = { name: IconName; size: number; color: string; directional?: boolean };

export function PlatformIcon({ directional = false, name, size, color }: Props) {
  const { direction } = useLocale();
  const iconStyle = directional && direction === 'rtl' ? { transform: [{ scaleX: -1 }] } : undefined;

  if (Platform.OS === 'ios') {
    const sf = SF_MAP[name];
    if (sf) {
      return (
        <SymbolView
          name={sf}
          size={size}
          tintColor={color}
          style={[{ width: size, height: size }, iconStyle]}
        />
      );
    }
    const ion = ION_MAP[name];
    if (ion) return <Ionicons color={color} name={ion} size={size} style={iconStyle} />;
    return <Ionicons color={color} name="help-circle-outline" size={size} style={iconStyle} />;
  }

  // Android: prefer Material Icons, then Ionicons
  const mat = ANDROID_MAP[name];
  if (mat) return <MaterialIcons color={color} name={mat} size={size} style={iconStyle} />;
  const ion = ION_MAP[name];
  if (ion) return <Ionicons color={color} name={ion} size={size} style={iconStyle} />;
  return <Ionicons color={color} name="help-circle-outline" size={size} style={iconStyle} />;
}
