import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'

const weekdayLabels = [
  { full: 'Monday', short: 'Mo' },
  { full: 'Tuesday', short: 'Tu' },
  { full: 'Wednesday', short: 'We' },
  { full: 'Thursday', short: 'Th' },
  { full: 'Friday', short: 'Fr' },
  { full: 'Saturday', short: 'Sa' },
  { full: 'Sunday', short: 'Su' },
]

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function formatValue(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function formatLabel(value: string) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : 'Choose date'
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function clampToMonth(date: Date, month: Date) {
  return new Date(
    month.getFullYear(),
    month.getMonth(),
    Math.min(date.getDate(), daysInMonth(month)),
  )
}

function DatePicker({
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  className,
  disabled = false,
  onChange,
  value,
}: {
  'aria-label': string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'grammar' | 'spelling'
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  value: string
}) {
  const selectedDate = parseDate(value)
  const [open, setOpen] = useState(false)
  const monthHeadingId = useId()
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = selectedDate ?? new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [activeDate, setActiveDate] = useState(() => selectedDate ?? new Date())
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const nextDate = selectedDate ?? new Date()
    setActiveDate(nextDate)
    if (!selectedDate) return
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [value])
  useEffect(() => {
    if (!open) return
    const nextDate = selectedDate ?? new Date()
    setActiveDate(nextDate)
    setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
    requestAnimationFrame(() => dayRefs.current[formatValue(nextDate)]?.focus())
  }, [open])
  const days = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const offset = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
      const day = index - offset + 1
      return day > 0 && day <= daysInMonth ? new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day) : null
    })
  }, [visibleMonth])
  const todayValue = formatValue(new Date())
  const activeValue = formatValue(activeDate)
  const dayRows = useMemo(() => {
    const rows: Array<Array<Date | null>> = []
    for (let index = 0; index < days.length; index += 7) rows.push(days.slice(index, index + 7))
    return rows
  }, [days])

  function selectDate(date: Date) {
    const nextValue = formatValue(date)
    onChange(nextValue)
    setAnnouncement(`Selected ${formatLabel(nextValue)}`)
    setOpen(false)
  }

  function clearDate() {
    onChange('')
    setAnnouncement('Date cleared')
    setOpen(false)
  }

  function focusDate(date: Date) {
    setActiveDate(date)
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    requestAnimationFrame(() => dayRefs.current[formatValue(date)]?.focus())
  }

  function shiftMonth(amount: number) {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1)
    const nextDate = clampToMonth(activeDate, nextMonth)
    setVisibleMonth(nextMonth)
    setActiveDate(nextDate)
    requestAnimationFrame(() => dayRefs.current[formatValue(nextDate)]?.focus())
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    let nextDate: Date | null = null
    if (event.key === 'ArrowLeft') nextDate = addDays(date, -1)
    if (event.key === 'ArrowRight') nextDate = addDays(date, 1)
    if (event.key === 'ArrowUp') nextDate = addDays(date, -7)
    if (event.key === 'ArrowDown') nextDate = addDays(date, 7)
    if (event.key === 'Home') nextDate = addDays(date, -((date.getDay() + 6) % 7))
    if (event.key === 'End') nextDate = addDays(date, 6 - ((date.getDay() + 6) % 7))
    if (event.key === 'PageUp') nextDate = clampToMonth(date, new Date(date.getFullYear(), date.getMonth() - 1, 1))
    if (event.key === 'PageDown') nextDate = clampToMonth(date, new Date(date.getFullYear(), date.getMonth() + 1, 1))
    if (nextDate) {
      event.preventDefault()
      focusDate(nextDate)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectDate(date)
    }
  }

  return (
    <>
      <span aria-live="polite" className="sr-only" role="status">{announcement}</span>
      <div className="track-date-picker-control">
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger
            render={
              <button
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                aria-description={value ? `Selected ${formatLabel(value)}` : undefined}
                className={`track-date-picker-trigger${className ? ` ${className}` : ''}`}
                disabled={disabled}
                type="button"
              />
            }
          >
            <CalendarDays aria-hidden="true" size={14} />
            <span>{formatLabel(value)}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="track-date-picker-popover" sideOffset={6}>
            <div className="track-date-picker-header">
              <button aria-label="Previous month" onClick={() => shiftMonth(-1)} type="button"><ChevronLeft size={15} /></button>
              <strong aria-live="polite" id={monthHeadingId}>{monthLabel(visibleMonth)}</strong>
              <button aria-label="Next month" onClick={() => shiftMonth(1)} type="button"><ChevronRight size={15} /></button>
            </div>
            <div aria-labelledby={monthHeadingId} className="track-date-picker-grid" role="grid">
              <div className="track-date-picker-grid-row" role="row">
                {weekdayLabels.map(({ full, short }) => <span aria-label={full} className="track-date-picker-weekday" key={full} role="columnheader">{short}</span>)}
              </div>
              {dayRows.map((row, rowIndex) => <div className="track-date-picker-grid-row" key={`row-${rowIndex}`} role="row">
                {row.map((date, index) => {
                  const dateValue = date ? formatValue(date) : ''
                  const isSelected = dateValue === value
                  const isToday = dateValue === todayValue
                  return date ? (
                    <button
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date)}
                      aria-selected={isSelected}
                      className={`track-date-picker-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                      key={dateValue}
                      onClick={() => selectDate(date)}
                      onKeyDown={(event) => handleDayKeyDown(event, date)}
                      ref={(element) => { dayRefs.current[dateValue] = element }}
                      role="gridcell"
                      tabIndex={dateValue === activeValue ? 0 : -1}
                      type="button"
                    >
                      {date.getDate()}
                    </button>
                  ) : <span aria-hidden="true" className="track-date-picker-day empty" key={`empty-${rowIndex}-${index}`} role="gridcell" />
                })}
              </div>)}
            </div>
            <div className="track-date-picker-footer">
              <button onClick={() => selectDate(new Date())} type="button">Today</button>
            </div>
          </PopoverContent>
        </Popover>
        {value && !disabled ? (
          <button
            aria-label="Clear"
            className="track-date-picker-clear"
            onClick={clearDate}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
    </>
  )
}

export { DatePicker }
