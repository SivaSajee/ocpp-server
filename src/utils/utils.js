// Helper function to convert UTC to IST (UTC+5:30)
function toIST(date) {
    const utcDate = new Date(date);
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istDate = new Date(utcDate.getTime() + istOffset);
    return istDate.toISOString().replace('Z', '+05:30');
}

module.exports = { toIST };
