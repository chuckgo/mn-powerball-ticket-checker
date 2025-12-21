// Powerball Ticket Checker App
// Main application logic

// App State
const appState = {
    currentSection: 'ticket-section',
    winningNumbers: null,
    ticketPlays: [],
    currentEditIndex: null,
    cameraStream: null,
    extractedDate: null,
    digitTemplates: {},  // Will hold loaded digit templates (0-9)
    pbTemplate: null,    // Will hold loaded PB marker template
    templatesLoaded: false
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Set up event listeners
    setupTabSwitching();
    setupWinningNumbersInput();
    setupTicketScanning();
    setupPlayModal();
    setupResults();

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('drawing-date').value = today;

    // Update footer with current date/time to show latest version
    updateFooter();

    // Load digit templates for template matching
    loadDigitTemplates();

    console.log('App initialized');
}

async function loadDigitTemplates() {
    console.log('Loading digit templates...');

    try {
        // Load digit templates 0-9
        for (let i = 0; i <= 9; i++) {
            const img = await loadImageAsCanvas(`digit_templates/digit_${i}.png`);
            if (img && typeof cv !== 'undefined') {
                appState.digitTemplates[i] = cv.imread(img);
                // Convert to grayscale
                cv.cvtColor(appState.digitTemplates[i], appState.digitTemplates[i], cv.COLOR_RGBA2GRAY);
            }
        }

        // Load PB marker template
        const pbImg = await loadImageAsCanvas('digit_templates/marker_pb.png');
        if (pbImg && typeof cv !== 'undefined') {
            appState.pbTemplate = cv.imread(pbImg);
            cv.cvtColor(appState.pbTemplate, appState.pbTemplate, cv.COLOR_RGBA2GRAY);
        }

        appState.templatesLoaded = true;
        console.log('✓ Templates loaded successfully');
    } catch (error) {
        console.error('Error loading templates:', error);
        console.log('⚠ Template matching will not be available, falling back to OCR');
    }
}

function loadImageAsCanvas(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = () => {
            console.warn(`Failed to load template: ${src}`);
            resolve(null);
        };
        img.src = src;
    });
}

function updateFooter() {
    const sessionTimeElement = document.getElementById('session-time');
    if (sessionTimeElement) {
        const now = new Date();
        const dateStr = now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        sessionTimeElement.textContent = dateStr;
    }
}

// ===== TAB SWITCHING =====
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

// ===== WINNING NUMBERS INPUT =====
function setupWinningNumbersInput() {
    // Date-based lookup
    document.getElementById('fetch-numbers-btn').addEventListener('click', fetchNumbersByDate);

    // Manual entry
    document.getElementById('save-manual-numbers-btn').addEventListener('click', saveManualNumbers);

    // Check ticket button (now in winning numbers section)
    document.getElementById('check-ticket-btn').addEventListener('click', checkTicket);
}

function fetchNumbersByDate() {
    const dateInput = document.getElementById('drawing-date');
    const date = dateInput.value;
    const errorDiv = document.getElementById('date-error');

    if (!date) {
        showError(errorDiv, 'Please select a date');
        return;
    }

    const drawing = getDrawingByDate(date);

    if (!drawing) {
        showError(errorDiv, `No drawing found for ${formatDate(date)}. Please try another date or enter numbers manually.`);
        return;
    }

    errorDiv.style.display = 'none';
    appState.winningNumbers = {
        date: date,
        white: drawing.white,
        powerball: drawing.powerball
    };

    displayWinningNumbers();
}

function saveManualNumbers() {
    const whiteInputs = document.querySelectorAll('#manual-tab .ball-input.white');
    const powerballInput = document.querySelector('#manual-tab .ball-input.red');

    const white = Array.from(whiteInputs).map(input => parseInt(input.value));
    const powerball = parseInt(powerballInput.value);

    // Validate
    if (white.some(isNaN) || white.length !== 5) {
        alert('Please enter all 5 white ball numbers (1-69)');
        return;
    }

    if (isNaN(powerball)) {
        alert('Please enter the Powerball number (1-26)');
        return;
    }

    if (white.some(n => n < 1 || n > 69)) {
        alert('White ball numbers must be between 1 and 69');
        return;
    }

    if (powerball < 1 || powerball > 26) {
        alert('Powerball must be between 1 and 26');
        return;
    }

    // Check for duplicates in white balls
    if (new Set(white).size !== white.length) {
        alert('White ball numbers must be unique');
        return;
    }

    appState.winningNumbers = {
        date: document.getElementById('drawing-date').value || 'Manual Entry',
        white: white.sort((a, b) => a - b),
        powerball: powerball
    };

    displayWinningNumbers();
}

function displayWinningNumbers() {
    const display = document.getElementById('winning-numbers-display');
    const whiteBallsContainer = document.getElementById('white-balls-display');
    const powerballContainer = document.getElementById('powerball-display');
    const dateDisplay = document.getElementById('winning-date-display');

    // Clear previous
    whiteBallsContainer.innerHTML = '';
    powerballContainer.innerHTML = '';

    // Display date
    dateDisplay.textContent = `Drawing: ${formatDate(appState.winningNumbers.date)}`;

    // Display white balls
    appState.winningNumbers.white.forEach((num, index) => {
        const ball = createBall(num, 'white');
        ball.style.animationDelay = `${index * 0.1}s`;
        whiteBallsContainer.appendChild(ball);
    });

    // Display powerball
    const powerball = createBall(appState.winningNumbers.powerball, 'red');
    powerball.style.animationDelay = '0.5s';
    powerballContainer.appendChild(powerball);

    display.style.display = 'block';
}

// ===== TICKET SCANNING =====
function setupTicketScanning() {
    document.getElementById('camera-btn').addEventListener('click', startCamera);
    document.getElementById('upload-btn').addEventListener('click', () => {
        document.getElementById('file-upload').click();
    });
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    document.getElementById('manual-ticket-btn').addEventListener('click', showManualPlayInput);
    document.getElementById('capture-btn').addEventListener('click', captureImage);
    document.getElementById('cancel-camera-btn').addEventListener('click', stopCamera);
    document.getElementById('retake-btn').addEventListener('click', retakePhoto);
    document.getElementById('process-image-btn').addEventListener('click', processTicketImage);
    document.getElementById('add-play-btn').addEventListener('click', () => openPlayModal());
    document.getElementById('continue-to-numbers-btn').addEventListener('click', () => {
        navigateToSection('winning-numbers-section');
    });
    document.getElementById('back-to-ticket').addEventListener('click', () => {
        navigateToSection('ticket-section');
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const capturedImage = document.getElementById('captured-image');
        capturedImage.src = e.target.result;

        // Reset UI state for new image
        document.querySelector('.scan-options').style.display = 'none';
        document.getElementById('captured-image-container').style.display = 'block';
        document.querySelector('.image-controls').style.display = 'flex';
        document.getElementById('processing-indicator').style.display = 'none';
        document.getElementById('ticket-plays-container').style.display = 'none';

        // Clear file input so same file can be selected again
        event.target.value = '';
    };
    reader.readAsDataURL(file);
}

async function startCamera() {
    const cameraContainer = document.getElementById('camera-container');
    const videoElement = document.getElementById('camera-feed');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });

        appState.cameraStream = stream;
        videoElement.srcObject = stream;
        cameraContainer.style.display = 'block';

        // Hide other options
        document.querySelector('.scan-options').style.display = 'none';

    } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera. Please check permissions or enter numbers manually.');
    }
}

