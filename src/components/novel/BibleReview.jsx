import { useState } from 'react'

const BibleReview = ({ bible, bookId, bookData, onApprove, onRegenerate, onBack }) => {
  const [expandedSections, setExpandedSections] = useState({
    world: true,
    characters: true,
    chemistry: false,
    plot: false,
    chapters: false,
  })

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  if (!bible) {
    return (
      <div className="bible-review empty">
        <p>No story bible available.</p>
        {onBack && (
          <button className="button ghost" onClick={onBack}>
            Go Back
          </button>
        )}
      </div>
    )
  }

  const { phase1, phase2, phase3, phase4, phase5, phase6 } = bible

  return (
    <div className="bible-review">
      <div className="page-header">
        <div className="page-header-title">
          <h2>{phase1?.title || 'Story Bible'}</h2>
          <p className="ui-text">
            Review your generated story outline. You can approve to start generating chapters,
            or go back to regenerate with a different concept.
          </p>
        </div>
      </div>

      {/* Core Foundation (Phase 1) */}
      <section className="bible-section">
        <h3>{phase1?.title || 'Untitled'}</h3>
        <div className="bible-meta">
          <span className="pill">{bookData?.language}</span>
          <span className="pill">{bookData?.level}</span>
          <span className="pill">{bookData?.lengthPreset === 'novella' ? 'Novella' : 'Novel'}</span>
        </div>
        <div className="bible-content">
          <p><strong>Logline:</strong> {phase1?.logline}</p>
          <p><strong>Themes:</strong> {phase1?.themes?.join(', ')}</p>
          <p><strong>Tone:</strong> {phase1?.tone}</p>
          <p><strong>Setting:</strong> {phase1?.setting}</p>
          <p><strong>Time Period:</strong> {phase1?.timePeriod}</p>
        </div>
      </section>

      {/* World Building (Phase 2) */}
      <section className="bible-section collapsible">
        <button
          className="section-toggle"
          onClick={() => toggleSection('world')}
          aria-expanded={expandedSections.world}
        >
          <h3>World Building</h3>
          <span className="toggle-icon">{expandedSections.world ? '−' : '+'}</span>
        </button>
        {expandedSections.world && phase2 && (
          <div className="bible-content">
            <div className="subsection">
              <h4>Physical World</h4>
              <p><strong>Geography:</strong> {phase2.physicalWorld?.geography}</p>
              <p><strong>Climate:</strong> {phase2.physicalWorld?.climate}</p>
              <p><strong>Notable Locations:</strong></p>
              <ul>
                {phase2.physicalWorld?.notableLocations?.map((loc, i) => (
                  <li key={i}>{loc}</li>
                ))}
              </ul>
            </div>
            <div className="subsection">
              <h4>Social Structure</h4>
              <p><strong>Government:</strong> {phase2.socialStructure?.government}</p>
              <p><strong>Economy:</strong> {phase2.socialStructure?.economy}</p>
              <p><strong>Class System:</strong> {phase2.socialStructure?.classSystem}</p>
            </div>
            <div className="subsection">
              <h4>Cultural Elements</h4>
              <p><strong>Customs:</strong> {phase2.culturalElements?.customs?.join(', ')}</p>
              <p><strong>Beliefs:</strong> {phase2.culturalElements?.beliefs?.join(', ')}</p>
              <p><strong>Traditions:</strong> {phase2.culturalElements?.traditions?.join(', ')}</p>
            </div>
          </div>
        )}
      </section>

      {/* Characters (Phase 3) */}
      <section className="bible-section collapsible">
        <button
          className="section-toggle"
          onClick={() => toggleSection('characters')}
          aria-expanded={expandedSections.characters}
        >
          <h3>Characters ({phase3?.protagonists?.length + (phase3?.supportingCast?.length || 0) || 0})</h3>
          <span className="toggle-icon">{expandedSections.characters ? '−' : '+'}</span>
        </button>
        {expandedSections.characters && phase3 && (
          <div className="bible-content">
            <div className="subsection">
              <h4>Protagonists</h4>
              {phase3.protagonists?.map((char, i) => (
                <div key={i} className="character-card">
                  <h5>{char.name}</h5>
                  <p><strong>Age:</strong> {char.age}</p>
                  <p><strong>Role:</strong> {char.role}</p>
                  <p><strong>Background:</strong> {char.background}</p>
                  <p><strong>Personality:</strong> {char.personality}</p>
                  <p><strong>Motivation:</strong> {char.motivation}</p>
                  <p><strong>Arc:</strong> {char.arc}</p>
                </div>
              ))}
            </div>
            {phase3.antagonist && (
              <div className="subsection">
                <h4>Antagonist</h4>
                <div className="character-card antagonist">
                  <h5>{phase3.antagonist.name}</h5>
                  <p><strong>Role:</strong> {phase3.antagonist.role}</p>
                  <p><strong>Motivation:</strong> {phase3.antagonist.motivation}</p>
                  <p><strong>Method:</strong> {phase3.antagonist.method}</p>
                </div>
              </div>
            )}
            {phase3.supportingCast?.length > 0 && (
              <div className="subsection">
                <h4>Supporting Cast</h4>
                {phase3.supportingCast.map((char, i) => (
                  <div key={i} className="character-card supporting">
                    <h5>{char.name}</h5>
                    <p><strong>Role:</strong> {char.role}</p>
                    <p><strong>Purpose:</strong> {char.purpose}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Character Chemistry (Phase 4) */}
      <section className="bible-section collapsible">
        <button
          className="section-toggle"
          onClick={() => toggleSection('chemistry')}
          aria-expanded={expandedSections.chemistry}
        >
          <h3>Character Relationships</h3>
          <span className="toggle-icon">{expandedSections.chemistry ? '−' : '+'}</span>
        </button>
        {expandedSections.chemistry && phase4 && (
          <div className="bible-content">
            {phase4.primaryRelationship && (
              <div className="subsection">
                <h4>Primary Romance</h4>
                <p><strong>Characters:</strong> {phase4.primaryRelationship.characters?.join(' & ')}</p>
                <p><strong>Dynamic:</strong> {phase4.primaryRelationship.dynamic}</p>
                <p><strong>Tension:</strong> {phase4.primaryRelationship.tensionSource}</p>
                <p><strong>Evolution:</strong> {phase4.primaryRelationship.evolution}</p>
              </div>
            )}
            {phase4.keyRelationships?.map((rel, i) => (
              <div key={i} className="subsection">
                <h4>{rel.characters?.join(' & ')}</h4>
                <p><strong>Type:</strong> {rel.type}</p>
                <p><strong>Dynamic:</strong> {rel.dynamic}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Plot Structure (Phase 5) */}
      <section className="bible-section collapsible">
        <button
          className="section-toggle"
          onClick={() => toggleSection('plot')}
          aria-expanded={expandedSections.plot}
        >
          <h3>Plot Structure</h3>
          <span className="toggle-icon">{expandedSections.plot ? '−' : '+'}</span>
        </button>
        {expandedSections.plot && phase5 && (
          <div className="bible-content">
            <div className="plot-structure">
              <div className="plot-act">
                <h4>Act 1: Setup</h4>
                <p><strong>Hook:</strong> {phase5.act1?.hook}</p>
                <p><strong>Inciting Incident:</strong> {phase5.act1?.incitingIncident}</p>
                <p><strong>First Plot Point:</strong> {phase5.act1?.firstPlotPoint}</p>
              </div>
              <div className="plot-act">
                <h4>Act 2: Confrontation</h4>
                <p><strong>Rising Action:</strong> {phase5.act2?.risingAction}</p>
                <p><strong>Midpoint:</strong> {phase5.act2?.midpoint}</p>
                <p><strong>Complications:</strong> {phase5.act2?.complications?.join(', ')}</p>
              </div>
              <div className="plot-act">
                <h4>Act 3: Resolution</h4>
                <p><strong>Climax:</strong> {phase5.act3?.climax}</p>
                <p><strong>Resolution:</strong> {phase5.act3?.resolution}</p>
                <p><strong>Final Image:</strong> {phase5.act3?.finalImage}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Chapter Outline (Phase 6) */}
      <section className="bible-section collapsible">
        <button
          className="section-toggle"
          onClick={() => toggleSection('chapters')}
          aria-expanded={expandedSections.chapters}
        >
          <h3>Chapter Outline ({phase6?.chapters?.length || 0} chapters)</h3>
          <span className="toggle-icon">{expandedSections.chapters ? '−' : '+'}</span>
        </button>
        {expandedSections.chapters && phase6?.chapters && (
          <div className="bible-content">
            <div className="chapter-outline">
              {phase6.chapters.map((ch, i) => (
                <div key={i} className={`chapter-outline-item tension-${ch.tensionLevel || 'medium'}`}>
                  <div className="chapter-number">Ch. {i + 1}</div>
                  <div className="chapter-details">
                    <h5>{ch.title}</h5>
                    <p className="chapter-summary">{ch.summary}</p>
                    <div className="chapter-meta">
                      <span className="tension-badge">
                        Tension: {ch.tensionLevel || 'medium'}
                      </span>
                      {ch.beats && (
                        <span className="beats-count">
                          {ch.beats.length} beats
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="bible-actions">
        <button className="button ghost" onClick={onBack}>
          Back to Setup
        </button>
        <button className="button primary" onClick={onApprove}>
          Approve &amp; Start Chapters
        </button>
      </div>
    </div>
  )
}

export default BibleReview
