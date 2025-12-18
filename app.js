// Powerball Ticket Checker App
// Main application logic

// App State
const appState = {
    currentSection: 'winning-numbers-section',
    winningNumbers: null,
    ticketPlays: [],
    currentEditIndex: null,
    cameraStream: null
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

    console.log('App initialized');
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

    // Continue button
    document.getElementById('continue-to-ticket-btn').addEventListener('click', () => {
        navigateToSection('ticket-section');
    });
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
    document.getElementById('manual-ticket-btn').addEventListener('click', showManualPlayInput);
    document.getElementById('capture-btn').addEventListener('click', captureImage);
    document.getElementById('cancel-camera-btn').addEventListener('click', stopCamera);
    document.getElementById('retake-btn').addEventListener('click', retakePhoto);
    document.getElementById('process-image-btn').addEventListener('click', processTicketImage);
    document.getElementById('add-play-btn').addEventListener('click', () => openPlayModal());
    document.getElementById('check-ticket-btn').addEventListener('click', checkTicket);
    document.getElementById('back-to-numbers').addEventListener('click', () => {
        navigateToSection('winning-numbers-section');
    });
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
    startCamera();
}

async function processTicketImage() {
    const image = document.getElementById('captured-image');
    const processingIndicator = document.getElementById('processing-indicator');
    const imageControls = document.querySelector('.image-controls');

    // Show processing indicator
    imageControls.style.display = 'none';
    processingIndicator.style.display = 'block';

    try {
        // Use Tesseract.js for OCR
        const result = await Tesseract.recognize(
            image.src,
            'eng',
            {
                logger: m => console.log(m)
            }
        );

        // Extract numbers from OCR text
        const extractedPlays = extractNumbersFromOCR(result.data.text);

        if (extractedPlays.length === 0) {
            alert('Could not detect any numbers. Please enter manually or try retaking the photo.');
            processingIndicator.style.display = 'none';
            imageControls.style.display = 'flex';
            return;
        }

        // Add extracted plays to state
        appState.ticketPlays = extractedPlays;

        // Hide camera stuff and show plays
        document.getElementById('captured-image-container').style.display = 'none';
        showTicketPlays();

    } catch (error) {
        console.error('OCR error:', error);
        alert('Error processing image. Please try again or enter manually.');
        processingIndicator.style.display = 'none';
        imageControls.style.display = 'flex';
    }
}

function extractNumbersFromOCR(text) {
    // This is a simplified extraction - real tickets may need more sophisticated parsing
    const plays = [];
    const lines = text.split('\n');

    // Look for patterns like "01 02 03 04 05 PB:06" or similar
    const numberPattern = /\d+/g;

    for (let line of lines) {
        const numbers = line.match(numberPattern);
        if (numbers && numbers.length >= 6) {
            const nums = numbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 69);

            if (nums.length >= 6) {
                const white = nums.slice(0, 5).sort((a, b) => a - b);
                const powerball = nums[5] <= 26 ? nums[5] : nums.find(n => n <= 26);

                if (white.length === 5 && powerball) {
                    plays.push({ white, powerball });
                }
            }
        }
    }

    // If no plays found, try a more lenient approach
    if (plays.length === 0) {
        const allNumbers = text.match(numberPattern);
        if (allNumbers && allNumbers.length >= 6) {
            const nums = allNumbers.map(n => parseInt(n));
            const validNums = nums.filter(n => n >= 1 && n <= 69);

            if (validNums.length >= 5) {
                const white = validNums.slice(0, 5).sort((a, b) => a - b);
                const powerball = nums.find(n => n >= 1 && n <= 26) || validNums[5];

                if (powerball && powerball <= 26) {
                    plays.push({ white, powerball });
                }
            }
        }
    }

    return plays;
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

    const numbersDiv = document.createElement('div');
    numbersDiv.className = 'play-numbers';

    play.white.forEach(num => {
        numbersDiv.appendChild(createBall(num, 'white'));
    });

    numbersDiv.appendChild(createBall(play.powerball, 'red'));

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

    div.appendChild(numbersDiv);
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
    if (!appState.winningNumbers) {
        alert('Please enter winning numbers first');
        navigateToSection('winning-numbers-section');
        return;
    }

    if (appState.ticketPlays.length === 0) {
        alert('Please add at least one play to check');
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
    summary.innerHTML = `
        <h3>Total Results</h3>
        <div class="total-winnings ${totalWinnings > 0 || hasJackpot ? 'winner' : ''}">
            ${hasJackpot ? '🎉 JACKPOT WINNER! 🎉' : `$${totalWinnings.toLocaleString()}`}
        </div>
        <p>${results.filter(r => r.prize.amount > 0 || r.prize.type === 'Jackpot').length} winning play(s) out of ${results.length}</p>
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
            ${result.matchCount} white ball${result.matchCount !== 1 ? 's' : ''} matched
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

    // Reset displays
    document.getElementById('winning-numbers-display').style.display = 'none';
    document.getElementById('ticket-plays-container').style.display = 'none';
    document.querySelector('.scan-options').style.display = 'flex';

    // Clear inputs
    document.querySelectorAll('.ball-input').forEach(input => input.value = '');

    navigateToSection('winning-numbers-section');
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
