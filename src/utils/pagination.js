/**
 * Pagination utility for computing book pages based on container height.
 * Used by Dashboard (for pre-computation) and Reader (as fallback).
 *
 * All pages use the same fixed container height. Header/outline on page 1
 * flows as content within that height, naturally leaving less room for body text.
 */

/**
 * Wait for all fonts to be loaded before measuring text.
 * This ensures accurate text measurement with the correct font metrics.
 */
export const waitForFonts = async () => {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready
  }
  // Additional small delay to ensure fonts are fully applied
  await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * Check if content fits within the given height in the measurement container.
 * For first page of chapter, includes header/outline as part of the content.
 * Creates DOM elements to match actual render structure.
 *
 * @param {HTMLElement} measureDiv - The measurement container
 * @param {string} bodyText - The body text to measure
 * @param {number} maxHeight - Maximum allowed height
 * @param {string|null} header - Chapter header (only for first page)
 * @param {string|null} outline - Chapter outline (only for first page)
 * @returns {boolean} Whether content fits
 */
const measureFits = (measureDiv, bodyText, maxHeight, header = null, outline = null) => {
  measureDiv.innerHTML = ''

  // Create wrapper for all content
  const contentWrapper = document.createElement('div')

  // Add header/outline if present (first page of chapter)
  if (header || outline) {
    const headerDiv = document.createElement('div')
    headerDiv.className = 'chapter-header-structured'
    if (header) {
      const titleDiv = document.createElement('div')
      titleDiv.className = 'chapter-header-title'
      titleDiv.innerText = header.toUpperCase()
      headerDiv.appendChild(titleDiv)
    }
    if (outline) {
      const outlineDiv = document.createElement('div')
      outlineDiv.className = 'chapter-header-outline'
      outlineDiv.innerText = outline
      headerDiv.appendChild(outlineDiv)
    }
    contentWrapper.appendChild(headerDiv)
  }

  // Add body text as paragraphs
  const textNode = document.createElement('div')
  textNode.className = 'page-text-measure'

  const paragraphs = bodyText.split(/\n\n+/)
  paragraphs.forEach((para) => {
    if (para.trim()) {
      const p = document.createElement('p')
      p.className = 'reader-paragraph'
      p.innerText = para.trim()
      textNode.appendChild(p)
    }
  })

  contentWrapper.appendChild(textNode)
  measureDiv.appendChild(contentWrapper)

  return contentWrapper.scrollHeight <= maxHeight
}

/**
 * Compute pages from chapters using the measurement container.
 * All pages use the same fixed height. Header/outline flows as content on page 1.
 *
 * @param {Array} chapters - Array of chapter objects with adaptedText, adaptedChapterHeader, etc.
 * @param {HTMLElement} measureDiv - The hidden measurement container element
 * @returns {Array} Array of page objects
 */
export const computePages = (chapters, measureDiv) => {
  if (!measureDiv || !chapters.length) return []

  // Fixed container height for all pages - content flows within this
  const computedStyle = window.getComputedStyle(measureDiv)
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0
  const SAFETY_MARGIN = 4 // Prevent clipping from sub-pixel rendering differences
  const containerHeight = measureDiv.clientHeight - paddingTop - paddingBottom - SAFETY_MARGIN
  if (containerHeight <= 0) return []

  const virtualPages = []
  let globalPageIndex = 0

  for (const chapter of chapters) {
    const text = chapter.adaptedText || ''
    if (!text.trim()) continue

    const chapterHeader = chapter.adaptedChapterHeader || null
    const chapterOutline = chapter.adaptedChapterOutline || null

    // Split text into units (words + paragraph breaks)
    const units = []
    const paragraphs = text.split(/\n\n+/)
    for (let i = 0; i < paragraphs.length; i++) {
      if (i > 0) units.push('\n\n') // paragraph break marker
      const words = paragraphs[i].split(/\s+/).filter(Boolean)
      units.push(...words)
    }

    let currentPageText = ''
    let isFirstPageOfChapter = true
    let unitIndex = 0

    while (unitIndex < units.length) {
      const unit = units[unitIndex]

      // Build test text
      let testText
      if (unit === '\n\n') {
        testText = currentPageText ? currentPageText + '\n\n' : ''
      } else {
        testText = currentPageText ? currentPageText + ' ' + unit : unit
      }

      // Same container height for all pages
      // Header/outline included in measurement for first page (flows as content)
      const headerForMeasure = isFirstPageOfChapter ? chapterHeader : null
      const outlineForMeasure = isFirstPageOfChapter ? chapterOutline : null

      if (measureFits(measureDiv, testText, containerHeight, headerForMeasure, outlineForMeasure)) {
        // Unit fits - add it
        if (unit === '\n\n') {
          currentPageText = currentPageText ? currentPageText + '\n\n' : ''
        } else {
          currentPageText = currentPageText ? currentPageText + ' ' + unit : unit
        }
        unitIndex++
      } else {
        // Doesn't fit - save current page and start new one
        if (currentPageText.trim()) {
          virtualPages.push({
            index: globalPageIndex,
            text: currentPageText.trim(),
            adaptedText: currentPageText.trim(),
            chapterIndex: chapter.index,
            chapterTitle: isFirstPageOfChapter ? chapter.title : null,
            chapterHeader: isFirstPageOfChapter ? chapterHeader : null,
            chapterOutline: isFirstPageOfChapter ? chapterOutline : null,
            isChapterStart: isFirstPageOfChapter,
          })
          globalPageIndex++
          isFirstPageOfChapter = false
        }

        // Start fresh - if unit is paragraph break, skip it at page start
        if (unit === '\n\n') {
          currentPageText = ''
          unitIndex++
        } else {
          currentPageText = unit
          unitIndex++
        }
      }
    }

    // Save last page of chapter
    if (currentPageText.trim()) {
      virtualPages.push({
        index: globalPageIndex,
        text: currentPageText.trim(),
        adaptedText: currentPageText.trim(),
        chapterIndex: chapter.index,
        chapterTitle: isFirstPageOfChapter ? chapter.title : null,
        chapterHeader: isFirstPageOfChapter ? chapterHeader : null,
        chapterOutline: isFirstPageOfChapter ? chapterOutline : null,
        isChapterStart: isFirstPageOfChapter,
      })
      globalPageIndex++
    }
  }

  return virtualPages
}

/**
 * Compute pages with font loading - the main entry point.
 * Waits for fonts to load, then computes pages.
 *
 * @param {Array} chapters - Array of chapter objects
 * @param {HTMLElement} measureDiv - The hidden measurement container element
 * @returns {Promise<Array>} Array of page objects
 */
export const computePagesWithFontLoading = async (chapters, measureDiv) => {
  await waitForFonts()
  return computePages(chapters, measureDiv)
}
