export const extractYouTubeId = (url) => {
  if (!url) return ''

  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace('/', '')
    }

    if (parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v')
    }

    const paths = parsed.pathname.split('/')
    const embedIndex = paths.indexOf('embed')
    if (embedIndex !== -1 && paths[embedIndex + 1]) {
      return paths[embedIndex + 1]
    }
  } catch (err) {
    return ''
  }

  return ''
}

export const getYouTubeThumbnailUrl = (url) => {
  const videoId = extractYouTubeId(url)
  if (!videoId) return ''

  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

// 16:9 thumbnail. Use for wide shelf cards where hqdefault's 4:3 letterbox
// shows black bars.
export const getYouTubeThumbnailFromVideo = (video) => {
  if (!video) return ''
  const videoId = video.videoId || extractYouTubeId(video.youtubeUrl)
  if (!videoId) return ''
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}
