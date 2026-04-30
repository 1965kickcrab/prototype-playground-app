import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  
  await page.goto('file:///' + 'C:/Users/kebi/Downloads/Schedule_Daycare_App_20260417/src/pages/settings/center-settings-form.html'.replace(/\\/g, '/'));
  
  // Wait a bit to let JS render
  await new Promise(r => setTimeout(r, 1000));
  
  const formHtml = await page.evaluate(() => {
    return document.querySelector('[data-center-settings-form]')?.innerHTML;
  });
  console.log('FORM CONTENT LENGTH:', formHtml ? formHtml.length : 'null/empty');
  
  await browser.close();
})();
