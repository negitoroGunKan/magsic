const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

(async function example() {
  let options = new chrome.Options();
  options.addArguments('headless');
  let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  try {
    await driver.get('http://localhost:8000/editor2.html');
    await driver.sleep(2000);
    let logs = await driver.manage().logs().get('browser');
    console.log('Logs:');
    logs.forEach(log => console.log([%s] %s, log.level.name, log.message));

    // check if loaded
    let loaded = await driver.executeScript("return document.getElementById('status').innerText");
    console.log('Status:', loaded);
    
  } catch (e) {
    console.error(e);
  } finally {
    await driver.quit();
  }
})();
