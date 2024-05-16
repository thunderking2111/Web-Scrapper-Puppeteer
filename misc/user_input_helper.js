const readline = require("readline");

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Function to clear the buffer
function clearBuffer() {
    rl.input.read();
    return Promise.resolve();
}

// Function to take input from the user after clearing buffer
/** @param {String} promptMsg */
function getUserInput(promptMsg) {
    return new Promise((resolve) => {
        // Clear buffer before taking input
        clearBuffer().then(() => {
            // Ask for input
            rl.question(`${promptMsg}: `, (input) => {
                resolve(input); // Resolve the promise with user input
            });
        });
    });
}

module.exports = getUserInput;
