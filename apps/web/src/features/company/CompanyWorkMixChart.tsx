import { useState } from 'react'

type TaskDistribution = {
  todo: number
  inProgress: number
  completed: number
  overdue: number
}

type CategoryId = keyof TaskDistribution

const categories: { id: CategoryId; label: string; color: string }[] = [
  { id: 'completed', label: 'Completed', color: 'var(--status-success)' },
  { id: 'inProgress', label: 'In progress', color: 'var(--accent-strong)' },
  { id: 'todo', label: 'To do', color: 'var(--ink-3)' },
  { id: 'overdue', label: 'Overdue', color: 'var(--status-danger)' },
]

const radius = 76
const circumference = 2 * Math.PI * radius

export function CompanyWorkMixChart({ distribution }: { distribution: TaskDistribution }) {
  const [selectedId, setSelectedId] = useState<CategoryId | null>(null)
  const rows = categories.map((category) => ({ ...category, count: distribution[category.id] }))
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const selected = rows.find((row) => row.id === selectedId) ?? rows.find((row) => row.count > 0) ?? rows[0]!

  if (total === 0) {
    return <div className="company-owner-empty company-owner-chart-empty">
      <strong>No tracked tasks yet</strong>
      <span>Task states will appear here when work starts in an active Project.</span>
    </div>
  }

  let start = 0
  const arcs = rows.flatMap((row) => {
    if (row.count === 0) return []
    const length = (row.count / total) * circumference
    const arc = { ...row, start, length }
    start += length
    return [arc]
  })

  return <div className="company-owner-work-mix">
    <div className="company-owner-work-mix-visual">
      <svg aria-hidden="true" className="company-owner-work-mix-ring" viewBox="0 0 200 200">
        <circle className="company-owner-work-mix-track" cx="100" cy="100" r={radius} />
        {arcs.map((arc) => {
          const visibleLength = Math.max(1, arc.length - 3)
          return <circle
            className="company-owner-work-mix-arc"
            cx="100"
            cy="100"
            key={arc.id}
            opacity={selected.id === arc.id ? 1 : .68}
            r={radius}
            stroke={arc.color}
            strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
            strokeDashoffset={-arc.start}
            strokeWidth={18}
            transform="rotate(-90 100 100)"
          />
        })}
      </svg>
      <div className="company-owner-work-mix-center">
        <strong>{total}</strong>
        <span>tracked tasks</span>
      </div>
    </div>

    <div aria-label="Task state breakdown" className="company-owner-work-mix-legend" role="group">
      {rows.map((row) => <button
        aria-pressed={selected.id === row.id}
        className="company-owner-work-mix-category"
        key={row.id}
        onClick={() => setSelectedId(row.id)}
        type="button"
      >
        <span aria-hidden="true" className="company-owner-work-mix-key" style={{ backgroundColor: row.color }} />
        <span>{row.label}</span>
        <strong>{row.count}</strong>
      </button>)}
    </div>
    <p aria-live="polite" className="company-owner-work-mix-detail">
      <strong>{selected.count}</strong> {selected.label.toLowerCase()} · {Math.round((selected.count / total) * 100)}% of tracked tasks
    </p>
    <p className="company-owner-work-mix-note">Overdue tasks are counted separately from to do and in progress.</p>
  </div>
}
