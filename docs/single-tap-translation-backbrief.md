# Single-tap translation back brief

## What went wrong
- The previous commit replaced the selection-based lookup with fallback logic that tried to infer the tapped word from the DOM when no text was selected. That change was unnecessary because the single-word tap flow was already working: the existing handler expects the browser text selection created by the tap gesture and uses the selected text to look up pre-fetched translations.
- By bypassing the selection requirement, the patch risked showing translations for the wrong token (e.g., punctuation-wrapped spans) and departed from the pre-fetch path that keys lookups off the normalized selection string.

## How it is fixed
- Reverted `handleWordClick` to the prior selection-first implementation so single-word taps continue to use the pre-fetched translations keyed by the user's actual selection.
- No new functionality was added; this restores the original, functioning behavior.
