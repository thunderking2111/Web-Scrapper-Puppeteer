const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const path = require("path");

function createCSV(data) {
    const outputPath = path.join(__dirname, "..", "reports");
    const outputFilename = path.join(outputPath, "output.csv");
    // Create the reports folder if it doesn't exist
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    const csvWriter = createCsvWriter({
        path: outputFilename,
        header: [
            { id: "url", title: "URL" },
            { id: "title", title: "Title" },
            { id: "rating", title: "Rating" },
            { id: "reviewScore", title: "Review Score" },
            { id: "category", title: "Category" },
            { id: "address", title: "Address" },
            { id: "website", title: "Website" },
            { id: "phone", title: "Phone" },
            { id: "Monday", title: "Monday" },
            { id: "Tuesday", title: "Tuesday" },
            { id: "Wednesday", title: "Wednesday" },
            { id: "Thursday", title: "Thursday" },
            { id: "Friday", title: "Friday" },
            { id: "Saturday", title: "Saturday" },
            { id: "Sunday", title: "Sunday" },
        ],
    });

    const csvData = data.map((item) => {
        item.openingHoursData = item.openingHoursData || {};
        return {
            url: item.url,
            title: item.title,
            rating: item.rating,
            reviewScore: item.reviewScore,
            category: item.category,
            address: item.address,
            website: item.website,
            phone: item.phone,
            Monday: item.openingHoursData.Monday,
            Tuesday: item.openingHoursData.Tuesday,
            Wednesday: item.openingHoursData.Wednesday,
            Thursday: item.openingHoursData.Thursday,
            Friday: item.openingHoursData.Friday,
            Saturday: item.openingHoursData.Saturday,
            Sunday: item.openingHoursData.Sunday,
        };
    });

    csvWriter
        .writeRecords(csvData)
        .then(() => {
            console.log("CSV file saved as output.csv");
        })
        .catch((error) => {
            console.error("Error saving CSV file:", error);
        });
}

module.exports = { createCSV };
