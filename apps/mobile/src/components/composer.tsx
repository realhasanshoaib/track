import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect, useState } from 'react';

import type { DetailedMessage } from '@/components/thread-row';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDuration, useLocale } from '@/i18n';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from 'react-i18next';

type Props = {
  activeGroupName: string | null;
  busy: boolean;
  isRecording: boolean;
  recordingDuration?: number;
  onAttach: () => void;
  onCancelReply: () => void;
  onChangeText: (v: string) => void;
  onFocus?: () => void;
  onRecord: () => void;
  onSend: () => void;
  replyTo: DetailedMessage | null;
  value: string;
};

function RecordingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 800 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.recordingDotBase, style]} />;
}

export function Composer({ activeGroupName, busy, isRecording, recordingDuration = 0, onAttach, onCancelReply, onChangeText, onFocus, onRecord, onSend, replyTo, value }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('chat');
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const canSend = Boolean(value.trim()) && !busy;

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <View style={[
      styles.bar,
      {
        backgroundColor: theme.background,
        borderTopColor: theme.hairline,
        paddingBottom: keyboardVisible ? Spacing.two : insets.bottom > 0 ? insets.bottom : Spacing.three,
      },
    ]}>
      {replyTo ? (
        <View style={[styles.replyBanner, { backgroundColor: theme.backgroundElement }, direction === 'rtl' && styles.rtlRow]}>
          <View style={[styles.replyAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.replyBody}>
            <ThemedText style={{ color: theme.textSecondary }} type="code">
              {t('composer.replyingTo', { name: replyTo.author?.displayName ?? t('composer.member') })}
            </ThemedText>
            <ThemedText contentDirection="auto" numberOfLines={1} type="small">{replyTo.message.body}</ThemedText>
          </View>
          <Pressable accessibilityLabel={t('composer.cancelReply')} hitSlop={12} onPress={onCancelReply}>
            <PlatformIcon color={theme.textSecondary} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.row, direction === 'rtl' && styles.rtlRow]}>
        <Pressable
          accessibilityLabel={t('composer.attach')}
          android_ripple={{ color: theme.backgroundSelected, borderless: true }}
          hitSlop={8}
          onPress={() => { hapticLight(); onAttach(); }}
          style={[styles.circle, { backgroundColor: theme.backgroundElement }]}>
          <PlatformIcon color={theme.textSecondary} name="paperclip" size={20} />
        </Pressable>

        {isRecording ? (
          <View style={[styles.recordingBar, { backgroundColor: theme.backgroundElement }, direction === 'rtl' && styles.rtlRow]}>
            <RecordingDot />
            <ThemedText type="small">{t('composer.recording')}</ThemedText>
            <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">
              {formatDuration(locale, Math.floor(recordingDuration / 1000))}
            </ThemedText>
            <Pressable
              accessibilityLabel={t('composer.stopRecording')}
              android_ripple={{ color: theme.backgroundSelected, borderless: true }}
              hitSlop={8}
              onPress={() => { hapticLight(); onRecord(); }}
              style={[styles.stopButton, { backgroundColor: theme.backgroundSelected }]}>
              <PlatformIcon color="#b91c1c" name="stop" size={18} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.inputRow, direction === 'rtl' && styles.rtlRow]}>
            <TextInput
              allowFontScaling
              accessibilityLabel={t('composer.messageAccessibility')}
              multiline
              onChangeText={onChangeText}
              onFocus={onFocus}
              placeholder={t('composer.messagePlaceholder', { name: activeGroupName ?? t('channel.name') })}
              placeholderTextColor={theme.textSecondary}
              style={[styles.pill, { backgroundColor: theme.backgroundElement, color: theme.text, flex: 1, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
              value={value}
            />
            {canSend ? (
              <Pressable
                accessibilityLabel={t('composer.send')}
                android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                hitSlop={8}
                onPress={() => { hapticMedium(); onSend(); }}
                style={[styles.sendInline, { backgroundColor: theme.accent }]}>
                <PlatformIcon color="#1b1917" name="arrow-up" size={18} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel={t('composer.record')}
                android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                hitSlop={8}
                onPress={() => { hapticLight(); onRecord(); }}
                style={[styles.micInline, { backgroundColor: theme.backgroundElement }]}>
                <PlatformIcon color={theme.textSecondary} name="microphone-outline" size={20} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const BTN = Platform.select({ ios: 44, android: 48 }) ?? 44;

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  circle: { alignItems: 'center', borderRadius: BTN / 2, height: BTN, justifyContent: 'center', width: BTN },
  inputRow: { alignItems: 'flex-end', flex: 1, flexDirection: 'row' },
  micInline: { alignItems: 'center', borderRadius: BTN / 2, height: BTN, justifyContent: 'center', marginStart: Spacing.two, width: BTN },
  pill: { borderRadius: 20, fontSize: 14, lineHeight: 20, maxHeight: 112, minHeight: BTN, paddingHorizontal: Spacing.three, paddingVertical: Platform.OS === 'ios' ? 10 : 8 },
  recordingBar: { alignItems: 'center', borderRadius: 20, flex: 1, flexDirection: 'row', gap: Spacing.two, height: BTN, paddingHorizontal: Spacing.three },
  recordingDotBase: { backgroundColor: '#b91c1c', borderRadius: 5, height: 10, width: 10 },
  replyAccent: { borderRadius: 2, width: 3 },
  replyBanner: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  replyBody: { flex: 1, gap: 2 },
  row: { alignItems: 'flex-end', flexDirection: 'row', gap: Spacing.two },
  rtlRow: { flexDirection: 'row-reverse' },
  sendInline: { alignItems: 'center', borderRadius: BTN / 2, height: BTN, justifyContent: 'center', marginStart: Spacing.two, width: BTN },
  stopButton: { alignItems: 'center', borderRadius: BTN / 2, height: BTN, justifyContent: 'center', width: BTN },
});
