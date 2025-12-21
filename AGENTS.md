# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the entry point; `styles.css` and `app.js` hold UI styles and client logic.
- `powerball-data.js` contains historical drawing data used by the UI.
- OCR utilities live in `test-ocr.js` (Node) and `ocr_pipeline_prototype.py` (Python).
- `digit_templates/` stores OCR template assets; `pipeline_output/` stores generated OCR artifacts.

## Build, Test, and Development Commands
- `python -m http.server 8000` serves the static site locally for camera access.
- `npx serve` is an alternative local static server.
- `npm test` runs `node test-ocr.js` to exercise the OCR flow against sample images.
- `python3 ocr_pipeline_prototype.py path/to/ticket.heic` runs the Python OCR prototype.
- `pip install -r requirements.txt` installs Python prototype dependencies.

## Coding Style & Naming Conventions
- JavaScript uses 4-space indentation and camelCase for variables and functions.
- Keep DOM IDs and CSS classes descriptive (e.g., `ticket-section`, `tab-btn`).
- Prefer small, focused functions in `app.js` and update UI through explicit helpers.

## Testing Guidelines
- OCR validation is script-driven; there is no test framework configured.
- Name OCR scripts with a `test-` prefix (e.g., `test-ocr.js`).
- When adding sample outputs, keep them in `test-output.txt` or `test-results.txt`.

## Commit & Pull Request Guidelines
- Recent commits use short, imperative messages, sometimes prefixed with a version tag.
  Example: `v1.3: Add perspective correction with homography`.
- PRs should include a summary, local test command(s) run, and screenshots for UI changes.

## Data & Configuration Tips
- Add new drawings to `powerball-data.js` in the documented format and keep the list
  sorted by date (most recent first).
