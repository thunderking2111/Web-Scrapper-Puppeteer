const puppeteer = require("puppeteer");
const { createExcel } = require("./plugins/excel_helper");
const { createCSV } = require("./plugins/csv_helper");

const DEV_MODE = false;
const RESULTS_SCROLL_DELAY = 2000;
const OBSERVER_DELAY = 5000;
const MAX_SCROLLS = 120;
const BROWSER_HEIGHT = 800;
const BROWSER_WIDTH = 1280;
const ITEM_SWITCH_DELAY = 1500;

const SELECTORS = {
    searchBoxInput: "input#searchboxinput",
    searchButton: "button#searchbox-searchbutton",
    resultList: "div[role='feed']",
    resultItem: "div[role='feed'] a[aria-label][href^='https://www.google.com/maps/']",
    infoDisplayBox: "div[role='main']",
    title: "div[role='main'][aria-label] h1:last-of-type",
    ratingSibling: "span[aria-label*='star']",
    reviews: "span[aria-label*='review']",
    category: "button[jsaction*='category']",
    address: "button[data-item-id='address']",
    website: "a[aria-label^='Website:'][data-item-id='authority']",
    phone: "button[aria-label^='Phone:']",
    openHoursButton: "div[jsaction*='openhours']",
    openHoursTable: "div[jsaction*='openhours'] + div table",
};

let searchReqDef = null;
let browser = null;

class ElNotFoundError extends Error {
    constructor(selector) {
        super(`Timeout waiting for: ${selector}`);
        this.name = this.constructor.name;
        this.selector = selector;
        Error.captureStackTrace(this, this.constructor);
    }
}

const sleep = (delay = 1000) => new Promise((resolve) => setTimeout(resolve, delay));

function waitForEl(selector, options = {}) {
    const { delay = OBSERVER_DELAY } = options;
    function checkEl() {
        const el = document.querySelector(selector);
        if (
            el &&
            (!options.text ||
                el.textContent.includes(options.text) ||
                options.text.includes(el.textContent))
        ) {
            return el;
        }
    }
    return new Promise((resolve, reject) => {
        const el = checkEl();
        if (el) {
            return resolve(el);
        }
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
                const foundEl = checkEl();
                if (mutation.type === "childList" && foundEl) {
                    observer.disconnect(); // Stop observing
                    resolve(foundEl);
                }
            });
        });

        setTimeout(() => {
            observer.disconnect(); // Stop observing on timeout
            const el = checkEl();
            if (el) {
                resolve(el);
            }
            reject(new ElNotFoundError(selector));
        }, delay);

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/**
 * @param {puppeteer.Page} page
 * @param {puppeteer.ElementHandle} resultsListHandle
 */
async function scrollResultsList(page, resultsListHandle) {
    return await resultsListHandle.evaluate(async (resultsSection) => {
        resultsSection.scrollTop = resultsSection.scrollHeight;
        if (
            (resultsSection.lastChild &&
                resultsSection.lastChild.textContent &&
                resultsSection.lastChild.textContent.includes("end of the list")) ||
            resultsSection.querySelectorAll(SELECTORS.resultItem).length >= 10
        ) {
            return true;
        }
    });
}

/**
 * @param {puppeteer.Page} page
 */
async function startCatchSearchRequest(page) {
    await page.setRequestInterception(true);
    page.on("request", (caughtReq) => {
        if (caughtReq.url().includes("/www.google.com/search")) {
            searchReqDef = new Promise((resolve, reject) => {
                caughtReq.continue();
                page.waitForResponse(caughtReq.url())
                    .then((res) => {
                        if (res.ok()) {
                            resolve();
                        } else {
                            reject();
                        }
                    })
                    .catch((error) => reject(error));
            });
        } else {
            caughtReq.continue();
        }
    });
}

/**
 * @param {puppeteer.Page} page
 */
async function endCatchSearchRequest(page) {
    page.off("request");
    await page.setRequestInterception(false);
}

