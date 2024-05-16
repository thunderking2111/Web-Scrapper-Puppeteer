const puppeteer = require("puppeteer");
const { createExcel } = require("./misc/excel_helper");
const { createCSV } = require("./misc/csv_helper");
const { CONSTANTS } = require("./misc/utils");
const scrapGoogleMaps = require("./plugins/google_maps_scrapper");
const scrapBingMaps = require("./plugins/bing_maps_scrapper");

const DEV_MODE = true;

let browser = null;

async function start() {
    browser = await puppeteer.launch({
        headless: !DEV_MODE,
        defaultViewport: { width: CONSTANTS.BROWSER_WIDTH, height: CONSTANTS.BROWSER_HEIGHT },
    });
    // const results = await scrapGoogleMaps(browser);
    const results = await scrapBingMaps(browser);

    console.log("Final Results: ", results.length);
    browser.close();
    try {
        createExcel(results);
    } catch (error) {
        console.log("======== Failed To create Excel =========");
        console.log(error);
    }
    // try {
    //     createCSV(results);
    // } catch (error) {
    //     console.log("======== Failed To create CSV =========");
    //     console.log(error);
    // }
}

start().catch((error) => {
    console.log("=================== Caught Error ==============");
    console.log(error);
    browser.close();
});
