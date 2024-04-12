const puppeteer = require("puppeteer");

const DEV_MODE = true;
const RESULTS_SCROLL_DELAY = 1000;
const OBSERVER_DELAY = 5000;
const MAX_SCROLLS = 500;

const SELECTORS = {
    searchBoxInput: "input#searchboxinput",
    searchButton: "button#searchbox-searchbutton",
    restltList: "div[role='feed']",
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

function waitForEl(selector) {
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
        }, OBSERVER_DELAY);

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

async function scrollResultsList(page, resultsListHandle) {
    await resultsListHandle.evaluate((resultsSection) => {
        if (resultsSection) {
            resultsSection.scrollTop = resultsSection.scrollHeight;
        }
    });
    await sleep(RESULTS_SCROLL_DELAY); // Adjust delay as needed
}

async function scrapUrl(url) {
    const browser = await puppeteer.launch({
        headless: !DEV_MODE,
        defaultViewport: { width: 1280, height: 600 },
    });
    const page = await browser.newPage();
    console.log("Browser");
    // await new Promise((resolve) => setTimeout(() => resolve()), 10000);
    try {
        await page.goto(url);
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("========== Caught Error ===========");
            console.log(e);
        } else {
            throw e;
        }
    }
    console.log("URL");
    await page.type(SELECTORS.searchBoxInput, "hotels in new york");
    await page.click(SELECTORS.searchButton);
    try {
        await page.waitForNavigation({ waitUntil: "networkidle0" });
    } catch (e) {
        if (e instanceof puppeteer.TimeoutError) {
            console.log("========== Caught Error ===========");
            console.log(e);
        } else {
            throw e;
        }
    }
    console.log("Done Fetching");
    // 1 second delay so that all the loading could be finished
    await sleep(0);

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
    const resultsListHandle = await page.$(SELECTORS.restltList);
    let previousHeight = 0;
    for (let i = 0; i < MAX_SCROLLS; i++) {
        await scrollResultsList(page, resultsListHandle);
        const newHeight = await resultsListHandle.evaluate((resultsList) => {
            return resultsList ? resultsList.scrollHeight : 0;
        });
        if (newHeight === previousHeight) {
            break; // No more results loaded
        }
        previousHeight = newHeight;
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
                res.title = infoBox.querySelector(SELECTORS.title).textContent;
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
                res.rating = ratingEl.textContent;
                res.reviewScore = infoBox.querySelector(SELECTORS.reviews).textContent;
                res.category = infoBox.querySelector(SELECTORS.category).textContent;
                res.address = infoBox.querySelector(SELECTORS.address).textContent;
                res.website = infoBox.querySelector(SELECTORS.website).textContent;
                res.phone = infoBox.querySelector(SELECTORS.phone).textContent;
                const openingHoursBtn = infoBox.querySelector(SELECTORS.openHoursButton);
                if (openingHoursBtn) {
                    try {
                        await waitForEl(SELECTORS.openHoursTable);
                    } catch (error) {
                        if (!(error instanceof ElNotFoundError)) {
                            throw error;
                        }
                    }
                    const openingHoursTable = infoBox.querySelector(SELECTORS.openHoursTable);
                    res.openingHoursData = Array.from(
                        openingHoursTable.querySelectorAll("tbody tr"),
                    ).map((tr) => {
                        const tdEls = tr.querySelectorAll("td");
                        const data = {};
                        data[tdEls[0].textContent] = tdEls[1].textContent;
                        return data;
                    });
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
