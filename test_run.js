const puppeteer = require('puppeteer');
const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    
    await page.goto('file:///C:/Users/junki/test-ts/index.html', { waitUntil: 'networkidle2' });
    
    try {
        await page.waitForSelector('#start-screen', { timeout: 5000 });
        console.log('Clicking start screen...');
        await page.click('#start-screen');
        await delay(2000);
        
        console.log('Taking screenshot of song select...');
        await page.screenshot({ path: 'screenshot_select.png' });
        
        // Find difficulty buttons
        const diffBtns = await page.$$('.difficulty-button'); // check magusic.js for class
        if (diffBtns.length > 0) {
            console.log(`Found ${diffBtns.length} difficulty buttons. Clicking first...`);
            await diffBtns[0].click();
            await delay(3000);
            console.log('Taking screenshot of gameplay...');
            await page.screenshot({ path: 'screenshot_gameplay.png' });
        } else {
            console.log('Could not find difficulty buttons.');
            // Let's dump the DOM of song select
            const html = await page.evaluate(() => document.body.innerHTML);
            const fs = require('fs');
            fs.writeFileSync('dom_dump.html', html);
        }
    } catch (e) {
        console.log('Script error:', e);
    }
    
    await browser.close();
})();
