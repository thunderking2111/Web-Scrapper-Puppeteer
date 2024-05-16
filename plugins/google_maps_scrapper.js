const { waitForEl, scrollResultsList } = require("../misc/dom_helpers");
const setupPageContext = require("../misc/setup_page_context");
const getUserInput = require("../misc/user_input_helper");
const { sleep, CONSTANTS, ElNotFoundError } = require("../misc/utils");

const URL = "https://www.google.com/maps";

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

/**
 * @param {import("puppeteer").Browser} browser
 */
async function scrapGoogleMaps(browser) {
    const page = await browser.newPage();
    await page.goto(URL, { timeout: 60000 });
    await page.waitForSelector(SELECTORS.searchBoxInput);
    const keyword = await getUserInput("Enter keyword to search");
    const location = await getUserInput("Enter location to search at");
    await page.type(SELECTORS.searchBoxInput, `${keyword} in ${location}`);
    await page.click(SELECTORS.searchButton);
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector(SELECTORS.resultList);
    await sleep();

    await setupPageContext(page, SELECTORS);

    // Store the reference to the results section
    const resultsListHandle = await page.$(SELECTORS.resultList);
    await scrollResultsList(page, resultsListHandle, "end of the list");
    const resultItemHandles = await resultsListHandle.$$(SELECTORS.resultItem);
    if (resultItemHandles.length == 0) {
        return Promise.reject("Nothing to scrap");
    }
    console.log("Length Of results:", resultItemHandles.length);

    // Finding the length of infoDisplayBoxes
    try {
        await resultItemHandles[0].click();
        await page.waitForSelector(SELECTORS.title, { timeout: 10000 });
    } catch {
        await resultItemHandles[0].click();
        await page.waitForSelector(SELECTORS.title, { timeout: 10000 });
    }
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
                    // item.scrollIntoView({ block: "center" });
                    el = await waitForEl(SELECTORS.title, { text: item.ariaLabel });
                    if (el) {
                        break;
                    }
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
            return res;
        });
        if (res) {
            results.push(res);
        }
        await sleep(CONSTANTS.ITEM_SWITCH_DELAY);
    }
    return results;
}

module.exports = scrapGoogleMaps;
