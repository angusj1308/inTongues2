# Translation error diagnosis

## Summary of issue
Single-word translations were failing with the OpenAI API error `Invalid type for 'text.format': expected a text format, but got a string instead`. The server was sending a `text` object in the payload for `client.responses.create`.

## Root cause
In `server.js`, the `translateWords` helper called `client.responses.create` with a `text: { format: 'json' }` field (around line 63). The new Responses API expects JSON responses to be requested via `response_format: { type: 'json_object' }`, not through a top-level `text` object. The invalid field was rejected, producing the `text.format` type error and returning untranslated words.

## Implemented fix
The `text` block was removed from the `translateWords` call and replaced with `response_format: { type: 'json_object' }`, matching the Responses API requirements.
