import medium from 'expo-symbols/androidWeights/medium';
import regular from 'expo-symbols/androidWeights/regular';
import semibold from 'expo-symbols/androidWeights/semiBold';
import {
  SymbolView,
  type AndroidSymbol,
  type AnimationSpec,
  type SFSymbol,
  type SymbolWeight,
} from 'expo-symbols';

export type IconName =
  | 'account-circle'
  | 'account-edit-outline'
  | 'account-group'
  | 'analytics'
  | 'alert-circle'
  | 'apple'
  | 'at-sign'
  | 'archive'
  | 'archive-restore'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-up'
  | 'bell-outline'
  | 'bell-off-outline'
  | 'bookmark'
  | 'calendar'
  | 'calendar-clock'
  | 'calendar-remove'
  | 'calendar-today'
  | 'camera'
  | 'channel'
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
  | 'evidence'
  | 'eye'
  | 'eye-off'
  | 'file-archive'
  | 'file-document-outline'
  | 'file-excel'
  | 'file-music'
  | 'file-pdf'
  | 'filter'
  | 'flag'
  | 'forward'
  | 'home'
  | 'image'
  | 'image-multiple'
  | 'inbox'
  | 'information-outline'
  | 'lightbulb-outline'
  | 'link'
  | 'list'
  | 'logout'
  | 'magnify-plus'
  | 'message'
  | 'microphone-outline'
  | 'moon-waning-crescent'
  | 'office-building'
  | 'open-in-new'
  | 'paperclip'
  | 'pause'
  | 'person'
  | 'play'
  | 'plus'
  | 'project'
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
  | 'subtask'
  | 'tag'
  | 'task'
  | 'theme-light-dark'
  | 'thread'
  | 'trash-can-outline'
  | 'tune'
  | 'view-board'
  | 'view-column'
  | 'waveform'
  | 'white-balance-sunny';

type SymbolDefinition = {
  android: AndroidSymbol;
  androidFilled?: AndroidSymbol;
  ios: SFSymbol;
  iosFilled?: SFSymbol;
};

