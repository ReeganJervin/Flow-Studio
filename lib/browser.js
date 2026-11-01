// A hidden browser for drawing the bubbles and making the soundtrack: the Chrome installed on this computer when
// there is one (Playwright's own browser often can't be downloaded), otherwise Playwright's.
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME_PATHS = [
  process.env.KITSU_FLOW_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

async function launchHidden() {
  const chrome = CHROME_PATHS.find(p => fs.existsSync(p));
  if (chrome) return chromium.launch({ executablePath: chrome, headless: true });
  try { return await chromium.launch(); } catch (e) {
    throw new Error(`No browser to draw with: install Google Chrome (or run  npx playwright install chromium ). ${e.message.split('\n')[0]}`);
  }
}

module.exports = { launchHidden, CHROME_PATHS };
