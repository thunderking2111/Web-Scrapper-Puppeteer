const { ElNotFoundError, CONSTANTS, sleep } = require("./utils");

let searchReqDef = null;

/**
 * @param {import("puppeteer").Page} page
 * @param {String} interCeptReqUrl
 */
async function startCatchSearchRequest(page, interCeptReqUrl) {
    await page.setRequestInterception(true);
    page.on("request", (caughtReq) => {
        if (caughtReq.url().includes(interCeptReqUrl)) {
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
 * @param {import("puppeteer").Page} page
 */
async function endCatchSearchRequest(page) {
    page.off("request");
    await page.setRequestInterception(false);
}

/**
 * @param {import("puppeteer").Page} page
 * @param {import("puppeteer").ElementHandle} resultsListHandle
 * @param {String} lastContent
 * @param {Boolean} isLastContentSelector
 * @param {Boolean|String} interCeptReqUrl
 */
async function scrollResultsList(
    page,
    resultsListHandle,
    lastContent,
    isLastContentSelector = false,
    interCeptReqUrl = false,
) {
    if (interCeptReqUrl) {
        await startCatchSearchRequest(page, interCeptReqUrl);
    }
    const scroll = () =>
        resultsListHandle.evaluate(
            async (resultsSection, isLastContentSelector, lastContent) => {
                resultsSection.scrollTop = resultsSection.scrollHeight;
                if (
                    isLastContentSelector
                        ? Boolean(resultsSection.querySelector(lastContent))
                        : resultsSection.lastChild &&
                          resultsSection.lastChild.textContent &&
                          resultsSection.lastChild.textContent.includes(lastContent)
                ) {
                    return true;
                }
            },
            isLastContentSelector,
            lastContent,
        );
    for (let i = 0; i < CONSTANTS.MAX_SCROLLS; i++) {
        const shouldBreak = await scroll();
        if (searchReqDef) {
            await searchReqDef;
            searchReqDef = null;
        }
        await sleep(CONSTANTS.RESULTS_SCROLL_DELAY);
        if (shouldBreak) {
            break;
        }
    }
    if (interCeptReqUrl) {
        await endCatchSearchRequest(page);
    }
}

function waitForEl(selector, options = {}) {
    const { delay = CONSTANTS.OBSERVER_DELAY } = options;
    function checkEl() {
        let el = document.querySelector(selector);
        if (el && options.getTextNode) {
            el = options.getTextNode(el);
        }
        if (
            el &&
            (!options.text ||
                el.textContent.includes(options.text) ||
                options.text.includes(el.textContent)) &&
            (!options.value || el.value.includes(options.value))
        ) {
            return el;
        }
    }
    return new Promise((resolve, reject) => {
        const el = checkEl();
        if (el) {
            resolve(el);
            return;
        }
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
                const foundEl = checkEl();
                if (mutation.type === "childList" && foundEl) {
                    observer.disconnect(); // Stop observing
                    resolve(foundEl);
                    return;
                }
            });
        });

        setTimeout(() => {
            observer.disconnect(); // Stop observing on timeout
            const el = checkEl();
            if (el) {
                resolve(el);
                return;
            }
            reject(new ElNotFoundError(selector));
        }, delay);

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

module.exports = {
    scrollResultsList,
    waitForEl,
};
