const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

// Function to create Excel file
function createExcel(data) {
    // Create a workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data");

    // Define header row style
    const headerRowStyle = {
        font: { bold: true },
    };

    // Add header row
    worksheet
        .addRow([
            "URL",
            "Title",
            "Rating",
            "Review Score",
            "Category",
            "Address",
            "Website",
            "Phone",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ])
        .eachCell((cell) => {
            cell.style = headerRowStyle;
        });

    // Add data rows
    data.forEach((item) => {
        const {
            url,
            title,
            rating,
            reviewScore,
            category,
            address,
            website,
            phone,
            openingHoursData = {},
        } = item;
        worksheet.addRow([
            url,
            title,
            rating,
            reviewScore,
            category,
            address,
            website,
            phone,
            openingHoursData.Monday,
            openingHoursData.Tuesday,
            openingHoursData.Wednesday,
            openingHoursData.Thursday,
            openingHoursData.Friday,
            openingHoursData.Saturday,
            openingHoursData.Sunday,
        ]);
    });

    // Freeze the header row
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const outputPath = path.join(__dirname, "..", "reports");
    const outputFilename = path.join(outputPath, "output.xlsx");
    // Create the reports folder if it doesn't exist
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    workbook.xlsx
        .writeFile(outputFilename)
        .then(() => {
            console.log(`Excel file saved as ${outputFilename}`);
        })
        .catch((error) => {
            console.error("Error saving Excel file:", error);
        });
}

module.exports = { createExcel };