const SYMBOLS: Record<IconName, SymbolDefinition> = {
  'account-circle': { android: 'account_circle', ios: 'person.crop.circle', iosFilled: 'person.crop.circle.fill' },
  'account-edit-outline': { android: 'manage_accounts', ios: 'person.crop.circle.badge.checkmark' },
  'account-group': { android: 'group', ios: 'person.2', iosFilled: 'person.2.fill' },
  analytics: { android: 'analytics', ios: 'chart.bar.xaxis', iosFilled: 'chart.bar.xaxis' },
  'alert-circle': { android: 'error', ios: 'exclamationmark.circle', iosFilled: 'exclamationmark.circle.fill' },
  apple: { android: 'phone_iphone', ios: 'apple.logo' },
  'at-sign': { android: 'alternate_email', ios: 'at' },
  archive: { android: 'archive', ios: 'archivebox', iosFilled: 'archivebox.fill' },
  'archive-restore': { android: 'unarchive', ios: 'arrow.up.bin' },
  'arrow-down': { android: 'arrow_downward', ios: 'arrow.down' },
  'arrow-left': { android: 'arrow_back', ios: 'arrow.left' },
  'arrow-up': { android: 'arrow_upward', ios: 'arrow.up' },
  'bell-outline': { android: 'notifications', ios: 'bell', iosFilled: 'bell.fill' },
  'bell-off-outline': { android: 'notifications_off', ios: 'bell.slash', iosFilled: 'bell.slash.fill' },
  bookmark: { android: 'bookmark_border', androidFilled: 'bookmark', ios: 'bookmark', iosFilled: 'bookmark.fill' },
  calendar: { android: 'calendar_month', ios: 'calendar' },
  'calendar-clock': { android: 'event_upcoming', ios: 'calendar.badge.clock' },
  'calendar-remove': { android: 'event_busy', ios: 'calendar.badge.minus' },
  'calendar-today': { android: 'today', ios: 'calendar' },
  camera: { android: 'photo_camera', ios: 'camera', iosFilled: 'camera.fill' },
  channel: { android: 'tag', ios: 'number' },
  check: { android: 'check', ios: 'checkmark' },
  'check-all': { android: 'done_all', ios: 'checkmark.circle', iosFilled: 'checkmark.circle.fill' },
  'check-box': { android: 'check_box', ios: 'checkmark.square.fill' },
  'check-box-outline': { android: 'check_box_outline_blank', ios: 'square' },
  'check-circle': { android: 'check_circle', ios: 'checkmark.circle', iosFilled: 'checkmark.circle.fill' },
  'chevron-down': { android: 'expand_more', ios: 'chevron.down' },
  'chevron-left': { android: 'chevron_left', ios: 'chevron.left' },
  'chevron-right': { android: 'chevron_right', ios: 'chevron.right' },
  'chevron-up': { android: 'expand_less', ios: 'chevron.up' },
  'circle-outline': { android: 'circle', ios: 'circle' },
  'clock-outline': { android: 'schedule', ios: 'clock', iosFilled: 'clock.fill' },
  close: { android: 'close', ios: 'xmark' },
  'cloud-off': { android: 'cloud_off', ios: 'icloud.slash' },
  'content-copy': { android: 'content_copy', ios: 'doc.on.doc' },
  'dots-horizontal': { android: 'more_horiz', ios: 'ellipsis' },
  'dots-vertical': { android: 'more_vert', ios: 'ellipsis' },
  download: { android: 'download', ios: 'arrow.down.circle', iosFilled: 'arrow.down.circle.fill' },
  'drag-handle': { android: 'drag_handle', ios: 'line.3.horizontal' },
  earth: { android: 'public', ios: 'globe' },
  edit: { android: 'edit', ios: 'pencil' },
  'email-outline': { android: 'mail', ios: 'envelope', iosFilled: 'envelope.fill' },
  evidence: { android: 'find_in_page', ios: 'doc.text.magnifyingglass' },
  eye: { android: 'visibility', ios: 'eye', iosFilled: 'eye.fill' },
  'eye-off': { android: 'visibility_off', ios: 'eye.slash', iosFilled: 'eye.slash.fill' },
  'file-archive': { android: 'folder_zip', ios: 'doc.zipper' },
  'file-document-outline': { android: 'description', ios: 'doc.text', iosFilled: 'doc.text.fill' },
  'file-excel': { android: 'table_view', ios: 'tablecells', iosFilled: 'tablecells.fill' },
  'file-music': { android: 'audio_file', ios: 'music.note' },
  'file-pdf': { android: 'picture_as_pdf', ios: 'doc.richtext', iosFilled: 'doc.richtext.fill' },
  filter: { android: 'filter_list', ios: 'line.3.horizontal.decrease' },
  flag: { android: 'flag', ios: 'flag', iosFilled: 'flag.fill' },
  forward: { android: 'forward', ios: 'arrowshape.turn.up.right', iosFilled: 'arrowshape.turn.up.right.fill' },
  home: { android: 'home', androidFilled: 'home_filled', ios: 'house', iosFilled: 'house.fill' },
  image: { android: 'image', ios: 'photo', iosFilled: 'photo.fill' },
  'image-multiple': { android: 'photo_library', ios: 'photo.on.rectangle', iosFilled: 'photo.fill.on.rectangle.fill' },
  inbox: { android: 'inbox', ios: 'tray', iosFilled: 'tray.full.fill' },
  'information-outline': { android: 'info', ios: 'info.circle', iosFilled: 'info.circle.fill' },
  'lightbulb-outline': { android: 'lightbulb', ios: 'lightbulb', iosFilled: 'lightbulb.fill' },
  link: { android: 'link', ios: 'link' },
  list: { android: 'format_list_bulleted', ios: 'list.bullet' },
  logout: { android: 'logout', ios: 'rectangle.portrait.and.arrow.right' },
  'magnify-plus': { android: 'zoom_in', ios: 'plus.magnifyingglass' },
  message: { android: 'chat_bubble_outline', androidFilled: 'chat_bubble', ios: 'bubble.left', iosFilled: 'bubble.left.fill' },
  'microphone-outline': { android: 'mic', ios: 'mic', iosFilled: 'mic.fill' },
  'moon-waning-crescent': { android: 'dark_mode', ios: 'moon', iosFilled: 'moon.fill' },
  'office-building': { android: 'domain', ios: 'building.2', iosFilled: 'building.2.fill' },
  'open-in-new': { android: 'open_in_new', ios: 'arrow.up.forward.square' },
  paperclip: { android: 'attach_file', ios: 'paperclip' },
  pause: { android: 'pause', ios: 'pause.fill' },
  person: { android: 'person', ios: 'person', iosFilled: 'person.fill' },
  play: { android: 'play_arrow', ios: 'play.fill' },
  plus: { android: 'add', ios: 'plus' },
  project: { android: 'folder', ios: 'folder', iosFilled: 'folder.fill' },
  refresh: { android: 'refresh', ios: 'arrow.clockwise' },
  reply: { android: 'reply', ios: 'arrowshape.turn.up.left', iosFilled: 'arrowshape.turn.up.left.fill' },
  search: { android: 'search', ios: 'magnifyingglass' },
  selector: { android: 'unfold_more', ios: 'chevron.up.chevron.down' },
  send: { android: 'send', ios: 'paperplane', iosFilled: 'paperplane.fill' },
  'shield-check': { android: 'verified_user', ios: 'checkmark.shield', iosFilled: 'checkmark.shield.fill' },
  'shield-lock-outline': { android: 'admin_panel_settings', ios: 'lock.shield', iosFilled: 'lock.shield.fill' },
  sort: { android: 'sort', ios: 'arrow.up.arrow.down' },
  star: { android: 'star', ios: 'star', iosFilled: 'star.fill' },
  stop: { android: 'stop', ios: 'stop.fill' },
  subtask: { android: 'subdirectory_arrow_right', ios: 'arrow.turn.down.right' },
  tag: { android: 'sell', ios: 'tag', iosFilled: 'tag.fill' },
  task: { android: 'checklist', ios: 'checklist', iosFilled: 'checklist.checked' },
  'theme-light-dark': { android: 'contrast', ios: 'circle.lefthalf.filled' },
  thread: { android: 'forum', ios: 'bubble.left.and.bubble.right', iosFilled: 'bubble.left.and.bubble.right.fill' },
  'trash-can-outline': { android: 'delete', ios: 'trash', iosFilled: 'trash.fill' },
  tune: { android: 'tune', ios: 'slider.horizontal.3' },
  'view-board': { android: 'view_kanban', ios: 'rectangle.3.group', iosFilled: 'rectangle.3.group.fill' },
  'view-column': { android: 'view_column', ios: 'rectangle.split.3x1' },
  waveform: { android: 'graphic_eq', ios: 'waveform' },
  'white-balance-sunny': { android: 'light_mode', ios: 'sun.max', iosFilled: 'sun.max.fill' },
};

