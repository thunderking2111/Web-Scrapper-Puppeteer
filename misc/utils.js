const CONSTANTS = {
    BROWSER_HEIGHT: 800,
    BROWSER_WIDTH: 1400,
    ITEM_SWITCH_DELAY: 1500,
    MAX_SCROLLS: 120,
    OBSERVER_DELAY: 5000,
    RESULTS_SCROLL_DELAY: 2000,
};

class ElNotFoundError extends Error {
    constructor(selector) {
        super(`Timeout waiting for: ${selector}`);
        this.name = this.constructor.name;
        this.selector = selector;
        Error.captureStackTrace(this, this.constructor);
    }
}

const sleep = (delay = 1000) => new Promise((resolve) => setTimeout(resolve, delay));

module.exports = { CONSTANTS, sleep, ElNotFoundError };
