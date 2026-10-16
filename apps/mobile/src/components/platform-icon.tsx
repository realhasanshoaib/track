import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { Platform } from 'react-native';

export type IconName =
  | 'account-circle'
  | 'account-edit-outline'
  | 'account-group'
  | 'alert-circle'
  | 'apple'
  | 'archive'
  | 'archive-restore'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-up'
  | 'bell-outline'
  | 'bell-off-outline'
  | 'briefcase-outline'
  | 'calendar'
  | 'calendar-clock'
  | 'calendar-remove'
  | 'calendar-today'
  | 'camera'
  | 'check'
  | 'check-all'
  | 'check-box'
  | 'check-box-outline'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'circle-outline'
  | 'clock-outline'
  | 'close'
  | 'cloud-off'
  | 'content-copy'
  | 'dots-horizontal'
  | 'dots-vertical'
  | 'download'
  | 'drag-handle'
  | 'earth'
  | 'edit'
  | 'email-outline'
  | 'eye'
  | 'eye-off'
  | 'file-archive'
  | 'file-document-outline'
  | 'file-excel'
  | 'file-music'
  | 'file-pdf'
  | 'filter'
  | 'flag'
  | 'folder-outline'
  | 'forum-outline'
  | 'forward'
  | 'image'
  | 'image-multiple'
  | 'inbox'
  | 'information-outline'
  | 'link'
  | 'list'
  | 'logout'
  | 'magnify-plus'
  | 'microphone-outline'
  | 'moon-waning-crescent'
  | 'office-building'
  | 'open-in-new'
  | 'paperclip'
  | 'pause'
  | 'person'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'reply'
  | 'search'
  | 'selector'
  | 'send'
  | 'shield-check'
  | 'shield-lock-outline'
  | 'sort'
  | 'star'
  | 'stop'
  | 'tag'
  | 'theme-light-dark'
  | 'trash-can-outline'
  | 'view-board'
  | 'view-column'
  | 'waveform'
  | 'white-balance-sunny';

const SF_MAP: Partial<Record<IconName, SFSymbol>> = {
  'account-circle': 'person.crop.circle',
  'account-edit-outline': 'person.crop.circle',
  'account-group': 'person.2',
  'alert-circle': 'exclamationmark.circle',
  'apple': 'apple.logo',
  'archive': 'archivebox',
  'archive-restore': 'arrow.up.bin',
  'arrow-down': 'arrow.down',
  'arrow-left': 'arrow.left',
  'arrow-up': 'arrow.up',
  'bell-outline': 'bell',
  'bell-off-outline': 'bell.slash',
  'briefcase-outline': 'briefcase',
  'calendar': 'calendar',
  'calendar-clock': 'calendar.badge.clock',
  'calendar-remove': 'calendar.badge.minus',
  'calendar-today': 'calendar',
  'camera': 'camera',
  'check': 'checkmark',
  'check-box': 'checkmark.square.fill',
  'check-box-outline': 'square',
  'check-circle': 'checkmark.circle.fill',
  'chevron-down': 'chevron.down',
  'chevron-left': 'chevron.left',
  'chevron-right': 'chevron.right',
  'chevron-up': 'chevron.up',
  'circle-outline': 'circle',
  'clock-outline': 'clock',
  'close': 'xmark',
  'cloud-off': 'icloud.slash',
  'content-copy': 'doc.on.doc',
  'dots-horizontal': 'ellipsis',
  'dots-vertical': 'ellipsis',
  'download': 'arrow.down.circle',
  'drag-handle': 'line.3.horizontal',
  'earth': 'globe',
  'edit': 'pencil',
  'email-outline': 'envelope',
  'eye': 'eye',
  'eye-off': 'eye.slash',
  'file-archive': 'doc.zipper',
  'file-document-outline': 'doc.text',
  'file-excel': 'tablecells',
  'file-music': 'music.note',
  'file-pdf': 'doc.richtext',
  'filter': 'line.3.horizontal.decrease',
  'flag': 'flag',
  'folder-outline': 'folder',
  'forum-outline': 'bubble.left.and.bubble.right',
  'forward': 'arrowshape.turn.up.right',
  'image': 'photo',
  'image-multiple': 'photo.on.rectangle',
  'inbox': 'tray',
  'information-outline': 'info.circle',
  'link': 'link',
  'list': 'list.bullet',
  'logout': 'rectangle.portrait.and.arrow.right',
  'magnify-plus': 'plus.magnifyingglass',
  'microphone-outline': 'mic',
  'moon-waning-crescent': 'moon',
  'office-building': 'building.2',
  'open-in-new': 'arrow.up.forward.square',
  'paperclip': 'paperclip',
  'pause': 'pause.fill',
  'person': 'person',
  'play': 'play.fill',
  'plus': 'plus',
  'refresh': 'arrow.clockwise',
  'reply': 'arrowshape.turn.up.left',
  'search': 'magnifyingglass',
  'selector': 'chevron.up.chevron.down',
  'send': 'paperplane.fill',
  'shield-check': 'checkmark.shield',
  'shield-lock-outline': 'lock.shield',
  'sort': 'arrow.up.arrow.down',
  'star': 'star',
  'stop': 'stop.fill',
  'tag': 'tag',
  'theme-light-dark': 'circle.lefthalf.filled',
  'trash-can-outline': 'trash',
  'view-board': 'square.grid.2x2',
  'view-column': 'rectangle.split.3x1',
  'waveform': 'waveform',
  'white-balance-sunny': 'sun.max',
};

