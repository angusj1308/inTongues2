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