function stopCamera() {
    if (appState.cameraStream) {
        appState.cameraStream.getTracks().forEach(track => track.stop());
        appState.cameraStream = null;
    }

    document.getElementById('camera-container').style.display = 'none';
    document.querySelector('.scan-options').style.display = 'flex';
}

function captureImage() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    const capturedImage = document.getElementById('captured-image');

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Get image data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    capturedImage.src = imageDataUrl;

    // Stop camera and show captured image
    stopCamera();
    document.getElementById('captured-image-container').style.display = 'block';
}

function retakePhoto() {
    document.getElementById('captured-image-container').style.display = 'none';
    document.getElementById('ticket-plays-container').style.display = 'none';
    document.querySelector('.scan-options').style.display = 'flex';
}

function assessImageQuality(ocrResult, extractedPlays) {
    const issues = [];
    const confidence = ocrResult.data.confidence || 0;

    // Check OCR confidence
    if (confidence < 60) {
        issues.push('low_confidence');
    }

    // Check if we got fewer plays than expected (typical ticket has 5+ plays)
    if (extractedPlays.length > 0 && extractedPlays.length < 3) {
        issues.push('few_plays');
    }

    // Check text quality - if OCR result is mostly garbage characters
    const text = ocrResult.data.text;
    const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / Math.max(text.length, 1);
    if (alphanumericRatio < 0.3) {
        issues.push('garbled_text');
    }

    return {
        hasIssues: issues.length > 0,
        issues: issues,
        confidence: confidence
    };
}

function showImageQualityWarning(issues, confidence) {
    const hints = [];

    if (issues.includes('no_plays_detected') || issues.includes('garbled_text')) {
        hints.push('• Hold the camera steady and ensure the ticket is in focus');
        hints.push('• Make sure there is good lighting on the ticket');
        hints.push('• Try taking the photo straight-on (not at an angle)');
    }

    if (issues.includes('low_confidence')) {
        hints.push('• The image quality is low (confidence: ' + Math.round(confidence) + '%)');
        hints.push('• Avoid shadows and glare on the ticket');
    }

    if (issues.includes('few_plays')) {
        hints.push('• Only found a few plays - the whole ticket may not be visible');
        hints.push('• Make sure the entire play area is in the frame');
    }

    const message = '⚠️ Image Quality Issue\n\n' +
                    'The photo may not be clear enough for accurate scanning.\n\n' +
                    'Tips for better results:\n' +
                    hints.join('\n') +
                    '\n\nYou can continue with these results or retake the photo.';

    // Show as a non-blocking notification if we got some results, blocking alert if we got nothing
    if (issues.includes('no_plays_detected')) {
        alert(message);
    } else {
        // For partial results, log warning but allow user to continue
        console.warn('Image quality issues:', issues);
        // Could show a dismissible banner here instead of alert
        if (confirm(message + '\n\nContinue with these results?')) {
            return true;
        } else {
            // User wants to retake
            document.querySelector('.image-controls').style.display = 'flex';
            return false;
        }
    }
}

function perspectiveCorrection(imageElement) {
    // Use OpenCV.js to detect and correct perspective distortion
    if (typeof cv === 'undefined') {
        console.log('OpenCV not loaded, skipping perspective correction');
        return null;
    }

    try {
        // Create canvas with image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        ctx.drawImage(imageElement, 0, 0);

        // Convert to OpenCV Mat
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const edges = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Apply Gaussian blur to reduce noise
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

        // Detect edges using Canny
        cv.Canny(gray, edges, 50, 150);

        // Find contours
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Find the largest rectangular contour (likely the ticket)
        let maxArea = 0;
        let bestContour = null;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            const perimeter = cv.arcLength(contour, true);
            const approx = new cv.Mat();

            // Approximate the contour to a polygon
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

            // Look for a quadrilateral (4 corners)
            if (approx.rows === 4 && area > maxArea) {
                maxArea = area;
                if (bestContour) bestContour.delete();
                bestContour = approx.clone();
            }
            approx.delete();
        }

        // If we found a good quadrilateral, apply perspective transform
        if (bestContour && maxArea > (canvas.width * canvas.height * 0.1)) {
            // Get the 4 corner points
            const corners = [];
            for (let i = 0; i < 4; i++) {
                corners.push({
                    x: bestContour.data32S[i * 2],
                    y: bestContour.data32S[i * 2 + 1]
                });
            }

            // Order corners: top-left, top-right, bottom-right, bottom-left
            corners.sort((a, b) => a.y - b.y);
            const top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
            const bottom = corners.slice(2, 4).sort((a, b) => a.x - b.x);
            const ordered = [top[0], top[1], bottom[1], bottom[0]];

            // Calculate output dimensions
            const width = Math.max(
                Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y),
                Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y)
            );
            const height = Math.max(
                Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y),
                Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y)
            );

            // Define source and destination points
            const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                ordered[0].x, ordered[0].y,
                ordered[1].x, ordered[1].y,
                ordered[2].x, ordered[2].y,
                ordered[3].x, ordered[3].y
            ]);

            const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                width, 0,
                width, height,
                0, height
            ]);

            // Calculate perspective transform matrix
            const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

            // Apply the transform
            const dst = new cv.Mat();
            cv.warpPerspective(src, dst, M, new cv.Size(width, height));

            // Convert back to canvas
            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, dst);

            // Cleanup
            srcPoints.delete();
            dstPoints.delete();
            M.delete();
            dst.delete();
            bestContour.delete();

            const result = outputCanvas.toDataURL();
            console.log('✓ Applied perspective correction');

            // Cleanup
            src.delete();
            gray.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();

            return result;
        }

        // Cleanup if no perspective correction applied
        if (bestContour) bestContour.delete();
        src.delete();
        gray.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();

        console.log('No clear rectangular contour found for perspective correction');
        return null;

    } catch (error) {
        console.error('Perspective correction error:', error);
        return null;
    }
}

function rotateImage(imageElement, degrees) {
    // Rotate image by specified degrees (0, 90, 180, 270)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;

    // Set canvas size based on rotation
    if (degrees === 90 || degrees === 270) {
        canvas.width = height;
        canvas.height = width;
    } else {
        canvas.width = width;
        canvas.height = height;
    }

    // Apply rotation
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(imageElement, -width / 2, -height / 2);

    return canvas.toDataURL();
}

