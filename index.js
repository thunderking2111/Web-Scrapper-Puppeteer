const puppeteer = require("puppeteer");

const DEV_MODE = true;
const RESULTS_SCROLL_DELAY = 2000;
const OBSERVER_DELAY = 5000;
const MAX_SCROLLS = 120;

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

class ElNotFoundError extends Error {
    constructor(selector) {
        super(`Timeout waiting for: ${selector}`);
        this.name = this.constructor.name;
        this.selector = selector;
        Error.captureStackTrace(this, this.constructor);
    }
}

const sleep = (delay = 1000) => new Promise((resolve) => setTimeout(resolve, delay));

function waitForEl(selector, delay = OBSERVER_DELAY) {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
                const foundEl = document.querySelector(selector);
                if (mutation.type === "childList" && foundEl) {
                    observer.disconnect(); // Stop observing
                    resolve(foundEl);
                }
            });
        });

        setTimeout(() => {
            observer.disconnect(); // Stop observing on timeout
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
            resultsSection.lastChild &&
            resultsSection.lastChild.textContent &&
            resultsSection.lastChild.textContent.includes("end of the list")
        ) {
            return true;
        }
    });
}

async function scrapUrl(url) {
    const browser = await puppeteer.launch({
        headless: !DEV_MODE,
        defaultViewport: { width: 1280, height: 600 },
    });
    const page = await browser.newPage();
    console.log("Browser");
    try {
        await page.goto(url, { timeout: 60000 });
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("Stopped at loading url");
        } else {
            throw e;
        }
        return;
    }
    console.log("URL");
    await page.waitForSelector(SELECTORS.searchBoxInput);
    await page.type(SELECTORS.searchBoxInput, "hotels in new york");
    await page.click(SELECTORS.searchButton);
    try {
        await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 });
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("========== Caught Error ===========");
            console.log(e);
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
    });

    // Store the reference to the results section
    const resultsListHandle = await page.$(SELECTORS.resultList);
    for (let i = 0; i < MAX_SCROLLS; i++) {
        const shouldBreak = await scrollResultsList(page, resultsListHandle);
        if (shouldBreak) {
            break;
        }
        await sleep(RESULTS_SCROLL_DELAY);
    }

    const somedata = await resultsListHandle.evaluate(async (resultsList) => {
        const resultItems = resultsList.querySelectorAll(SELECTORS.resultItem);
        await sleep(1000);
        const results = [];
        if (resultItems.length > 0) {
            console.log("Clicked On first El");
            resultItems[0].click();
            try {
                await waitForEl(SELECTORS.title);
                console.log("completed Await Waitfor");
            } catch (error) {
                console.log("inside the ");
                if (!(error instanceof ElNotFoundError)) {
                    throw error;
                }
            }
            const infoBoxIndex =
                document.querySelectorAll(SELECTORS.infoDisplayBox).length === 1 ? 0 : 1;
            for (const item of resultItems) {
                const res = {};
                console.log("Clicked On Item 1");
                item.click();
                try {
                    await waitForEl(SELECTORS.title);
                    console.log("completed Await Waitfor");
                } catch (error) {
                    console.log("inside the ");
                    if (!(error instanceof ElNotFoundError)) {
                        throw error;
                    }
                }
                const infoBox = document.querySelectorAll(SELECTORS.infoDisplayBox)[infoBoxIndex];
                const titleEl = infoBox.querySelector(SELECTORS.title);
                res.title = titleEl && titleEl.textContent;
                const ratingSiblingEl = infoBox.querySelector(SELECTORS.ratingSibling);
                let ratingEl;
                let prevEl;
                for (const el of ratingSiblingEl.parentElement.children) {
                    if (ratingSiblingEl === el) {
                        ratingEl = prevEl;
                        break;
                    }
                    prevEl = el;
                }
                res.rating = ratingEl && ratingEl.textContent;
                const reviewScoreEl = infoBox.querySelector(SELECTORS.reviews).textContent;
                res.reviewScore = reviewScoreEl && reviewScoreEl.textContent;
                const categoryEl = infoBox.querySelector(SELECTORS.category);
                res.category = categoryEl && categoryEl.textContent;
                const addressEl = infoBox.querySelector(SELECTORS.address);
                res.address = addressEl && addressEl.textContent;
                const websiteEl = infoBox.querySelector(SELECTORS.website);
                res.website = websiteEl && websiteEl.textContent;
                const phoneEl = infoBox.querySelector(SELECTORS.phone);
                res.phone = phoneEl && phoneEl.textContent;
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
                        res.openingHoursData = Array.from(
                            openingHoursTable.querySelectorAll("tbody tr"),
                        ).map((tr) => {
                            const tdEls = tr.querySelectorAll("td");
                            const data = {};
                            data[tdEls[0].textContent] = tdEls[1].textContent;
                            return data;
                        });
                    }
                }
                results.push(res);
            }
        }
        return results;
    }, SELECTORS);
    console.log(somedata);
}

const url = "https://www.google.com/maps";
scrapUrl(url);
