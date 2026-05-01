const COLORS = [
  '#1c2230', '#3b4a5a', '#7a5d3a', '#5b6e4a',
  '#7a3b3b', '#3b5a7a', '#5a3b7a', '#3b7a6e',
]

const colorFor = (key = '') => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

const initialsOf = (title = '') => {
  const cleaned = title.trim()
  if (!cleaned) return '·'
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const CoverArt = ({ src, title = '', size = 140, className = '' }) => {
  const dim = `${size}px`
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`media-cover ${className}`}
        style={{ width: dim, height: dim }}
        loading="lazy"
      />
    )
  }
  const bg = colorFor(title)
  const initials = initialsOf(title)
  return (
    <div
      className={`media-cover media-cover-fallback ${className}`}
      style={{ width: dim, height: dim, background: bg }}
      role="img"
      aria-label={title || 'Podcast cover'}
    >
      <span className="media-cover-initials">{initials}</span>
    </div>
  )
}

export default CoverArt