function preprocessImage(imageElement, mode = 'default') {
    // Create canvas for image preprocessing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size to match image
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;

    // Draw original image
    ctx.drawImage(imageElement, 0, 0);

    if (mode === 'none') {
        // No preprocessing - return original
        return canvas.toDataURL();
    }

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    if (mode === 'grayscale') {
        // Simple grayscale conversion
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    } else if (mode === 'threshold') {
        // Adaptive thresholding for better text extraction
        // First convert to grayscale
        const grayData = [];
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            grayData.push(gray);
        }

        // Calculate threshold (simple Otsu's approximation)
        let sum = 0;
        for (let i = 0; i < grayData.length; i++) {
            sum += grayData[i];
        }
        const threshold = sum / grayData.length;

        // Apply threshold
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const value = grayData[j] > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    } else {
        // Default: light preprocessing - just slight sharpening
        // No grayscale conversion, keep color
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];

        const tempData = new Uint8ClampedArray(data);
        const w = canvas.width;
        const h = canvas.height;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                            sum += tempData[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    const idx = (y * w + x) * 4 + c;
                    data[idx] = Math.max(0, Math.min(255, sum));
                }
            }
        }
    }

    // Put processed image back
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL();
}

async function tryOCRWithSettings(imageDataUrl, rotation, psmMode, preprocessMode) {
    // Try OCR with specific settings
    console.log(`  Trying: rotation=${rotation}°, PSM=${psmMode}, preprocess=${preprocessMode}`);

    try {
        const result = await Tesseract.recognize(
            imageDataUrl,
            'eng',
            {
                logger: () => {}, // Suppress logging for attempts
                tesseract_pageseg_mode: psmMode
            }
        );

        const extractedPlays = extractNumbersFromOCR(result.data.text);
        const confidence = result.data.confidence || 0;

        console.log(`    → confidence=${Math.round(confidence)}%, plays=${extractedPlays.length}`);

        return {
            plays: extractedPlays,
            confidence: confidence,
            text: result.data.text,
            settings: { rotation, psmMode, preprocessMode }
        };
    } catch (error) {
        console.error(`    → Error:`, error.message);
        return null;
    }
}

async function multiAttemptOCR(imageElement) {
    console.log('Starting multi-attempt OCR...');

    // Step 1: Try perspective correction first
    let baseImage = imageElement;
    const correctedDataUrl = perspectiveCorrection(imageElement);
    if (correctedDataUrl) {
        console.log('✓ Using perspective-corrected image as base');
        baseImage = await loadImageFromDataUrl(correctedDataUrl);
    } else {
        console.log('No perspective correction applied, using original');
    }

    const rotations = [0, 90, 180, 270];
    const psmModes = [
        3,  // Fully automatic page segmentation (default)
        6,  // Assume uniform block of text
        4,  // Assume single column of text
        11  // Sparse text, find as much as possible
    ];
    const preprocessModes = ['none', 'default', 'threshold'];

    const attempts = [];
    let bestAttempt = null;
    let bestScore = -1;

    // Try different combinations on the base (possibly corrected) image
    for (const rotation of rotations) {
        const rotatedImage = rotateImage(baseImage, rotation);

        for (const preprocessMode of preprocessModes) {
            const preprocessedImage = preprocessImage(
                await loadImageFromDataUrl(rotatedImage),
                preprocessMode
            );

            for (const psmMode of psmModes) {
                const result = await tryOCRWithSettings(preprocessedImage, rotation, psmMode, preprocessMode);

                if (result) {
                    // Score: plays found (most important) + confidence bonus
                    const score = result.plays.length * 100 + result.confidence;

                    attempts.push({
                        ...result,
                        score: score
                    });

                    if (score > bestScore) {
                        bestScore = score;
                        bestAttempt = result;
                    }

                    // Early exit if we found 5+ plays with good confidence
                    if (result.plays.length >= 5 && result.confidence > 70) {
                        console.log(`✓ Found optimal result early, stopping search`);
                        return bestAttempt;
                    }
                }
            }
        }
    }

    console.log(`Completed ${attempts.length} OCR attempts`);
    if (bestAttempt) {
        console.log(`Best: rotation=${bestAttempt.settings.rotation}°, PSM=${bestAttempt.settings.psmMode}, preprocess=${bestAttempt.settings.preprocessMode}`);
        console.log(`      ${bestAttempt.plays.length} plays, ${Math.round(bestAttempt.confidence)}% confidence`);
    }

    return bestAttempt;
}

// Helper to load image from data URL
function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function processTicketImage() {
    const image = document.getElementById('captured-image');
    const processingIndicator = document.getElementById('processing-indicator');
    const imageControls = document.querySelector('.image-controls');

    // Show processing indicator
    imageControls.style.display = 'none';
    processingIndicator.style.display = 'block';
    processingIndicator.innerHTML = '<p>Processing ticket image...</p>';

    try {
        let extractedPlays = null;
        let extractedDate = null;

        // Pipeline: Template matching first (matches Python implementation)
        if (appState.templatesLoaded && typeof cv !== 'undefined') {
            console.log('Processing with template matching pipeline...');
            extractedPlays = extractNumbersTemplateMatching(image);

            if (extractedPlays && extractedPlays.length > 0) {
                console.log(`✓ Template matching succeeded: ${extractedPlays.length} plays found`);
            } else {
                console.log('⚠ Template matching found no plays');
            }
        } else {
            console.log('⚠ Templates not loaded, template matching unavailable');
        }

        // Fall back to basic OCR only if template matching completely failed
        if (!extractedPlays || extractedPlays.length === 0) {
            console.log('Falling back to OCR...');
            processingIndicator.innerHTML = '<p>Template matching failed, trying fallback extraction...</p>';

            const ocrResult = await Tesseract.recognize(
                image,
                'eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(m.progress * 100);
                            processingIndicator.innerHTML = `<p>Fallback extraction: ${progress}%</p>`;
                        }
                    }
                }
            );

            extractedPlays = extractNumbersFromOCR(ocrResult.data.text);
            extractedDate = extractDrawingDate(ocrResult.data.text);

            if (!extractedPlays || extractedPlays.length === 0) {
                alert('Could not detect any plays. Please enter manually or try a clearer photo.');
                processingIndicator.style.display = 'none';
                imageControls.style.display = 'flex';
                return;
            }
        }

        // Add extracted plays to state
        appState.ticketPlays = extractedPlays;
        appState.extractedDate = extractedDate;

        // Hide camera stuff and show plays
        document.getElementById('captured-image-container').style.display = 'none';
        showTicketPlays();

        // Auto-populate drawing date if extracted
        if (extractedDate) {
            document.getElementById('drawing-date').value = extractedDate;
        }

    } catch (error) {
        console.error('Processing error:', error);
        alert('Error processing image. Please try again or enter manually.');
        processingIndicator.style.display = 'none';
        imageControls.style.display = 'flex';
    }
}

