import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';

import { useThemeOverride } from '@/contexts/theme-override-context';
import { SheetFieldButton } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import {
  localTaskDate,
  parseTaskDate,
  taskDateFromOffset,
  taskDueDisplay,
} from '@/lib/task-presentation';

type Props = {
  autoOpen?: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (value: string | null) => void;
  value?: string | null;
};

type AndroidCalendarDayProps = {
  date?: DateData;
  state?: 'disabled' | 'inactive' | 'selected' | 'today' | '';
};

const quickChoices = [
  { icon: 'calendar-today', label: 'Today', offset: 0 },
  { icon: 'calendar-clock', label: 'Tomorrow', offset: 1 },
  { icon: 'calendar', label: 'Next week', offset: 7 },
] as const;

/**
 * A due-date control. The value stays the `YYYY-MM-DD` string the backend
 * validates; the reader only ever sees a human date.
 */
export function DateField({ autoOpen, disabled, label = 'Due date', onChange, value }: Props) {
  const theme = useTheme();
  const { theme: scheme } = useThemeOverride();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [webPickerVisible, setWebPickerVisible] = useState(false);
  const [androidDraft, setAndroidDraft] = useState<string | null>(value ?? null);
  const display = taskDueDisplay(value);
  const selected = (value ? parseTaskDate(value) : null) ?? new Date();
  const androidCalendarDate = androidDraft ?? value ?? localTaskDate(new Date());

  function commit(next: string | null) {
    hapticLight();
    onChange(next);
  }

  function pick(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'web') setWebPickerVisible(false);
    if (event.type === 'dismissed' || !date) return;
    commit(localTaskDate(date));
  }

  function pickAndroid(day: DateData) {
    setAndroidDraft(day.dateString);
    hapticLight();
  }

  function openPicker() {
    if (disabled) return;
    if (Platform.OS === 'android') {
      setAndroidDraft(value ?? null);
      setOpen(true);
      return;
    }
    setOpen((current) => !current);
  }

  function closeAndroidPicker() {
    setAndroidDraft(value ?? null);
    setOpen(false);
  }

  function applyAndroidDate() {
    commit(androidDraft);
    setOpen(false);
  }

  function renderAndroidDay({ date, state }: AndroidCalendarDayProps) {
    if (!date) return null;
    const spokenDate = parseTaskDate(date.dateString);
    if (!spokenDate) return null;
    const active = androidDraft === date.dateString;
    const today = state === 'today';
    return (
      <Pressable
        accessibilityLabel={spokenDate.toLocaleDateString(undefined, {
          day: 'numeric', month: 'long', year: 'numeric',
        })}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        android_ripple={{ color: theme.accentSoft, borderless: false }}
        hitSlop={2}
        onPress={() => pickAndroid(date)}
        style={[styles.calendarDay, {
          backgroundColor: active ? theme.accent : 'transparent',
          borderColor: today && !active ? theme.accent : 'transparent',
        }]}>
        <ThemedText style={{ color: active ? theme.background : theme.text }} type={active ? 'smallBold' : 'small'}>
          {date.day}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      {Platform.OS !== 'android' || !autoOpen ? (
        <SheetFieldButton
          icon="calendar"
          label={label}
          onClear={value ? () => commit(null) : undefined}
          onPress={openPicker}
          placeholder="No due date"
          value={display?.label}
        />
      ) : (
        <ThemedText themeColor="textSecondary" type="caption">
          Current: {display?.label ?? 'No due date'}
        </ThemedText>
      )}
      {open && !disabled && Platform.OS !== 'android' ? (
        <View style={styles.panel}>
          <View style={styles.chips}>
            {quickChoices.map((choice) => {
              const target = taskDateFromOffset(choice.offset);
              const active = value === target;
              return (
                <Pressable
                  accessibilityLabel={`${choice.label} due date`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={choice.label}
                  onPress={() => commit(target)}
                  style={[styles.chip, {
                    backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                    borderColor: active ? theme.accent : theme.hairline,
                  }]}>
                  <PlatformIcon
                    color={active ? theme.accentStrong : theme.textSecondary}
                    name={choice.icon}
                    size={16}
                  />
                  <ThemedText themeColor={active ? 'accentStrong' : 'text'} type="label">
                    {choice.label}
                  </ThemedText>
                </Pressable>
              );
            })}
            {value ? (
              <Pressable
                accessibilityLabel="Clear due date"
                accessibilityRole="button"
                onPress={() => commit(null)}
                style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <PlatformIcon color={theme.textSecondary} name="calendar-remove" size={16} />
                <ThemedText type="label">Clear</ThemedText>
              </Pressable>
            ) : null}
          </View>
          {Platform.OS === 'ios' ? (
            <View style={[styles.calendar, { backgroundColor: theme.backgroundElement }]}>
              <DateTimePicker
                accentColor={theme.accent}
                display="inline"
                mode="date"
                onChange={pick}
                style={styles.iosDatePicker}
                themeVariant={scheme}
                value={selected}
              />
            </View>
          ) : (
            <>
              <Pressable
                accessibilityLabel="Choose a date"
                accessibilityRole="button"
                onPress={() => setWebPickerVisible(true)}
                style={[styles.picker, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                <PlatformIcon color={theme.textSecondary} name="calendar" size={19} />
                <ThemedText type="small">Choose a date...</ThemedText>
              </Pressable>
              {webPickerVisible ? (
                <DateTimePicker display="default" mode="date" onChange={pick} value={selected} />
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {open && !disabled && Platform.OS === 'android' && autoOpen ? (
        <View style={styles.embeddedCalendar}>
          <View style={styles.chips}>
            {quickChoices.map((choice) => {
              const target = taskDateFromOffset(choice.offset);
              const active = androidDraft === target;
              return (
                <Pressable
                  accessibilityLabel={`${choice.label} due date`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={choice.label}
                  onPress={() => { hapticLight(); setAndroidDraft(target); }}
                  style={[styles.chip, {
                    backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                    borderColor: active ? theme.accent : theme.hairline,
                  }]}>
                  <PlatformIcon color={active ? theme.accentStrong : theme.textSecondary} name={choice.icon} size={16} />
                  <ThemedText themeColor={active ? 'accentStrong' : 'text'} type="label">{choice.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.calendar, styles.androidCalendar, {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.hairline,
          }]}>
            <Calendar
              accessibilityLabel="Due date calendar"
              current={androidCalendarDate}
              dayComponent={renderAndroidDay}
              enableSwipeMonths
              hideExtraDays
              key={androidCalendarDate.slice(0, 7)}
              renderArrow={(direction) => (
                <View style={styles.calendarArrow}>
                  <PlatformIcon color={theme.accentStrong} name={direction === 'left' ? 'chevron-left' : 'chevron-right'} size={20} />
                </View>
              )}
              style={styles.calendarSurface}
              theme={{
                arrowColor: theme.accentStrong,
                backgroundColor: theme.backgroundElement,
                calendarBackground: theme.backgroundElement,
                dayTextColor: theme.text,
                monthTextColor: theme.text,
                selectedDayBackgroundColor: theme.accent,
                selectedDayTextColor: theme.background,
                textDayFontFamily: Fonts?.sansMedium,
                textDayFontSize: Typography.body.fontSize,
                textDayFontWeight: '500',
                textDayHeaderFontFamily: Fonts?.sansSemibold,
                textDayHeaderFontSize: Typography.caption.fontSize,
                textDayHeaderFontWeight: '600',
                textDisabledColor: theme.textTertiary,
                textMonthFontFamily: Fonts?.sansSemibold,
                textMonthFontSize: Typography.subtitle.fontSize,
                textMonthFontWeight: '600',
                textSectionTitleColor: theme.textSecondary,
                todayTextColor: theme.accentStrong,
              }}
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={() => setAndroidDraft(null)} style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="label">Clear</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={applyAndroidDate} style={[styles.actionButton, styles.applyButton, { backgroundColor: theme.accent }]}>
              <ThemedText style={{ color: theme.accentInk }} type="label">Apply</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}
      {Platform.OS === 'android' ? (
        <Modal
          animationType="fade"
          navigationBarTranslucent
          onRequestClose={closeAndroidPicker}
          statusBarTranslucent
          transparent
          visible={open && !disabled && !autoOpen}>
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityLabel="Dismiss due date calendar"
              accessibilityRole="button"
              onPress={closeAndroidPicker}
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
            />
            <View
              accessibilityViewIsModal
              style={[styles.modalCard, {
                backgroundColor: theme.backgroundElevated,
                borderColor: theme.hairline,
              }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeading}>
                  <ThemedText type="subtitle">Choose due date</ThemedText>
                  <ThemedText themeColor="textSecondary" type="caption">
                    {taskDueDisplay(androidDraft)?.label ?? 'No due date selected'}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityLabel="Close calendar"
                  accessibilityRole="button"
                  android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                  onPress={closeAndroidPicker}
                  style={[styles.closeButton, { backgroundColor: theme.backgroundElement }]}>
                  <PlatformIcon color={theme.textSecondary} name="close" size={20} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.modalContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}>
                <View style={[styles.chips, styles.modalChips]}>
                  {quickChoices.map((choice) => {
                    const target = taskDateFromOffset(choice.offset);
                    const active = androidDraft === target;
                    return (
                      <Pressable
                        accessibilityLabel={`${choice.label} due date`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        key={choice.label}
                        onPress={() => { hapticLight(); setAndroidDraft(target); }}
                        style={[styles.chip, {
                          backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                          borderColor: active ? theme.accent : theme.hairline,
                        }]}>
                        <PlatformIcon
                          color={active ? theme.accentStrong : theme.textSecondary}
                          name={choice.icon}
                          size={16}
                        />
                        <ThemedText themeColor={active ? 'accentStrong' : 'text'} type="label">
                          {choice.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.calendar, styles.androidCalendar, {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.hairline,
                }]}>
                  <Calendar
                    accessibilityLabel="Due date calendar"
                    current={androidCalendarDate}
                    dayComponent={renderAndroidDay}
                    enableSwipeMonths
                    hideExtraDays
                    key={androidCalendarDate.slice(0, 7)}
                    renderArrow={(direction) => (
                      <View style={styles.calendarArrow}>
                        <PlatformIcon
                          color={theme.accentStrong}
                          name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
                          size={20}
                        />
                      </View>
                    )}
                    style={styles.calendarSurface}
                    theme={{
                      arrowColor: theme.accentStrong,
                      backgroundColor: theme.backgroundElement,
                      calendarBackground: theme.backgroundElement,
                      dayTextColor: theme.text,
                      monthTextColor: theme.text,
                      selectedDayBackgroundColor: theme.accent,
                      selectedDayTextColor: theme.background,
                      textDayFontFamily: Fonts?.sansMedium,
                      textDayFontSize: Typography.body.fontSize,
                      textDayFontWeight: '500',
                      textDayHeaderFontFamily: Fonts?.sansSemibold,
                      textDayHeaderFontSize: Typography.caption.fontSize,
                      textDayHeaderFontWeight: '600',
                      textDisabledColor: theme.textTertiary,
                      textMonthFontFamily: Fonts?.sansSemibold,
                      textMonthFontSize: Typography.subtitle.fontSize,
                      textMonthFontWeight: '600',
                      textSectionTitleColor: theme.textSecondary,
                      todayTextColor: theme.accentStrong,
                    }}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { hapticLight(); setAndroidDraft(null); }}
                  style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="label">Clear</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={applyAndroidDate}
                  style={[styles.actionButton, styles.applyButton, { backgroundColor: theme.accent }]}>
                  <ThemedText style={{ color: theme.accentInk }} type="label">Apply</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  androidCalendar: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: Spacing.four,
  },
  applyButton: { flex: 1 },
  calendar: { borderRadius: Radius.large, minWidth: 0, overflow: 'hidden', paddingHorizontal: 0, width: '100%' },
  calendarArrow: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  iosDatePicker: {
    alignSelf: 'center',
    flexShrink: 1,
    maxWidth: '100%',
    transform: [{ scale: 0.88 }],
    width: '100%',
  },
  calendarDay: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: TouchTarget,
    justifyContent: 'center',
    maxWidth: 42,
    overflow: 'hidden',
    width: '100%',
  },
  calendarSurface: { paddingBottom: Spacing.two, paddingHorizontal: 0 },
  chip: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  closeButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
  },
  modalCard: {
    borderRadius: Radius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.four,
    maxHeight: '92%',
    maxWidth: 440,
    paddingVertical: Spacing.four,
    width: '100%',
  },
  modalChips: { paddingHorizontal: Spacing.four },
  modalContent: { gap: Spacing.four },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  modalHeading: { flex: 1, gap: Spacing.one },
  modalRoot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.six,
  },
  modalScroll: { flexShrink: 1 },
  embeddedCalendar: { gap: Spacing.three },
  panel: { gap: Spacing.three, paddingTop: Spacing.one },
  picker: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  wrap: { gap: Spacing.two },
});
