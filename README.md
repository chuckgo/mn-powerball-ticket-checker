# Powerball Ticket Checker

A mobile-first web application for checking Powerball lottery tickets with automatic OCR number recognition.

## Features

- **Multiple Input Methods**
  - Look up winning numbers by drawing date
  - Manually enter winning numbers

- **Smart Ticket Scanning**
  - Take photos of your tickets using your phone's camera
  - Automatic number recognition using OCR (Tesseract.js)
  - Manual entry and editing of ticket numbers

- **Visual Results**
  - Clear visualization showing matched numbers
  - Automatic prize calculation
  - Summary of total winnings across all plays

- **Mobile Optimized**
  - Works great on iPhone and other mobile devices
  - Responsive design for all screen sizes
  - Touch-friendly interface

## Usage

1. **Enter Winning Numbers**
   - Select a drawing date to automatically load winning numbers, OR
   - Manually enter the winning numbers

2. **Scan Your Ticket**
   - Take a photo of your ticket (camera permission required), OR
   - Manually enter your ticket numbers
   - Edit any numbers that were incorrectly recognized

3. **Check Results**
   - See which numbers matched
   - View your prize for each play
   - See total winnings

## Technology Stack

- Pure HTML5, CSS3, and JavaScript (no frameworks required)
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR
- Camera API for photo capture
- Fully static - works on GitHub Pages

## Local Development

Simply open `index.html` in a web browser. For camera functionality, you'll need to serve over HTTPS or localhost.

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js
npx serve
```

Then visit `http://localhost:8000`

## Deployment to GitHub Pages

This app is configured to work on GitHub Pages out of the box:

1. Push code to your GitHub repository
2. Go to Settings → Pages
3. Select "main" branch as source
4. Your app will be live at `https://yourusername.github.io/mn-powerball-ticket-checker/`

## Data Updates

The Powerball historical data is stored in `powerball-data.js`. To add new drawings:

1. Open `powerball-data.js`
2. Add new entries to the `powerballData` array in the format:
   ```javascript
   { date: 'YYYY-MM-DD', white: [n1, n2, n3, n4, n5], powerball: pb, multiplier: m }
   ```
3. Keep the array sorted by date (most recent first)

## Browser Compatibility

- iOS Safari 11+
- Chrome for Android
- Modern desktop browsers
- Requires camera permission for photo scanning feature

## License

MIT License - see LICENSE file for details

## Note

This is an independent tool and is not affiliated with or endorsed by the official Powerball lottery.