function findQRCode(binaryMat) {
    console.log('Detecting QR code...');

    try {
        const qrDetector = new cv.QRCodeDetector();
        const points = new cv.Mat();

        // Try detection on inverted binary
        const binaryInverted = new cv.Mat();
        cv.bitwise_not(binaryMat, binaryInverted);

        const detectedData = qrDetector.detectAndDecode(binaryInverted, points);

        if (points.rows > 0) {
            // QR code found - extract corner points
            const qrPoints = [];
            for (let i = 0; i < 4; i++) {
                qrPoints.push({
                    x: points.floatAt(0, i * 2),
                    y: points.floatAt(0, i * 2 + 1)
                });
            }

            const qrTopY = Math.min(...qrPoints.map(p => p.y));
            console.log(`✓ QR code detected at y=${Math.round(qrTopY)}`);

            binaryInverted.delete();
            points.delete();

            return { found: true, points: qrPoints, topY: qrTopY };
        }

        binaryInverted.delete();
        points.delete();
        console.log('✗ QR code not detected');
        return { found: false };

    } catch (error) {
        console.error('QR detection error:', error);
        return { found: false };
    }
}

function normalizeOrientation(binaryMat) {
    console.log('Normalizing orientation...');

    const qrInfo = findQRCode(binaryMat);

    if (qrInfo.found) {
        // Use QR code for homography
        console.log('Using QR code for perspective transform');

        const qrPoints = qrInfo.points;

        // Order points: top-left, top-right, bottom-right, bottom-left
        const sorted = [...qrPoints].sort((a, b) => a.y - b.y);
        const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
        const ordered = [top[0], top[1], bottom[1], bottom[0]];

        // Calculate QR code size and create destination points for upright orientation
        const qrWidth = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
        const qrHeight = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
        const qrSize = Math.round((qrWidth + qrHeight) / 2);

        // Ticket dimensions based on QR code (from Python pipeline)
        const ticketWidth = Math.round(qrSize * 10.8);
        const ticketHeight = Math.round(qrSize * 10.8);

        // Position QR code at bottom-right of canvas
        const qrMargin = Math.round(qrSize * 0.2);
        const qrDestX = ticketWidth - qrSize - qrMargin;
        const qrDestY = ticketHeight - qrSize - qrMargin;

        // Source and destination points for homography
        const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            ordered[0].x, ordered[0].y,
            ordered[1].x, ordered[1].y,
            ordered[2].x, ordered[2].y,
            ordered[3].x, ordered[3].y
        ]);

        const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            qrDestX, qrDestY,
            qrDestX + qrSize, qrDestY,
            qrDestX + qrSize, qrDestY + qrSize,
            qrDestX, qrDestY + qrSize
        ]);

        // Calculate and apply homography
        const H = cv.getPerspectiveTransform(srcPoints, dstPoints);
        const normalized = new cv.Mat();
        const dsize = new cv.Size(ticketWidth, ticketHeight);
        cv.warpPerspective(binaryMat, normalized, H, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

        srcPoints.delete();
        dstPoints.delete();
        H.delete();

        console.log(`Applied homography, normalized to ${ticketWidth}x${ticketHeight}`);
        return { normalized, method: 'qr_homography', qrFound: true, qrTopY: qrDestY };
    } else {
        // Fallback: return original (could implement yellow strip detection here)
        console.log('⚠ No QR code found, using original orientation');
        const normalized = binaryMat.clone();
        return { normalized, method: 'none', qrFound: false };
    }
}

function findPlaysRegion(normalizedMat, qrInfo) {
    console.log('Finding plays region...');

    if (!qrInfo.qrFound) {
        console.log('✗ Cannot find plays region without QR code');
        return { found: false };
    }

    const qrTopY = qrInfo.qrTopY;

    // Crop to region above QR code
    const aboveQR = normalizedMat.roi(new cv.Rect(0, 0, normalizedMat.cols, qrTopY));
    console.log(`Cropped to region above QR code: ${aboveQR.rows}px tall`);

    // Find dashed line that separates header from plays
    // Search in approximate range (58-72% of image height from top)
    const searchStartY = Math.round(0.58 * aboveQR.rows);
    const searchEndY = Math.round(0.72 * aboveQR.rows);
    const searchRegion = aboveQR.roi(new cv.Rect(0, searchStartY, aboveQR.cols, searchEndY - searchStartY));

    // Use horizontal projection to find sparse patterns (dashed lines)
    const horizontalProj = new Array(searchRegion.rows).fill(0);
    for (let y = 0; y < searchRegion.rows; y++) {
        let whitePixels = 0;
        for (let x = 0; x < searchRegion.cols; x++) {
            if (searchRegion.ucharAt(y, x) > 128) {
                whitePixels++;
            }
        }
        horizontalProj[y] = whitePixels;
    }

    // Find line with moderate projection (dashed line characteristic)
    const maxProj = Math.max(...horizontalProj);
    let boundaryY = searchStartY;

    for (let y = 0; y < horizontalProj.length; y++) {
        const normalized = horizontalProj[y] / maxProj;
        if (normalized > 0.3 && normalized < 0.7) {
            boundaryY = searchStartY + y;
            break;
        }
    }

    console.log(`Found top boundary at y=${boundaryY}`);

    // Crop to plays region (from boundary to QR code)
    const topY = boundaryY + 10; // Small margin
    const bottomY = qrTopY - 10;  // Small margin before QR

    const playsRegion = normalizedMat.roi(new cv.Rect(0, topY, normalizedMat.cols, bottomY - topY));

    searchRegion.delete();
    aboveQR.delete();

    console.log(`Cropped to plays region: ${playsRegion.rows}px tall (y=${topY} to y=${bottomY})`);

    return { found: true, region: playsRegion, topY, bottomY };
}

function extractNumbersTemplateMatching(imageElement) {
    console.log('Using template matching extraction...');
    console.log('='.repeat(60));

    if (!appState.templatesLoaded || typeof cv === 'undefined') {
        console.log('Templates not loaded, falling back to OCR');
        return null;
    }

    try {
        // Step 1: Load and apply Otsu's binarization
        console.log('Step 1: Loading image and applying binarization...');
        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0);

        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const binary = new cv.Mat();
        cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        console.log('✓ Applied Otsu binarization');

        // Step 2: Normalize orientation using QR code
        console.log('\nStep 2: Normalizing orientation...');
        const { normalized, method, qrFound, qrTopY } = normalizeOrientation(binary);
        console.log(`✓ Normalization complete (method: ${method})`);

        // Step 3: Find plays region
        console.log('\nStep 3: Finding plays region...');
        const regionInfo = findPlaysRegion(normalized, { qrFound, qrTopY });

        if (!regionInfo.found) {
            console.log('✗ Could not find plays region, using full image');
            // Fall back to using full normalized image
            regionInfo.region = normalized.clone();
            regionInfo.found = true;
        }

        // Step 4: Apply morphological closing
        console.log('\nStep 4: Applying morphological operations...');
        const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        const playsProcessed = new cv.Mat();
        cv.morphologyEx(regionInfo.region, playsProcessed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
        console.log('✓ Applied morphological closing');

        // Step 5: Extract plays using template matching
        console.log('\nStep 5: Extracting plays with template matching...');
        console.log('Detecting PB markers...');
        const pbMarkers = findPBMarkers(playsProcessed);
        console.log(`Found ${pbMarkers.length} PB markers`);

        console.log('Detecting all digits...');
        const allDigits = findAllDigits(playsProcessed);
        console.log(`Matched ${allDigits.length} digits`);

        console.log('Grouping digits into rows...');
        const digitRows = groupDigitsByY(allDigits);
        console.log(`Grouped into ${digitRows.length} rows`);

        console.log('Processing rows to extract plays...');
        const plays = extractPlaysFromRows(digitRows, pbMarkers, appState.pbTemplate);

        // Cleanup
        src.delete();
        gray.delete();
        binary.delete();
        normalized.delete();
        if (regionInfo.region) regionInfo.region.delete();
        playsProcessed.delete();
        kernel.delete();

        console.log(`\n✓ Total plays extracted: ${plays.length}`);
        console.log('='.repeat(60));
        return plays;

    } catch (error) {
        console.error('Template matching error:', error);
        return null;
    }
}

