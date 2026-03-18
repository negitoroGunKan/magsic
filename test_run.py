from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import json

options = Options()
options.add_argument('--headless=new')
try:
    driver = webdriver.Chrome(options=options)
    driver.get('http://localhost:8000/editor2.html')
    time.sleep(2)
    logs = driver.get_log('browser')
    print('Logs:')
    for log in logs:
        print(log)
    status_text = driver.execute_script('return document.getElementById("status") ? document.getElementById("status").innerText : "Not found"')
    print('Status:', status_text)
    driver.quit()
    print('Done.')
except Exception as e:
    print('Error:', e)