async function scrapUrl(url) {
    browser = await puppeteer.launch({
        headless: !DEV_MODE,
        defaultViewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
    });
    const page = await browser.newPage();
    try {
        await page.goto(url, { timeout: 60000 });
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("Stopped at loading url");
        } else if (e.message && e.message.includes("ERR_INTERNET_DISCONNECTED")) {
            console.log("========== Internet Issues =========");
        } else {
            throw e;
        }
        return;
    }
    console.log("URL");
    await page.waitForSelector(SELECTORS.searchBoxInput);
    await page.type(SELECTORS.searchBoxInput, "driving school near me");
    await page.click(SELECTORS.searchButton);
    try {
        await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 });
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("========== Caught Error ===========");
            console.log(e);
            throw e;
        } else {
            throw e;
        }
    }
    console.log("Done Fetching");
    await page.waitForSelector(SELECTORS.resultList);
    // Let the fetched results be loaded into DOM
    await sleep();

    // Expose necessary data to the browser context
    await page.exposeFunction("getWindowData", () => {
        return {
            SELECTORS,
            OBSERVER_DELAY,
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

    // Store the reference to the results section
    const resultsListHandle = await page.$(SELECTORS.resultList);
    await startCatchSearchRequest(page);
    for (let i = 0; i < MAX_SCROLLS; i++) {
        const shouldBreak = await scrollResultsList(page, resultsListHandle);
        if (searchReqDef) {
            await searchReqDef;
            searchReqDef = null;
        }
        await sleep(RESULTS_SCROLL_DELAY);
        if (shouldBreak) {
            break;
        }
    }
    await endCatchSearchRequest(page);
    console.log("Closed Interceptor");

    const resultItemHandles = await resultsListHandle.$$(SELECTORS.resultItem);
    if (resultItemHandles.length == 0) {
        return Promise.reject();
    }
    console.log("Length Of results:", resultItemHandles.length);

    // Finding the length of infoDisplayBoxes
    await resultItemHandles[0].click();
    await page.waitForSelector(SELECTORS.title);
    await page.evaluate(async () => {
        const infoBoxes = document.querySelectorAll(SELECTORS.infoDisplayBox);
        if (infoBoxes.length === 0) {
            return Promise.reject();
        }
        const infoBoxIndex = infoBoxes.length === 1 ? 0 : 1;
        window.infoBoxIndex = infoBoxIndex;
    });

    const results = [];
    for (const resultItemHandle of resultItemHandles) {
        const res = await resultItemHandle.evaluate(async (item) => {
            let el;
            for (let i = 0; i < 3; i++) {
                try {
                    item.click();
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    if (DEV_MODE) {
                        item.scrollIntoView({ block: "center" });
                    }
                    el = await waitForEl(SELECTORS.title, { text: item.ariaLabel, delay: 10000 });
                } catch (error) {
                    if (!(error instanceof ElNotFoundError)) {
                        throw error;
                    }
                }
            }
            if (!el) {
                return;
            }
            const res = { url: item.getAttribute("href") };
            console.log(infoBoxIndex);
            const infoBox = document.querySelectorAll(SELECTORS.infoDisplayBox)[infoBoxIndex];
            const titleEl = infoBox.querySelector(SELECTORS.title);
            res.title = titleEl && titleEl.textContent.trim().sanitize();
            const ratingSiblingEl = infoBox.querySelector(SELECTORS.ratingSibling);
            let ratingEl;
            let prevEl;
            if (ratingSiblingEl) {
                for (const el of ratingSiblingEl.parentElement.children) {
                    if (ratingSiblingEl === el) {
                        ratingEl = prevEl;
                        break;
                    }
                    prevEl = el;
                }
            }
            res.rating = ratingEl && ratingEl.textContent.sanitize();
            const reviewScoreEl = infoBox.querySelector(SELECTORS.reviews);
            res.reviewScore = reviewScoreEl && reviewScoreEl.textContent.sanitize();
            const categoryEl = infoBox.querySelector(SELECTORS.category);
            res.category = categoryEl && categoryEl.textContent.sanitize();
            const addressEl = infoBox.querySelector(SELECTORS.address);
            res.address = addressEl && addressEl.textContent.sanitize();
            const websiteEl = infoBox.querySelector(SELECTORS.website);
            res.website = websiteEl && websiteEl.textContent.sanitize();
            const phoneEl = infoBox.querySelector(SELECTORS.phone);
            res.phone = phoneEl && phoneEl.textContent.sanitize();
            const openingHoursBtn = infoBox.querySelector(SELECTORS.openHoursButton);
            if (openingHoursBtn) {
                let openingHoursTable = undefined;
                try {
                    openingHoursTable = await waitForEl(SELECTORS.openHoursTable);
                } catch (error) {
                    if (!(error instanceof ElNotFoundError)) {
                        throw error;
                    }
                    openingHoursTable = undefined;
                }
                if (openingHoursTable) {
                    const openingHoursRows = Array.from(
                        openingHoursTable.querySelectorAll("tbody tr"),
                    );
                    const data = {};
                    for (const row of openingHoursRows) {
                        const tdEls = row.querySelectorAll("td");
                        if (tdEls[0] && tdEls[1]) {
                            data[tdEls[0].textContent.sanitize()] = tdEls[1].textContent.sanitize();
                        } else {
                            data[""] = "";
                        }
                    }
                    res.openingHoursData = data;
                }
            }
            console.log("Done");
            return res;
        });
        if (res) {
            results.push(res);
        }
        await sleep(ITEM_SWITCH_DELAY);
    }

    console.log("Final Results: ", results.length);
    browser.close();
    try {
        createExcel(results);
    } catch (error) {
        console.log("======== Failed To create Excel =========");
        console.log(error);
    }
    try {
        createCSV(results);
    } catch (error) {
        console.log("======== Failed To create CSV =========");
        console.log(error);
    }
}

const url = "https://www.google.com/maps";
scrapUrl(url).catch((error) => {
    console.log("=================== Caught Error ==============");
    console.log(error);
    browser.close();
});