function findPBMarkers(grayMat) {
    const pbMarkers = [];

    if (!appState.pbTemplate ||
        grayMat.rows < appState.pbTemplate.rows ||
        grayMat.cols < appState.pbTemplate.cols) {
        console.log('Cannot perform PB template matching');
        return pbMarkers;
    }

    const result = new cv.Mat();
    cv.matchTemplate(grayMat, appState.pbTemplate, result, cv.TM_CCOEFF_NORMED);

    const threshold = 0.75;

    // Find all matches above threshold
    const candidates = [];
    for (let y = 0; y < result.rows; y++) {
        for (let x = 0; x < result.cols; x++) {
            const confidence = result.floatAt(y, x);
            if (confidence >= threshold) {
                candidates.push({ x, y, confidence });
            }
        }
    }

    // Apply non-maximum suppression
    candidates.sort((a, b) => b.confidence - a.confidence);
    for (const candidate of candidates) {
        let isDuplicate = false;
        for (const marker of pbMarkers) {
            if (Math.abs(candidate.x - marker.x) < 30 && Math.abs(candidate.y - marker.y) < 30) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) {
            pbMarkers.push(candidate);
        }
    }

    pbMarkers.sort((a, b) => a.y - b.y);
    result.delete();

    return pbMarkers;
}

function matchDigitTemplate(digitMat) {
    let bestMatch = null;
    let bestScore = 0.0;

    // Try each digit template with multiple scales
    const scales = [0.85, 0.925, 1.0, 1.075, 1.15];

    for (let digit = 0; digit <= 9; digit++) {
        const template = appState.digitTemplates[digit];
        if (!template) continue;

        let digitBestScore = 0.0;

        for (const scale of scales) {
            try {
                // Scale the template
                const scaledTemplate = new cv.Mat();
                const dsize = new cv.Size(
                    Math.round(template.cols * scale),
                    Math.round(template.rows * scale)
                );
                cv.resize(template, scaledTemplate, dsize);

                // Resize digit to match template
                const resized = new cv.Mat();
                const targetSize = new cv.Size(scaledTemplate.cols, scaledTemplate.rows);
                cv.resize(digitMat, resized, targetSize);

                // Match
                const result = new cv.Mat();
                cv.matchTemplate(resized, scaledTemplate, result, cv.TM_CCOEFF_NORMED);
                const score = result.floatAt(0, 0);

                if (score > digitBestScore) {
                    digitBestScore = score;
                }

                scaledTemplate.delete();
                resized.delete();
                result.delete();
            } catch (e) {
                continue;
            }
        }

        if (digitBestScore > bestScore) {
            bestScore = digitBestScore;
            bestMatch = digit;
        }
    }

    // Require minimum confidence
    if (bestScore < 0.4) {
        return { digit: null, confidence: bestScore };
    }

    return { digit: bestMatch, confidence: bestScore };
}

function findAllDigits(grayMat) {
    const allDigits = [];

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(grayMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Filter by size
    const minHeight = 30;
    const minWidth = 15;
    const maxWidth = 90;
    const minArea = 800;
    const maxArea = 6000;

    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const rect = cv.boundingRect(contour);
        const area = cv.contourArea(contour);

        if (rect.height >= minHeight && rect.width >= minWidth && rect.width <= maxWidth &&
            area >= minArea && area <= maxArea) {

            // Extract digit region
            const digitROI = grayMat.roi(rect);

            // Match against templates
            const match = matchDigitTemplate(digitROI);

            if (match.digit !== null) {
                const centerY = rect.y + Math.floor(rect.height / 2);
                allDigits.push({
                    x: rect.x,
                    y: centerY,
                    digit: match.digit,
                    confidence: match.confidence
                });
            }

            digitROI.delete();
        }
    }

    contours.delete();
    hierarchy.delete();

    return allDigits;
}

function groupDigitsByY(allDigits) {
    if (allDigits.length === 0) return [];

    // Sort by Y position
    allDigits.sort((a, b) => a.y - b.y);

    const digitRows = [];
    let currentRow = [allDigits[0]];

    for (let i = 1; i < allDigits.length; i++) {
        const prevY = currentRow[0].y;
        const currY = allDigits[i].y;

        // If within 40px vertically, same row
        if (Math.abs(currY - prevY) <= 40) {
            currentRow.push(allDigits[i]);
        } else {
            digitRows.push(currentRow);
            currentRow = [allDigits[i]];
        }
    }

    if (currentRow.length > 0) {
        digitRows.push(currentRow);
    }

    return digitRows;
}

function reconstructTwoDigitNumbers(digitsList) {
    if (digitsList.length === 0) return [];

    // Sort by X position
    digitsList.sort((a, b) => a.x - b.x);

    const numbers = [];
    let i = 0;

    while (i < digitsList.length) {
        if (i + 1 < digitsList.length) {
            const x1 = digitsList[i].x;
            const x2 = digitsList[i + 1].x;

            // If digits are close (within 110px), they form a 2-digit number
            if (x2 - x1 < 110) {
                const number = digitsList[i].digit * 10 + digitsList[i + 1].digit;
                numbers.push(number);
                i += 2;
                continue;
            }
        }

        // Single digit (shouldn't happen but handle it)
        numbers.push(digitsList[i].digit);
        i++;
    }

    return numbers;
}

