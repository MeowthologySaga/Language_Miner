const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

async function main() {
  const [, , htmlPathArg, pdfPathArg] = process.argv;
  if (!htmlPathArg || !pdfPathArg) {
    throw new Error("Usage: electron scripts/print-html-to-pdf.cjs <htmlPath> <pdfPath>");
  }

  const htmlPath = path.resolve(htmlPathArg);
  const pdfPath = path.resolve(pdfPathArg);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML not found: ${htmlPath}`);
  }

  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await window.loadFile(htmlPath);
    const pdfBuffer = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: {
        marginType: "custom",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, pdfBuffer);
  } finally {
    window.destroy();
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
