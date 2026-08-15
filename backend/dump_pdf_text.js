const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

// Pass your PDF path as an argument when running this script
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.log("Usage: node dump_pdf_text.js \"C:\\path\\to\\your\\file.pdf\"");
  process.exit(1);
}

async function run() {
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  const outPath = path.join(__dirname, "extracted_text.txt");
  fs.writeFileSync(outPath, data.text);
  console.log(`Extracted ${data.text.length} characters.`);
  console.log(`Saved to: ${outPath}`);
  console.log(`Contains "MA401BS": ${data.text.includes("MA401BS")}`);
  console.log(`Contains "Mathematical and Statistical": ${data.text.includes("Mathematical and Statistical")}`);
}

run();