function extractPlaysFromRows(digitRows, pbMarkers, pbTemplate) {
    const plays = [];
    let validPlayNumber = 1;

    const pbW = pbTemplate ? pbTemplate.cols : 90;
    const pbH = pbTemplate ? pbTemplate.rows : 88;

    for (let rowIdx = 0; rowIdx < digitRows.length; rowIdx++) {
        const digitRow = digitRows[rowIdx];
        digitRow.sort((a, b) => a.x - b.x);

        // Get average Y for this row
        const avgY = digitRow.reduce((sum, d) => sum + d.y, 0) / digitRow.length;

        // Find closest PB marker
        let closestPB = null;
        let minDist = Infinity;

        for (const pb of pbMarkers) {
            const pbCenterY = pb.y + Math.floor(pbH / 2);
            const dist = Math.abs(pbCenterY - avgY);
            if (dist < minDist) {
                minDist = dist;
                closestPB = pb;
            }
        }

        if (!closestPB) {
            console.log(`Row ${rowIdx + 1}: No PB marker found, skipping`);
            continue;
        }

        const pbX = closestPB.x;
        console.log(`Row ${rowIdx + 1}: ${digitRow.length} digits at y≈${avgY.toFixed(0)}, PB at x=${pbX}`);

        // Separate digits by PB marker
        const beforePB = digitRow.filter(d => d.x < pbX);
        const afterPB = digitRow.filter(d => d.x > pbX + pbW);

        beforePB.sort((a, b) => a.x - b.x);
        afterPB.sort((a, b) => a.x - b.x);

        // Take last 10 digits before PB, first 2 after PB
        const whiteBallDigits = beforePB.slice(-10);
        const powerballDigits = afterPB.slice(0, 2);

        console.log(`  Before PB: ${beforePB.length} total, using last 10`);
        console.log(`  After PB: ${afterPB.length} total, using first 2`);

        // Reconstruct 2-digit numbers
        const whiteBalls = reconstructTwoDigitNumbers(whiteBallDigits);
        const powerballNumbers = reconstructTwoDigitNumbers(powerballDigits);
        const powerball = powerballNumbers.length > 0 ? powerballNumbers[0] : null;

        // Validate play
        const isValid = whiteBalls.length === 5 &&
                       powerball !== null &&
                       powerball >= 1 && powerball <= 26 &&
                       whiteBalls.every(n => n >= 1 && n <= 69);

        if (isValid) {
            console.log(`  ✓ VALID PLAY ${validPlayNumber}: White=${whiteBalls}, PB=${powerball}`);
            plays.push({
                white: whiteBalls.sort((a, b) => a - b),
                powerball: powerball
            });
            validPlayNumber++;
        } else {
            console.log(`  → Incomplete/Invalid: ${whiteBalls.length} white balls, PB=${powerball}`);
        }
    }

    return plays;
}

function extractNumbersFromOCR(text) {
    console.log('OCR Text:', text);

    // NOTE: This is the fallback OCR-based extraction.
    // The primary method is template matching (extractNumbersTemplateMatching).
    //
    // Template matching approach:
    // 1. Detect all PB markers first using template matching
    // 2. Detect all individual digits in the image
    // 3. Group digits by Y coordinate into rows
    // 4. For each row: take last 10 digits before PB (5 two-digit numbers)
    //                  take first 2 digits after PB (powerball)
    // 5. Pair adjacent digits within 110px into 2-digit numbers

    // Pre-process OCR text to fix common errors
    // Fix common PB variations (MB, KB, B with number after, m with number)
    text = text.replace(/\bMB\b/gi, 'PB');
    text = text.replace(/\bKB\b/gi, 'PB');
    // Handle m/M before numbers (mM26, m26, M26, m 26 → PB 26)
    text = text.replace(/m+\s*(\d)/gi, 'PB $1'); // One or more m's followed by optional space and digit
    // Handle B followed by number (B05, B06 → PB 05, PB 06)
    text = text.replace(/\bB(\d\d?)/gi, 'PB $1');
    // Handle number followed by B at word boundary (1B, 2B → leave the number, remove B)
    text = text.replace(/(\d+)B\b/gi, '$1');
    // Add space before PB if missing (49PB → 49 PB)
    text = text.replace(/(\d)(PB)/gi, '$1 $2');

    // Fix common number OCR errors
    text = text.replace(/\b72\b/g, '12'); // "72" is often misread "12"
    text = text.replace(/\b71\b/g, '11'); // "71" is often misread "11"
    text = text.replace(/\bBa\b/g, '04'); // "Ba" is often misread "04"
    text = text.replace(/\bOa\b/g, '04'); // "Oa" is often misread "04"
    text = text.replace(/\bO(\d)/g, '0$1'); // "O" (letter) is often "0" (zero)

    // Fix concatenated numbers - split 4+ consecutive digits into pairs
    // This mimics the Python pipeline's pairing of adjacent digits into 2-digit numbers
    text = text.replace(/(\d{4,})/g, (match) => {
        const digits = match.split('');
        const pairs = [];
        for (let i = 0; i < digits.length - 1; i += 2) {
            pairs.push(digits[i] + digits[i + 1]);
        }
        if (digits.length % 2 === 1) {
            pairs.push(digits[digits.length - 1]);
        }
        return pairs.join(' ');
    });

    const plays = [];
    const lines = text.split('\n');

    // Process line by line, looking for lines with 6+ valid numbers
    console.log('Processing lines for lottery plays...');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip lines that are clearly not lottery plays
        if (line.length < 10) continue;

        // Extract all numbers from this line
        const numbers = line.match(/\d+/g);
        if (!numbers || numbers.length < 6) continue;

        const nums = numbers.map(n => parseInt(n));
        const validNums = nums.filter(n => n >= 1 && n <= 69);

        // Need at least 6 valid numbers
        if (validNums.length < 6) continue;

        console.log(`Line ${i}: "${line}"`);
        console.log(`  Valid numbers: ${validNums.join(', ')}`);

        // If line has "PB", extract the powerball specifically from after "PB"
        let powerball = null;
        let powerballIndex = -1;
        const pbMatch = line.match(/\bPB\s*(\d+)/i);
        if (pbMatch) {
            const pbNum = parseInt(pbMatch[1]);
            if (pbNum >= 1 && pbNum <= 26) {
                powerball = pbNum;
                // Find index of this powerball in validNums
                powerballIndex = validNums.indexOf(pbNum);
                console.log(`  Found PB marker with powerball: ${powerball} at index ${powerballIndex}`);
            }
        }

        // If we didn't find PB marker, use last valid number as powerball
        if (!powerball) {
            powerball = validNums[validNums.length - 1];
            powerballIndex = validNums.length - 1;
        }

        // Get white balls - take the 5 numbers immediately before the powerball
        // Python pipeline takes the last 10 digits before PB marker, pairs them into 5 two-digit numbers
        // Here we approximate this by taking 5 numbers before the powerball
        let whiteBalls;
        if (powerballIndex >= 5) {
            whiteBalls = validNums.slice(powerballIndex - 5, powerballIndex);
        } else {
            const lastSix = validNums.slice(-6);
            whiteBalls = lastSix.slice(0, 5);
        }

        if (whiteBalls.length === 5 && new Set(whiteBalls).size === 5 && powerball >= 1 && powerball <= 26) {
            const play = {
                white: whiteBalls.sort((a, b) => a - b),
                powerball: powerball
            };

            console.log(`  ✓ Found play: ${play.white.join(', ')} + PB ${play.powerball}`);
            plays.push(play);
        } else if (new Set(whiteBalls).size !== whiteBalls.length) {
            console.log(`  ✗ White balls not unique: ${whiteBalls.join(', ')}`);
        } else if (whiteBalls.length < 5) {
            console.log(`  ✗ Not enough white balls: ${whiteBalls.join(', ')}`);
        } else {
            console.log(`  ✗ Invalid powerball: ${powerball}`);
        }
    }

    console.log(`Total plays extracted: ${plays.length}`);
    return plays;
}

