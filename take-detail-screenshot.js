import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate directly to a model detail page
  await page.goto('http://localhost:5173/usedevpricetracker/?model=Tesla%20Model%203', { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Find the detail chart element and screenshot it
  const chartElement = await page.$('.detail-chart');
  if (chartElement) {
    await chartElement.screenshot({ path: '/tmp/detail-chart.png' });
    console.log('Detail chart screenshot saved to /tmp/detail-chart.png');
  } else {
    console.log('Detail chart element not found');
  }

  await browser.close();
})();
