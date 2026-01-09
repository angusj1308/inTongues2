import { useState } from 'react'

const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const SegmentedControl = ({ options, value, onChange, label }) => (
  <div className="tutor-segmented-control">
    <label className="tutor-segmented-label">{label}</label>
    <div className="tutor-segmented-options">
      {options.map((option) => (
        <button
          key={option.value}
          className={`tutor-segmented-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
)

const ToggleRow = ({ label, checked, onChange }) => (
  <div className="tutor-toggle-row">
    <span className="tutor-toggle-row-label">{label}</span>
    <button
      className={`tutor-toggle-btn ${checked ? 'active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      {checked ? 'Yes' : 'No'}
    </button>
  </div>
)

const TutorControlPanel = ({
  settings,
  onSettingsChange,
  activeLanguage,
}) => {
  const [showSettings, setShowSettings] = useState(false)

  const handleSettingChange = (key, value) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  return (
    <div className="tutor-control-panel">
      {/* Settings toggle */}
      <div className="tutor-control-actions">
        <button
          className={`tutor-settings-toggle ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Tutor Settings"
        >
          <SlidersIcon />
          <ChevronDownIcon />
        </button>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="tutor-settings-panel">
          <SegmentedControl
            label="Level"
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'native', label: 'Native' },
            ]}
            value={settings.languageLevel}
            onChange={(v) => handleSettingChange('languageLevel', v)}
          />

          <SegmentedControl
            label="Style"
            options={[
              { value: 'casual', label: 'Casual' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'professional', label: 'Professional' },
              { value: 'intellectual', label: 'Intellectual' },
            ]}
            value={settings.responseStyle}
            onChange={(v) => handleSettingChange('responseStyle', v)}
          />

          <div className="tutor-settings-toggles">
            <ToggleRow
              label="Grammatical explanations"
              checked={settings.grammarExplanations}
              onChange={(v) => handleSettingChange('grammarExplanations', v)}
            />
            <ToggleRow
              label="Show audio transcript"
              checked={settings.showAudioTranscript}
              onChange={(v) => handleSettingChange('showAudioTranscript', v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default TutorControlPanel