// Android Material Icons mapping for a more native Android feel
const ANDROID_MAP: Partial<Record<IconName, React.ComponentProps<typeof MaterialIcons>['name']>> = {
  'account-circle': 'account-circle',
  'account-edit-outline': 'person-outline',
  'account-group': 'group',
  'alert-circle': 'error-outline',
  'apple': 'apple',
  'archive': 'archive',
  'archive-restore': 'unarchive',
  'arrow-down': 'arrow-downward',
  'arrow-left': 'arrow-back',
  'arrow-up': 'arrow-upward',
  'bell-outline': 'notifications-none',
  'bell-off-outline': 'notifications-off',
  'briefcase-outline': 'work-outline',
  'calendar': 'event',
  'calendar-clock': 'schedule',
  'calendar-remove': 'event-busy',
  'calendar-today': 'today',
  'camera': 'camera-alt',
  'check': 'check',
  'check-all': 'done-all',
  'check-box': 'check-box',
  'check-box-outline': 'check-box-outline-blank',
  'check-circle': 'check-circle',
  'chevron-down': 'keyboard-arrow-down',
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  'chevron-up': 'keyboard-arrow-up',
  'circle-outline': 'radio-button-unchecked',
  'clock-outline': 'access-time',
  'close': 'close',
  'cloud-off': 'cloud-off',
  'content-copy': 'content-copy',
  'dots-horizontal': 'more-horiz',
  'dots-vertical': 'more-vert',
  'download': 'download',
  'drag-handle': 'drag-indicator',
  'earth': 'public',
  'edit': 'edit',
  'email-outline': 'mail-outline',
  'eye': 'visibility',
  'eye-off': 'visibility-off',
  'file-archive': 'folder-zip',
  'file-document-outline': 'description',
  'file-excel': 'table-chart',
  'file-music': 'audiotrack',
  'file-pdf': 'picture-as-pdf',
  'filter': 'filter-list',
  'flag': 'flag',
  'folder-outline': 'folder-open',
  'forum-outline': 'forum',
  'forward': 'forward',
  'image': 'image',
  'image-multiple': 'photo-library',
  'inbox': 'inbox',
  'information-outline': 'info-outline',
  'link': 'link',
  'list': 'view-list',
  'logout': 'logout',
  'magnify-plus': 'zoom-in',
  'microphone-outline': 'mic-none',
  'moon-waning-crescent': 'nightlight',
  'office-building': 'business',
  'open-in-new': 'open-in-new',
  'paperclip': 'attach-file',
  'pause': 'pause',
  'person': 'person-outline',
  'play': 'play-arrow',
  'plus': 'add',
  'refresh': 'refresh',
  'reply': 'reply',
  'search': 'search',
  'selector': 'unfold-more',
  'send': 'send',
  'shield-check': 'verified-user',
  'shield-lock-outline': 'security',
  'sort': 'sort',
  'star': 'star',
  'stop': 'stop',
  'tag': 'label',
  'theme-light-dark': 'brightness-medium',
  'trash-can-outline': 'delete-outline',
  'view-board': 'dashboard',
  'view-column': 'view-column',
  'waveform': 'graphic-eq',
  'white-balance-sunny': 'wb-sunny',
};

// Ionicons fallback for names without a platform-native mapping
const ION_MAP: Partial<Record<IconName, React.ComponentProps<typeof Ionicons>['name']>> = {
  'check-all': 'checkmark-done',
  'moon-waning-crescent': 'moon-outline',
  'theme-light-dark': 'contrast-outline',
  'waveform': 'pulse-outline',
  'white-balance-sunny': 'sunny-outline',
};

type Props = { name: IconName; size: number; color: string };

export function PlatformIcon({ name, size, color }: Props) {
  if (Platform.OS === 'ios') {
    const sf = SF_MAP[name];
    if (sf) {
      return (
        <SymbolView
          name={sf}
          size={size}
          tintColor={color}
          style={{ width: size, height: size }}
        />
      );
    }
    const ion = ION_MAP[name];
    if (ion) return <Ionicons color={color} name={ion} size={size} />;
    return <Ionicons color={color} name="help-circle-outline" size={size} />;
  }

  // Android: prefer Material Icons, then Ionicons
  const mat = ANDROID_MAP[name];
  if (mat) return <MaterialIcons color={color} name={mat} size={size} />;
  const ion = ION_MAP[name];
  if (ion) return <Ionicons color={color} name={ion} size={size} />;
  return <Ionicons color={color} name="help-circle-outline" size={size} />;
}
