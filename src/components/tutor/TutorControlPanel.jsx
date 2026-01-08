import { useState } from 'react'

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const ToggleSwitch = ({ checked, onChange, label, description }) => (
  <label className="tutor-toggle">
    <div className="tutor-toggle-info">
      <span className="tutor-toggle-label">{label}</span>
      {description && <span className="tutor-toggle-description">{description}</span>}
    </div>
    <div className="tutor-toggle-switch-wrapper">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="tutor-toggle-switch" />
    </div>
  </label>
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
          title="Settings"
        >
          <SettingsIcon />
          <span>Settings</span>
          <ChevronDownIcon />
        </button>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="tutor-settings-panel">
          <div className="tutor-settings-section">
            <h4>Display</h4>
            <ToggleSwitch
              checked={settings.showWordStatus}
              onChange={(v) => handleSettingChange('showWordStatus', v)}
              label="Show word status"
              description="Highlight vocabulary by familiarity in tutor messages"
            />
          </div>

          <div className="tutor-settings-section">
            <h4>Corrections</h4>
            <ToggleSwitch
              checked={settings.correctionsEnabled}
              onChange={(v) => handleSettingChange('correctionsEnabled', v)}
              label="Active corrections"
              description={settings.correctionsEnabled
                ? "Tutor will correct all mistakes"
                : "Tutor will only ask to repeat when unclear"}
            />
          </div>

          <div className="tutor-settings-section">
            <h4>Conversation Style</h4>
            <div className="tutor-setting-row">
              <label className="tutor-setting-label">Language level</label>
              <select
                className="tutor-setting-select"
                value={settings.languageLevel}
                onChange={(e) => handleSettingChange('languageLevel', e.target.value)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="native">Native-like</option>
              </select>
            </div>

            <div className="tutor-setting-row">
              <label className="tutor-setting-label">Response style</label>
              <select
                className="tutor-setting-select"
                value={settings.responseStyle}
                onChange={(e) => handleSettingChange('responseStyle', e.target.value)}
              >
                <option value="encouraging">Encouraging</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="strict">Strict teacher</option>
              </select>
            </div>

            <div className="tutor-setting-row">
              <label className="tutor-setting-label">Response length</label>
              <select
                className="tutor-setting-select"
                value={settings.responseLength}
                onChange={(e) => handleSettingChange('responseLength', e.target.value)}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Detailed</option>
              </select>
            </div>
          </div>

          <div className="tutor-settings-section">
            <h4>Voice</h4>
            <ToggleSwitch
              checked={settings.autoPlayResponses}
              onChange={(v) => handleSettingChange('autoPlayResponses', v)}
              label="Auto-play responses"
              description="Automatically speak tutor responses"
            />
            <div className="tutor-setting-row">
              <label className="tutor-setting-label">Speech speed</label>
              <select
                className="tutor-setting-select"
                value={settings.speechSpeed}
                onChange={(e) => handleSettingChange('speechSpeed', e.target.value)}
              >
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </div>
          </div>

          <div className="tutor-settings-section">
            <h4>Focus Areas</h4>
            <div className="tutor-focus-chips">
              {['Grammar', 'Vocabulary', 'Pronunciation', 'Fluency', 'Listening'].map((area) => (
                <button
                  key={area}
                  className={`tutor-focus-chip ${settings.focusAreas?.includes(area.toLowerCase()) ? 'active' : ''}`}
                  onClick={() => {
                    const current = settings.focusAreas || []
                    const lower = area.toLowerCase()
                    const updated = current.includes(lower)
                      ? current.filter((a) => a !== lower)
                      : [...current, lower]
                    handleSettingChange('focusAreas', updated)
                  }}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TutorControlPanel
