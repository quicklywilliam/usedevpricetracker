import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173/usedevpricetracker/', { waitUntil: 'networkidle0' });

  // Find the chart element and screenshot just that area
  const chartElement = await page.$('.overview-chart');
  if (chartElement) {
    await chartElement.screenshot({ path: '/tmp/chart-only.png' });
    console.log('Chart screenshot saved to /tmp/chart-only.png');
  } else {
    console.log('Chart element not found');
  }

  await browser.close();
})();
