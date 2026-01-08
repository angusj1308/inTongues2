import React from 'react'
import { SpontaneousSession } from './SpontaneousSession'

/**
 * Voice Record Mode - Goes directly to free speaking session
 * No menu needed since we're focusing on spontaneous speech feedback,
 * not pronunciation feedback for reading
 */
export function VoiceRecordHub({ activeLanguage, nativeLanguage, onBack }) {
  return (
    <SpontaneousSession
      activeLanguage={activeLanguage}
      nativeLanguage={nativeLanguage}
      onBack={onBack}
    />
  )
}

export default VoiceRecordHub