// Helper function to extract a single play from a group of numbers
function extractPlayFromNumbers(numbers) {
    if (numbers.length < 5) return null;

    // Separate potential white balls and powerball
    const whiteCandidates = numbers.filter(n => n >= 1 && n <= 69);
    const powerballCandidates = numbers.filter(n => n >= 1 && n <= 26);

    if (whiteCandidates.length < 5) return null;

    // Take first 5 valid white balls
    const white = whiteCandidates.slice(0, 5);

    // Check for duplicates in white balls
    if (new Set(white).size !== 5) {
        // If duplicates, try different combinations
        const uniqueWhite = [...new Set(whiteCandidates)];
        if (uniqueWhite.length < 5) return null;
        white.length = 0;
        white.push(...uniqueWhite.slice(0, 5));
    }

    // Find powerball - prefer a number that's NOT in white balls and is <= 26
    let powerball = null;

    // First try: 6th number if it's valid and not in white balls
    if (numbers.length >= 6) {
        const sixthNum = numbers[5];
        if (sixthNum >= 1 && sixthNum <= 26 && !white.includes(sixthNum)) {
            powerball = sixthNum;
        }
    }

    // Second try: find any number <= 26 not in white balls
    if (!powerball) {
        powerball = powerballCandidates.find(n => !white.includes(n));
    }

    // Third try: if all else fails, use any number <= 26
    if (!powerball && powerballCandidates.length > 0) {
        powerball = powerballCandidates[powerballCandidates.length - 1];
    }

    if (!powerball) return null;

    return {
        white: white.sort((a, b) => a - b),
        powerball: powerball
    };
}

// Extract drawing date from OCR text
function extractDrawingDate(text) {
    console.log('Extracting date from text:', text);

    // Look for various date patterns
    const datePatterns = [
        // Weekday Month DD YY (e.g., "Mon Dec 15 25" or "MON DEC 15 25")
        /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2})/i,
        // MM/DD/YYYY or MM/DD/YY
        /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
        // Month DD, YYYY
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i,
        // YYYY-MM-DD
        /(\d{4})-(\d{1,2})-(\d{1,2})/,
        // Draw Date: MM/DD/YYYY
        /Draw\s+Date:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i
    ];

    for (let pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            try {
                let year, month, day;

                // Check if it's the weekday format (Mon Dec 15 25)
                if (match[0].match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
                    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    month = monthNames.indexOf(match[2].toLowerCase().substring(0, 3)) + 1;
                    day = parseInt(match[3]);
                    year = parseInt(match[4]);
                } else if (match[0].includes('/')) {
                    month = parseInt(match[1]);
                    day = parseInt(match[2]);
                    year = parseInt(match[3]);
                } else if (match[0].includes('-')) {
                    year = parseInt(match[1]);
                    month = parseInt(match[2]);
                    day = parseInt(match[3]);
                } else {
                    // Month name format
                    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    month = monthNames.indexOf(match[1].toLowerCase().substring(0, 3)) + 1;
                    day = parseInt(match[2]);
                    year = parseInt(match[3]);
                }

                // Convert 2-digit year to 4-digit
                if (year < 100) {
                    year += year < 50 ? 2000 : 1900;
                }

                // Validate date
                if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    console.log('Extracted date:', dateStr);
                    return dateStr;
                }
            } catch (e) {
                console.error('Date parsing error:', e);
            }
        }
    }

    console.log('No date found');
    return null;
}

function showManualPlayInput() {
    openPlayModal();
}

function showTicketPlays() {
    const container = document.getElementById('ticket-plays-container');
    const playsList = document.getElementById('plays-list');

    playsList.innerHTML = '';

    appState.ticketPlays.forEach((play, index) => {
        const playItem = createPlayItem(play, index);
        playsList.appendChild(playItem);
    });

    container.style.display = 'block';
    document.querySelector('.scan-options').style.display = 'none';
}

