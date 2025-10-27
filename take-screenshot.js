import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173/usedevpricetracker/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: '/tmp/usedev-screenshot.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved to /tmp/usedev-screenshot.png');
})();
