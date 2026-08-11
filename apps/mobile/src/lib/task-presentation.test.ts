import { describe, expect, it } from 'vitest';

import {
  formatTaskDate,
  localTaskDate,
  taskActivityLabel,
  taskDueLabel,
  taskLabelColor,
  taskPriorityGlyph,
  taskPriorityLabel,
  taskStateTone,
} from './task-presentation';

describe('task presentation', () => {
  it('formats priority and state metadata', () => {
    expect(taskPriorityLabel('urgent')).toBe('Urgent');
    expect(taskPriorityLabel('none')).toBe('No priority');
    expect(taskPriorityGlyph('high')).toBe('!!');
    expect(taskStateTone('completed')).toBe('success');
    expect(taskStateTone('started')).toBe('active');
  });

  it('uses translated labels without changing machine values', () => {
    const translated = (key: string, options?: Record<string, unknown>) => {
      if (key === 'priority.urgent') return 'عاجلة';
      if (key === 'task.due') return `الاستحقاق ${String(options?.date)}`;
      if (key === 'task.activityCreated') return 'أنشأ هذه المهمة';
      return key;
    };
    expect(taskPriorityLabel('urgent', translated)).toBe('عاجلة');
    expect(taskDueLabel('2026-07-31', '2026-07-30', undefined, {
      locale: 'ar-u-nu-latn',
      t: translated,
    })).toContain('الاستحقاق');
    expect(taskActivityLabel('created', translated)).toBe('أنشأ هذه المهمة');
    expect(formatTaskDate('2026-07-31', 'ar-u-nu-latn')).toMatch(/31/);
    expect(formatTaskDate('2026-07-31', 'ar-u-nu-latn')).not.toMatch(/[٠-٩]/);
  });

  it('describes due dates relative to the supplied local date', () => {
    expect(localTaskDate(new Date(2026, 6, 30, 23, 30))).toBe('2026-07-30');
    expect(taskDueLabel(undefined, '2026-07-30')).toBeNull();
    expect(taskDueLabel('2026-07-30', '2026-07-30')).toBe('Due today');
    expect(taskDueLabel('2026-07-29', '2026-07-30')).toContain('Overdue');
    expect(taskDueLabel('2026-07-29', '2026-07-30', 'completed')).toMatch(/^Due /);
    expect(taskDueLabel('2026-07-29', '2026-07-30', 'canceled')).not.toContain('Overdue');
    expect(formatTaskDate('not-a-date')).toBe('not-a-date');
  });

  it('uses human activity descriptions', () => {
    expect(taskActivityLabel('state_changed')).toBe('Changed the status');
    expect(taskActivityLabel('created')).toBe('Created this task');
  });

  it('resolves stored label tokens to native colors', () => {
    expect(taskLabelColor('blue', '#000')).toBe('#2563eb');
    expect(taskLabelColor('#abc', '#000')).toBe('#abc');
    expect(taskLabelColor('unknown', '#000')).toBe('#000');
  });
});
