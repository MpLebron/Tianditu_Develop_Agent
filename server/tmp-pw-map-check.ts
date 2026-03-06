import { chromium } from 'playwright-core'

async function main(){
  const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
  const page = await browser.newPage({viewport:{width:1200,height:630}})
  page.on('console',msg=>console.log('[console]',msg.type(),msg.text()))
  page.on('pageerror',err=>console.log('[pageerror]',err.message))
  await page.goto('http://127.0.0.1:3000/share-assets/mmc4tpck-e4f34ba86a/index.html',{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(8000)
  await page.screenshot({path:'../tmp-pw-map-check.png'})
  await browser.close()
  console.log('saved')
}
main().catch(e=>{console.error(e);process.exit(1)})