function createPlayItem(play, index) {
    const div = document.createElement('div');
    div.className = 'play-item';

    const contentDiv = document.createElement('div');
    contentDiv.style.flex = '1';

    // Show play number only if there are multiple plays
    if (appState.ticketPlays.length > 1) {
        const playLabel = document.createElement('div');
        playLabel.className = 'play-label';
        playLabel.textContent = `Play ${index + 1}`;
        contentDiv.appendChild(playLabel);
    }

    const numbersDiv = document.createElement('div');
    numbersDiv.className = 'play-numbers';

    play.white.forEach(num => {
        numbersDiv.appendChild(createBall(num, 'white'));
    });

    numbersDiv.appendChild(createBall(play.powerball, 'red'));

    contentDiv.appendChild(numbersDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'play-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'edit-btn';
    editBtn.onclick = () => openPlayModal(index);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-btn';
    deleteBtn.onclick = () => deletePlay(index);

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    div.appendChild(contentDiv);
    div.appendChild(actionsDiv);

    return div;
}

// ===== PLAY MODAL =====
function setupPlayModal() {
    document.getElementById('save-play-btn').addEventListener('click', savePlay);
    document.getElementById('delete-play-btn').addEventListener('click', () => {
        deletePlay(appState.currentEditIndex);
        closePlayModal();
    });
    document.getElementById('cancel-modal-btn').addEventListener('click', closePlayModal);

    // Close modal when clicking outside
    document.getElementById('play-modal').addEventListener('click', (e) => {
        if (e.target.id === 'play-modal') {
            closePlayModal();
        }
    });
}

function openPlayModal(editIndex = null) {
    const modal = document.getElementById('play-modal');
    const title = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('delete-play-btn');
    const inputs = document.querySelectorAll('.modal-ball-input');

    appState.currentEditIndex = editIndex;

    if (editIndex !== null) {
        title.textContent = 'Edit Play';
        deleteBtn.style.display = 'block';

        const play = appState.ticketPlays[editIndex];
        inputs.forEach((input, i) => {
            if (i < 5) {
                input.value = play.white[i];
            } else {
                input.value = play.powerball;
            }
        });
    } else {
        title.textContent = 'Add Play';
        deleteBtn.style.display = 'none';
        inputs.forEach(input => input.value = '');
    }

    modal.classList.add('active');
    inputs[0].focus();
}

function closePlayModal() {
    document.getElementById('play-modal').classList.remove('active');
    appState.currentEditIndex = null;
}

function savePlay() {
    const inputs = document.querySelectorAll('.modal-ball-input');
    const white = Array.from(inputs).slice(0, 5).map(input => parseInt(input.value));
    const powerball = parseInt(inputs[5].value);

    // Validate
    if (white.some(isNaN) || white.length !== 5) {
        alert('Please enter all 5 white ball numbers');
        return;
    }

    if (isNaN(powerball)) {
        alert('Please enter the Powerball number');
        return;
    }

    if (white.some(n => n < 1 || n > 69)) {
        alert('White ball numbers must be between 1 and 69');
        return;
    }

    if (powerball < 1 || powerball > 26) {
        alert('Powerball must be between 1 and 26');
        return;
    }

    if (new Set(white).size !== white.length) {
        alert('White ball numbers must be unique');
        return;
    }

    const play = {
        white: white.sort((a, b) => a - b),
        powerball: powerball
    };

    if (appState.currentEditIndex !== null) {
        appState.ticketPlays[appState.currentEditIndex] = play;
    } else {
        appState.ticketPlays.push(play);
    }

    showTicketPlays();
    closePlayModal();
}

function deletePlay(index) {
    if (confirm('Delete this play?')) {
        appState.ticketPlays.splice(index, 1);

        if (appState.ticketPlays.length === 0) {
            document.getElementById('ticket-plays-container').style.display = 'none';
            document.querySelector('.scan-options').style.display = 'flex';
        } else {
            showTicketPlays();
        }
    }
}

// ===== CHECKING TICKET =====
function checkTicket() {
    if (appState.ticketPlays.length === 0) {
        alert('Please scan or enter your ticket first');
        navigateToSection('ticket-section');
        return;
    }

    if (!appState.winningNumbers) {
        alert('Please enter winning numbers');
        return;
    }

    const results = appState.ticketPlays.map(play => checkPlay(play));
    displayResults(results);
    navigateToSection('results-section');
}

function checkPlay(play) {
    const winningWhite = new Set(appState.winningNumbers.white);
    const whiteMatches = play.white.filter(n => winningWhite.has(n));
    const powerballMatch = play.powerball === appState.winningNumbers.powerball;

    const prize = calculatePrize(whiteMatches.length, powerballMatch);

    return {
        play: play,
        whiteMatches: whiteMatches,
        powerballMatch: powerballMatch,
        matchCount: whiteMatches.length,
        prize: prize
    };
}

// ===== RESULTS =====
function setupResults() {
    document.getElementById('check-another-btn').addEventListener('click', resetApp);
}

function displayResults(results) {
    const container = document.getElementById('results-container');
    const summary = document.getElementById('results-summary');

    container.innerHTML = '';

    // Calculate total winnings
    let totalWinnings = 0;
    let hasJackpot = false;

    results.forEach(result => {
        if (result.prize.type === 'Jackpot') {
            hasJackpot = true;
        } else {
            totalWinnings += result.prize.amount;
        }
    });

    // Display summary
    const winningCount = results.filter(r => r.prize.amount > 0 || r.prize.type === 'Jackpot').length;
    summary.innerHTML = `
        <h3>Total Results</h3>
        <div class="total-winnings ${totalWinnings > 0 || hasJackpot ? 'winner' : ''}">
            ${hasJackpot ? '🎉 JACKPOT WINNER! 🎉' : `$${totalWinnings.toLocaleString()}`}
        </div>
        <p>${winningCount} winning ${pluralize('play', winningCount)} out of ${results.length}</p>
    `;

    // Display individual results
    results.forEach((result, index) => {
        const resultItem = createResultItem(result, index);
        container.appendChild(resultItem);
    });
}

function createResultItem(result, index) {
    const div = document.createElement('div');
    div.className = `result-item ${result.prize.amount > 0 || result.prize.type === 'Jackpot' ? 'winner' : ''}`;

    const isWinner = result.prize.amount > 0 || result.prize.type === 'Jackpot';
    const prizeText = result.prize.type === 'Jackpot' ? 'JACKPOT!' :
                     result.prize.amount > 0 ? `$${result.prize.amount.toLocaleString()}` : 'No Prize';

    div.innerHTML = `
        <div class="result-header">
            <span class="result-title">Play ${index + 1}</span>
            <span class="result-prize">${prizeText}</span>
        </div>
        <div class="match-visualization">
            <div class="match-row">
                <span class="match-label">Your Picks:</span>
                <div class="match-balls" id="your-picks-${index}"></div>
            </div>
            <div class="match-row">
                <span class="match-label">Winning:</span>
                <div class="match-balls" id="winning-${index}"></div>
            </div>
        </div>
        <div class="match-stats">
            ${result.matchCount} white ${pluralize('ball', result.matchCount)} matched
            ${result.powerballMatch ? ' + Powerball matched' : ''}
        </div>
    `;

    // Add balls to visualization
    setTimeout(() => {
        const yourPicksContainer = document.getElementById(`your-picks-${index}`);
        const winningContainer = document.getElementById(`winning-${index}`);

        // Your picks
        result.play.white.forEach(num => {
            const ball = createBall(num, 'white');
            if (result.whiteMatches.includes(num)) {
                ball.classList.add('matched');
            }
            yourPicksContainer.appendChild(ball);
        });

        const yourPB = createBall(result.play.powerball, 'red');
        if (result.powerballMatch) {
            yourPB.classList.add('matched');
        }
        yourPicksContainer.appendChild(yourPB);

        // Winning numbers
        appState.winningNumbers.white.forEach(num => {
            winningContainer.appendChild(createBall(num, 'white'));
        });
        winningContainer.appendChild(createBall(appState.winningNumbers.powerball, 'red'));
    }, 100);

    return div;
}

// ===== NAVIGATION =====
function navigateToSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    document.getElementById(sectionId).classList.add('active');
    appState.currentSection = sectionId;

    // Scroll to top
    window.scrollTo(0, 0);
}

function resetApp() {
    appState.winningNumbers = null;
    appState.ticketPlays = [];
    appState.currentEditIndex = null;
    appState.extractedDate = null;

    // Reset displays
    document.getElementById('winning-numbers-display').style.display = 'none';
    document.getElementById('ticket-plays-container').style.display = 'none';
    document.querySelector('.scan-options').style.display = 'flex';

    // Clear inputs
    document.querySelectorAll('.ball-input').forEach(input => input.value = '');

    navigateToSection('ticket-section');
}

// ===== UTILITY FUNCTIONS =====
function createBall(number, color) {
    const ball = document.createElement('div');
    ball.className = `ball ${color}`;
    ball.textContent = number;
    return ball;
}

function formatDate(dateString) {
    if (dateString === 'Manual Entry') return dateString;
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function pluralize(word, count) {
    if (count === 1) {
        return word;
    }
    // Simple pluralization - add 's' for most words
    if (word.endsWith('y')) {
        return word.slice(0, -1) + 'ies';
    }
    return word + 's';
}
