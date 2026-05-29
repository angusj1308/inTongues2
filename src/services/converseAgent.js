import { Conversation } from '@elevenlabs/client'

// Wraps the official @elevenlabs/client SDK so the rest of the app talks to a
// single, simple object. The SDK handles WebSocket, audio capture (PCM 16kHz),
// audio playback, ping/pong, and decoding for us — we just hand it a signed
// URL + overrides and listen for events.
export const startConverseCall = async ({
  persona,
  level,
  language,
  nativeLanguage,
  voiceGender,
  feedback,
  callbacks = {},
}) => {
  const res = await fetch('/api/converse/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona, level, language, nativeLanguage, voiceGender, feedback }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Failed to start session: ${res.status} ${errText.slice(0, 200)}`)
  }

  const { signedUrl, overrides } = await res.json()
  const inner = overrides?.conversation_config_override

  const conversation = await Conversation.startSession({
    signedUrl,
    overrides: inner,
    ...callbacks,
  })

  return conversation
}

// Best-effort: ask the backend to mirror the finished call's audio recording
// from ElevenLabs into Firebase. If the audio isn't ready yet ElevenLabs
// returns 404 → backend returns { pending: true } and the caller can retry.
export const saveConverseRecording = async (conversationId) => {
  if (!conversationId) return null
  const res = await fetch('/api/converse/recording', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  })
  if (!res.ok) return null
  return res.json()
}