type IconWeight = Extract<SymbolWeight, 'regular' | 'medium' | 'semibold'>;

type Props = {
  animationSpec?: AnimationSpec;
  color: string;
  name: IconName;
  size: number;
  variant?: 'outline' | 'filled';
  weight?: IconWeight;
};

const ANDROID_WEIGHTS = { medium, regular, semibold } as const;

/** Platform-native semantic symbol. Medium weight keeps icons legible beside app text; fill marks active state. */
export function PlatformIcon({
  animationSpec,
  color,
  name,
  size,
  variant = 'outline',
  weight = 'medium',
}: Props) {
  const symbol = SYMBOLS[name];
  const filled = variant === 'filled';

  return (
    <SymbolView
      accessibilityElementsHidden
      accessible={false}
      animationSpec={animationSpec}
      name={{
        android: filled ? symbol.androidFilled ?? symbol.android : symbol.android,
        ios: filled ? symbol.iosFilled ?? symbol.ios : symbol.ios,
        web: filled ? symbol.androidFilled ?? symbol.android : symbol.android,
      }}
      resizeMode="scaleAspectFit"
      size={size}
      style={{ height: size, width: size }}
      tintColor={color}
      type="monochrome"
      weight={{ android: ANDROID_WEIGHTS[weight], ios: weight }}
    />
  );
}
