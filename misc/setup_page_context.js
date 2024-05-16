const { waitForEl } = require("./dom_helpers");
const { CONSTANTS, ElNotFoundError, sleep } = require("./utils");

/**
 * @param {import("puppeteer").Page} page
 * @param {object} extra
 */
async function setupPageContext(page, extra = {}) {
    // Expose necessary data to the browser context
    await page.exposeFunction("getWindowData", () => {
        return {
            ...extra,
            CONSTANTS,
            ElNotFoundError: ElNotFoundError.toString(),
            sleep: sleep.toString(),
            waitForEl: waitForEl.toString(),
        };
    });

    await page.evaluate(async () => {
        const windowData = await window.getWindowData();
        windowData.sleep = eval(windowData.sleep);
        windowData.ElNotFoundError = new Function(`return ${windowData.ElNotFoundError}`)();
        windowData.waitForEl = new Function(`return ${windowData.waitForEl}`)();
        Object.assign(window, windowData);
        String.prototype.sanitize = function () {
            const nonReadableRegex = /[^\x20-\x7E]/g;
            return this.replace(nonReadableRegex, "");
        };
    });
}

module.exports = setupPageContext;
