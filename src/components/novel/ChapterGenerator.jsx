import { useState, useEffect, useCallback } from 'react'
import { generateChapter, getBook } from '../../services/novelApiClient'

const ChapterGenerator = ({ bookId, uid, bible, bookData, onComplete, onBack }) => {
  const [chapters, setChapters] = useState([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [selectedChapter, setSelectedChapter] = useState(null)

  const totalChapters = bible?.phase6?.chapters?.length || bookData?.chapterCount || 12
  const chapterOutlines = bible?.phase6?.chapters || []

  // Load existing chapters on mount
  useEffect(() => {
    const loadExistingChapters = async () => {
      try {
        const bookDetails = await getBook(uid, bookId)
        if (bookDetails.chapters?.length > 0) {
          setChapters(bookDetails.chapters)
          const lastCompleted = bookDetails.chapters.filter((c) => c.status === 'complete').length
          setCurrentChapterIndex(lastCompleted + 1)
        }
      } catch (err) {
        console.error('Failed to load existing chapters:', err)
      }
    }

    if (bookId && uid) {
      loadExistingChapters()
    }
  }, [bookId, uid])

  const handleGenerateChapter = useCallback(async (chapterIndex) => {
    if (isGenerating) return

    setError('')
    setIsGenerating(true)
    setProgress(`Generating chapter ${chapterIndex}...`)

    try {
      const result = await generateChapter({
        uid,
        bookId,
        chapterIndex,
      })

      if (result.success) {
        const newChapter = {
          index: chapterIndex,
          ...result.chapter,
          status: 'complete',
        }

        setChapters((prev) => {
          const updated = [...prev]
          const existingIndex = updated.findIndex((c) => c.index === chapterIndex)
          if (existingIndex >= 0) {
            updated[existingIndex] = newChapter
          } else {
            updated.push(newChapter)
          }
          return updated.sort((a, b) => a.index - b.index)
        })

        setCurrentChapterIndex(chapterIndex + 1)
        setProgress(`Chapter ${chapterIndex} complete!`)
      } else {
        setError(result.error || `Failed to generate chapter ${chapterIndex}`)
      }
    } catch (err) {
      setError(err.message || `Failed to generate chapter ${chapterIndex}`)
    } finally {
      setIsGenerating(false)
      setTimeout(() => setProgress(''), 2000)
    }
  }, [isGenerating, uid, bookId])

  const handleGenerateAll = async () => {
    for (let i = currentChapterIndex; i <= totalChapters; i++) {
      await handleGenerateChapter(i)
      if (error) break
    }
  }

  const getChapterStatus = (index) => {
    const chapter = chapters.find((c) => c.index === index)
    if (chapter?.status === 'complete') return 'complete'
    if (index === currentChapterIndex && isGenerating) return 'generating'
    if (index < currentChapterIndex) return 'complete'
    return 'pending'
  }

  const completedCount = chapters.filter((c) => c.status === 'complete').length
  const progressPercent = Math.round((completedCount / totalChapters) * 100)

  const isComplete = completedCount === totalChapters

  return (
    <div className="chapter-generator">
      <div className="page-header">
        <div className="page-header-title">
          <h2>Generate Chapters</h2>
          <p className="ui-text">
            Generate chapters one at a time. Each chapter builds on the context of previous chapters.
          </p>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="generation-overview">
        <div className="progress-stats">
          <span className="stat">
            <strong>{completedCount}</strong> of <strong>{totalChapters}</strong> chapters
          </span>
          <span className="stat-percent">{progressPercent}%</span>
        </div>
        <div className="progress-bar-large">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current Status */}
      {isGenerating && (
        <div className="generation-status">
          <div className="progress-spinner" />
          <p>{progress}</p>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button className="button ghost small" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Chapter List */}
      <div className="chapter-list">
        {Array.from({ length: totalChapters }, (_, i) => i + 1).map((chapterNum) => {
          const status = getChapterStatus(chapterNum)
          const outline = chapterOutlines[chapterNum - 1]
          const generatedChapter = chapters.find((c) => c.index === chapterNum)

          return (
            <div
              key={chapterNum}
              className={`chapter-item status-${status}`}
              onClick={() => generatedChapter && setSelectedChapter(generatedChapter)}
              role={generatedChapter ? 'button' : undefined}
              tabIndex={generatedChapter ? 0 : undefined}
            >
              <div className="chapter-number">
                {status === 'complete' && <span className="check-icon">✓</span>}
                {status === 'generating' && <span className="spinner-icon" />}
                {status === 'pending' && <span>{chapterNum}</span>}
              </div>
              <div className="chapter-info">
                <h4>{outline?.title || `Chapter ${chapterNum}`}</h4>
                <p className="chapter-summary-preview">
                  {outline?.summary?.slice(0, 100)}
                  {outline?.summary?.length > 100 ? '...' : ''}
                </p>
                {outline?.tensionLevel && (
                  <span className={`tension-badge tension-${outline.tensionLevel}`}>
                    {outline.tensionLevel}
                  </span>
                )}
              </div>
              <div className="chapter-actions">
                {status === 'pending' && chapterNum === currentChapterIndex && (
                  <button
                    className="button primary small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGenerateChapter(chapterNum)
                    }}
                    disabled={isGenerating}
                  >
                    Generate
                  </button>
                )}
                {status === 'complete' && (
                  <>
                    <button
                      className="button ghost small"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedChapter(generatedChapter)
                      }}
                    >
                      Read
                    </button>
                    <button
                      className="button secondary small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGenerateChapter(chapterNum)
                      }}
                      disabled={isGenerating}
                    >
                      Regenerate
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk Actions */}
      <div className="chapter-actions-bar">
        <button className="button ghost" onClick={onBack}>
          Back to Outline
        </button>
        {!isComplete && (
          <>
            <button
              className="button secondary"
              onClick={() => handleGenerateChapter(currentChapterIndex)}
              disabled={isGenerating || currentChapterIndex > totalChapters}
            >
              Generate Next Chapter
            </button>
            <button
              className="button primary"
              onClick={handleGenerateAll}
              disabled={isGenerating || currentChapterIndex > totalChapters}
            >
              Generate All Remaining
            </button>
          </>
        )}
        {isComplete && (
          <button className="button primary" onClick={onComplete}>
            Finish &amp; Read Novel
          </button>
        )}
      </div>

      {/* Chapter Reader Modal */}
      {selectedChapter && (
        <div className="chapter-modal-overlay" onClick={() => setSelectedChapter(null)}>
          <div className="chapter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chapter-modal-header">
              <h3>
                Chapter {selectedChapter.index}: {selectedChapter.title || chapterOutlines[selectedChapter.index - 1]?.title}
              </h3>
              <button className="close-button" onClick={() => setSelectedChapter(null)}>
                ×
              </button>
            </div>
            <div className="chapter-modal-content">
              <div className="chapter-text">
                {selectedChapter.content?.split('\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
              {selectedChapter.summary && (
                <div className="chapter-summary-section">
                  <h4>Chapter Summary</h4>
                  <p>{selectedChapter.summary}</p>
                </div>
              )}
              {selectedChapter.wordCount && (
                <div className="chapter-stats">
                  <span>Word Count: {selectedChapter.wordCount}</span>
                </div>
              )}
            </div>
            <div className="chapter-modal-footer">
              <button className="button ghost" onClick={() => setSelectedChapter(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChapterGenerator
