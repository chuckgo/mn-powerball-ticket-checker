// Powerball Historical Data
// Format: { date: 'YYYY-MM-DD', white: [n1, n2, n3, n4, n5], powerball: n, multiplier: n }

const powerballData = [
    // December 2025
    { date: '2025-12-17', white: [25, 33, 53, 62, 66], powerball: 17, multiplier: 2 },
    { date: '2025-12-15', white: [23, 35, 59, 63, 68], powerball: 2, multiplier: 3 },
    { date: '2025-12-13', white: [1, 28, 31, 57, 58], powerball: 16, multiplier: 2 },

    // January 2025
    { date: '2025-01-29', white: [8, 12, 31, 33, 38], powerball: 18, multiplier: 2 },
    { date: '2025-01-27', white: [2, 40, 47, 53, 55], powerball: 20, multiplier: 3 },
    { date: '2025-01-25', white: [8, 15, 17, 53, 66], powerball: 14, multiplier: 2 },
    { date: '2025-01-22', white: [5, 6, 27, 40, 49], powerball: 5, multiplier: 2 },
    { date: '2025-01-20', white: [15, 16, 32, 47, 54], powerball: 6, multiplier: 3 },
    { date: '2025-01-18', white: [14, 31, 35, 64, 69], powerball: 23, multiplier: 2 },
    { date: '2025-01-15', white: [8, 41, 52, 53, 58], powerball: 7, multiplier: 4 },
    { date: '2025-01-13', white: [4, 6, 16, 39, 66], powerball: 9, multiplier: 2 },
    { date: '2025-01-11', white: [3, 6, 32, 37, 65], powerball: 4, multiplier: 3 },
    { date: '2025-01-08', white: [1, 20, 36, 38, 43], powerball: 24, multiplier: 2 },
    { date: '2025-01-06', white: [17, 34, 46, 66, 67], powerball: 14, multiplier: 2 },
    { date: '2025-01-04', white: [26, 32, 43, 54, 56], powerball: 24, multiplier: 3 },
    { date: '2025-01-01', white: [6, 12, 28, 35, 66], powerball: 26, multiplier: 2 },

    // December 2024
    { date: '2024-12-30', white: [4, 11, 15, 54, 66], powerball: 23, multiplier: 2 },
    { date: '2024-12-28', white: [6, 12, 25, 53, 56], powerball: 1, multiplier: 3 },
    { date: '2024-12-25', white: [2, 4, 13, 27, 35], powerball: 11, multiplier: 2 },
    { date: '2024-12-23', white: [1, 7, 22, 47, 58], powerball: 26, multiplier: 2 },
    { date: '2024-12-21', white: [6, 18, 26, 27, 49], powerball: 2, multiplier: 3 },
    { date: '2024-12-18', white: [5, 17, 23, 40, 68], powerball: 25, multiplier: 2 },
    { date: '2024-12-16', white: [10, 17, 20, 48, 67], powerball: 10, multiplier: 2 },
    { date: '2024-12-14', white: [2, 20, 26, 53, 59], powerball: 22, multiplier: 3 },
    { date: '2024-12-11', white: [4, 8, 15, 46, 65], powerball: 21, multiplier: 2 },
    { date: '2024-12-09', white: [9, 20, 29, 44, 62], powerball: 17, multiplier: 4 },
    { date: '2024-12-07', white: [2, 23, 30, 50, 64], powerball: 8, multiplier: 2 },
    { date: '2024-12-04', white: [3, 10, 33, 58, 59], powerball: 9, multiplier: 3 },
    { date: '2024-12-02', white: [21, 27, 36, 62, 66], powerball: 25, multiplier: 2 },

    // November 2024
    { date: '2024-11-30', white: [7, 38, 65, 66, 68], powerball: 23, multiplier: 2 },
    { date: '2024-11-27', white: [11, 19, 21, 29, 52], powerball: 26, multiplier: 3 },
    { date: '2024-11-25', white: [16, 30, 60, 62, 69], powerball: 25, multiplier: 2 },
    { date: '2024-11-23', white: [1, 2, 17, 21, 66], powerball: 4, multiplier: 4 },
    { date: '2024-11-20', white: [13, 33, 40, 60, 61], powerball: 20, multiplier: 2 },
    { date: '2024-11-18', white: [27, 30, 44, 53, 63], powerball: 12, multiplier: 2 },
    { date: '2024-11-16', white: [2, 15, 27, 61, 68], powerball: 11, multiplier: 3 },
    { date: '2024-11-13', white: [6, 23, 25, 34, 51], powerball: 3, multiplier: 2 },
    { date: '2024-11-11', white: [7, 22, 29, 44, 52], powerball: 19, multiplier: 2 },
    { date: '2024-11-09', white: [19, 27, 30, 52, 56], powerball: 1, multiplier: 3 },
    { date: '2024-11-06', white: [5, 33, 41, 44, 59], powerball: 24, multiplier: 2 },
    { date: '2024-11-04', white: [1, 26, 32, 46, 51], powerball: 13, multiplier: 4 },
    { date: '2024-11-02', white: [22, 26, 39, 47, 63], powerball: 12, multiplier: 2 }
];

// Prize Structure (as of 2024-2025)
const prizeStructure = [
    { match: '5+PB', prize: 'Jackpot', description: '5 white balls + Powerball' },
    { match: '5', prize: 1000000, description: '5 white balls' },
    { match: '4+PB', prize: 50000, description: '4 white balls + Powerball' },
    { match: '4', prize: 100, description: '4 white balls' },
    { match: '3+PB', prize: 100, description: '3 white balls + Powerball' },
    { match: '3', prize: 7, description: '3 white balls' },
    { match: '2+PB', prize: 7, description: '2 white balls + Powerball' },
    { match: '1+PB', prize: 4, description: '1 white ball + Powerball' },
    { match: 'PB', prize: 4, description: 'Powerball only' }
];

// Helper function to get drawing by date
function getDrawingByDate(dateString) {
    return powerballData.find(drawing => drawing.date === dateString);
}

// Helper function to get all available dates
function getAvailableDates() {
    return powerballData.map(d => d.date).sort((a, b) => new Date(b) - new Date(a));
}

// Helper function to get most recent drawing
function getMostRecentDrawing() {
    return powerballData[0];
}

// Helper function to calculate prize
function calculatePrize(whiteMatches, powerballMatch) {
    if (whiteMatches === 5 && powerballMatch) return { type: 'Jackpot', amount: 'Jackpot' };
    if (whiteMatches === 5) return { type: '5', amount: 1000000 };
    if (whiteMatches === 4 && powerballMatch) return { type: '4+PB', amount: 50000 };
    if (whiteMatches === 4) return { type: '4', amount: 100 };
    if (whiteMatches === 3 && powerballMatch) return { type: '3+PB', amount: 100 };
    if (whiteMatches === 3) return { type: '3', amount: 7 };
    if (whiteMatches === 2 && powerballMatch) return { type: '2+PB', amount: 7 };
    if (whiteMatches === 1 && powerballMatch) return { type: '1+PB', amount: 4 };
    if (powerballMatch) return { type: 'PB', amount: 4 };
    return { type: 'No match', amount: 0 };
}

// Export for use in app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { powerballData, prizeStructure, getDrawingByDate, getAvailableDates, getMostRecentDrawing, calculatePrize };
}
