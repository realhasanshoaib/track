import { entityMarkColorKeys, entityMarkIconKeys, type EntityMarkColorKey, type EntityMarkIconKey } from '@track/shared'

const iconLabels: Record<EntityMarkIconKey, string> = {
  analytics: 'Analytics', archive: 'Archive', board: 'Board', bookmark: 'Reference', book: 'Knowledge', building: 'Company',
  bug: 'Quality', calendar: 'Calendar', channel: 'Channel', checklist: 'Tasks', code: 'Engineering', conversation: 'Conversation',
  design: 'Design', files: 'Files', globe: 'International', idea: 'Ideas', inbox: 'Triage', integration: 'Integrations',
  launch: 'Launch', media: 'Media', milestone: 'Milestone', mobile: 'Mobile', people: 'People', project: 'Project', question: 'Questions',
  shield: 'Security', support: 'Support', target: 'Goals', timeline: 'Timeline', video: 'Video',
}

export function EntityMarkPicker({
  colorKey,
  iconKey,
  onColorChange,
  onIconChange,
}: {
  colorKey: EntityMarkColorKey | ''
  iconKey: EntityMarkIconKey | ''
  onColorChange: (value: EntityMarkColorKey | '') => void
  onIconChange: (value: EntityMarkIconKey | '') => void
}) {
  return (
    <fieldset className="track-entity-mark-picker">
      <legend>Identity</legend>
      <label>
        <span>Icon</span>
        <select onChange={(event) => onIconChange(event.currentTarget.value as EntityMarkIconKey | '')} value={iconKey}>
          <option value="">Automatic</option>
          {entityMarkIconKeys.map((key) => <option key={key} value={key}>{iconLabels[key]}</option>)}
        </select>
      </label>
      <label>
        <span>Background</span>
        <select onChange={(event) => onColorChange(event.currentTarget.value as EntityMarkColorKey | '')} value={colorKey}>
          <option value="">Automatic</option>
          {entityMarkColorKeys.map((key) => <option key={key} value={key}>{key[0]!.toUpperCase() + key.slice(1)}</option>)}
        </select>
      </label>
      <p>Automatic uses this item’s stable identity to pick a mark and color. Company and Project marks match across web and mobile.</p>
    </fieldset>
  )
}
