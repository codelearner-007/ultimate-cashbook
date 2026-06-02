const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 1284, height: 2778, deviceScaleFactor: 1 });

  const htmlPath = path.resolve(__dirname, 'splash_source.html');
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

  await new Promise(r => setTimeout(r, 1500));

  const outPath = path.resolve(__dirname, 'splash.png');
  await page.screenshot({ path: outPath, fullPage: false, type: 'png' });

  await browser.close();
  console.log('Splash saved to:', outPath);
})();
