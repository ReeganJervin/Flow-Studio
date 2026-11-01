// Drives Google Flow (flow.google.com) in a real Chrome window, one window per Google account, by clicking Flow's own
// buttons. Only what Flow Studio needs: sign-in state and credits, one image or one video (from a start and an end
// frame) at a time, and downloading the result.
//
// Adapted from flow-mcp by GTAI-1 (https://github.com/GTAI-1/flow-mcp, ISC licence; see flow/NOTICE.md): its Chrome
// launcher and its generation steps, which carry what its author learned about Flow's page. Changes here: CommonJS,
// one Chrome per account, no job queue or MCP, and the price is read only from the link that shows a number of
// credits (Flow's "Add AI credits" banner also ends in "credits" and broke the original, 2026-10-31).
//
// Flow's buttons are found by their English names, so Flow is always opened in English (?hl=en).
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { chromium } = require('playwright');

const FLOW_URL = 'https://flow.google.com/';
const FLOW_HOSTS = /^https:\/\/(flow\.google\.com|labs\.google\/fx)/;
const IMAGE_TIMEOUT_MS = 3 * 60000, VIDEO_TIMEOUT_MS = 12 * 60000;
const inEnglish = url => { const u = new URL(url); u.searchParams.set('hl', 'en'); return u.toString(); };
const pause = (page, ms) => page.waitForTimeout(ms);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHROME_PATHS = [
  process.env.KITSU_FLOW_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

// One Google account: its own Chrome profile (so it stays signed in) and its own remote-control port.
class FlowAccount {
  constructor({ n, name, home, cdp }) {
    Object.assign(this, { n, name, home, cdp });
    this.profile = path.join(home, 'chrome-profile');
    this.downloads = path.join(home, 'downloads');
    this.browser = null; this.lastStart = 0;
  }

  // ---------- Chrome ----------
  async cdpUp() {
    try { return (await fetch(`http://127.0.0.1:${this.cdp}/json/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch (_) { return false; }
  }
  async launch() {
    const exe = CHROME_PATHS.find(p => fs.existsSync(p));
    if (!exe) throw new Error('Google Chrome was not found. Install Chrome, or set KITSU_FLOW_CHROME to chrome.exe.');
    fs.mkdirSync(this.profile, { recursive: true });
    spawn(exe, [`--user-data-dir=${this.profile}`, `--remote-debugging-port=${this.cdp}`, '--no-first-run', '--no-default-browser-check', inEnglish(FLOW_URL)], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) { if (await this.cdpUp()) return; await sleep(500); }
    throw new Error(`Chrome started for ${this.name} but its remote-control port ${this.cdp} never opened.`);
  }
  async page() {
    if (!this.browser || !this.browser.isConnected()) {
      if (!(await this.cdpUp())) await this.launch();
      this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.cdp}`);
    }
    const ctx = this.browser.contexts()[0];
    if (!ctx) throw new Error(`${this.name}'s Chrome window has no tabs open. Close it and run the command again.`);
    let page = ctx.pages().find(p => FLOW_HOSTS.test(p.url()));
    if (!page) { page = await ctx.newPage(); await page.goto(inEnglish(FLOW_URL), { waitUntil: 'domcontentloaded' }); }
    await ensureEnglish(page);
    return page;
  }
  // leaves Chrome open (it keeps the sign-in), only lets go of it
  async close() { if (this.browser) await this.browser.close().catch(() => {}); this.browser = null; }

  // ---------- state ----------
  async state(detailed = true) {
    const page = await this.page(), url = page.url();
    const signedIn = !/\/about|accounts\.google\.com/.test(url), inProject = /\/project\//.test(url);
    const s = { signedIn, inProject, ok: signedIn && inProject, credits: null };
    if (!signedIn) s.hint = 'Not signed in. Run  flow-video login ' + this.n + '  and sign in to Google in that Chrome window.';
    else if (!inProject) s.hint = 'Signed in, but no Flow project is open. Open or create a project in that Chrome window.';
    else if (detailed) {
      s.plan = await page.getByRole('button', { name: 'Account details' }).innerText().then(t => t.trim().split('\n')[0], () => undefined);
      s.credits = await readCredits(page).catch(() => null);
    }
    return s;
  }

  // ---------- one generation ----------
  // scene: { type: 'image'|'video', prompt, aspect_ratio, model?, duration?, resolution?, max_credits, first_frame?,
  // last_frame?, reference_images? (paths or 'asset:<name>'), download_quality? }. Saves the result as <stem>.<ext>.
  // The result is renamed in Flow to "<name>-<tag>" (unique), so later clips can pick it there as 'asset:<title>'.
  // Returns { files, credits, title } (title: null if the rename didn't work). Flow is driven at a person's pace: 25
  // to 70 s between two generations.
  async generate(scene, stem, onProgress = () => {}, name = path.basename(stem)) {
    const gap = 25000 + Math.random() * 45000, wait = this.lastStart + gap - Date.now();
    if (this.lastStart && wait > 0) { onProgress(`waiting ${Math.round(wait / 1000)} s before the next one, like a person would`); await sleep(wait); }
    const state = await this.state(false);
    if (!state.ok) throw new Error(state.hint);
    const page = await this.page();
    const tag = Date.now().toString(36);
    await ensureProjectGrid(page);
    const agent = page.getByRole('button', { name: 'Agent', exact: true });
    if ((await agent.getAttribute('aria-pressed').catch(() => null)) === 'true') await agent.click();
    const clear = page.getByRole('button', { name: 'Clear prompt' });
    if (await clear.isVisible().catch(() => false)) await clear.click();

    const credits = await applySettings(page, scene);
    if (credits > scene.max_credits) throw new Error(`Flow asks ${credits} credits for this, more than "max credits: ${scene.max_credits}". Nothing was made or spent.`);

    if (scene.first_frame) await attachAsset(page, page.getByRole('button', { name: 'Start', exact: true }), await uploadAsset(page, scene.first_frame, `kf-${tag}-start`));
    if (scene.last_frame) await attachAsset(page, page.getByRole('button', { name: 'End', exact: true }), await uploadAsset(page, scene.last_frame, `kf-${tag}-end`));
    // Flow takes frames OR references on a video, never both (the frames already hold the look)
    const refs = scene.type === 'video' && (scene.first_frame || scene.last_frame) ? [] : scene.reference_images || [];
    for (const [i, ref] of refs.entries()) await attachAsset(page, page.getByRole('button', { name: 'Add ingredients to the prompt box' }), await uploadAsset(page, ref, `kf-${tag}-ref${i + 1}`));
    if (refs.length) {
      const attached = await page.getByRole('button', { name: 'Ingredient' }).count();
      if (attached < refs.length) throw new Error(`Only ${attached} of ${refs.length} references could be attached in Flow; nothing was made.`);
    }
    await typePrompt(page, scene.prompt);
    const start = page.getByRole('button', { name: 'Start generation' });
    if (!(await start.isEnabled())) throw new Error("Flow's Start button is greyed out: it didn't accept the prompt or the frames.");
    await scrollToTop(page);
    const before = await mediaIds(page);
    await start.click();
    this.lastStart = Date.now();
    onProgress('started');

    const [id] = await waitForNewMedia(page, before, scene.type === 'image' ? IMAGE_TIMEOUT_MS : VIDEO_TIMEOUT_MS, scene.type, onProgress);
    // Flow reuses titles, so the finished tile gets our own name before it is downloaded
    const title = `${name}-${tag}`;
    const renamed = await renameTile(page, mediaTile(page, id), title).catch(() => false);
    await pause(page, 800);
    const handle = renamed && id.startsWith('title:') ? `title:${title}` : id;
    onProgress('downloading');
    const files = await downloadMedia(page, handle, stem, scene.download_quality || 'original', this.downloads);
    return { files, credits, title: renamed ? title : null };
  }
}

// ---------- Flow's page ----------
async function ensureEnglish(page) {
  if (!/^https:\/\/flow\.google\.com\//.test(page.url())) return;
  const lang = () => page.evaluate(() => document.documentElement.lang).catch(() => '');
  const now = await lang();
  if (!now || /^en\b/i.test(now)) return;
  await page.goto(inEnglish(page.url()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.lang, null, { timeout: 15000 }).catch(() => {});
  const after = await lang();
  if (after && !/^en\b/i.test(after)) throw new Error(`Flow is showing in "${after}" and would not switch to English. Add ?hl=en to the end of Flow's address in that Chrome window.`);
}
async function leaveSideMenu(page) {
  await page.evaluate(() => { const f = document.activeElement; if (f && f.closest('mat-sidenav')) f.blur(); }).catch(() => {});
}
async function clearBackdrops(page) {
  const showing = page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
  for (let i = 0; i < 4 && (await showing.count().catch(() => 0)); i++) { await showing.last().click({ force: true, timeout: 4000 }).catch(() => {}); await pause(page, 500); }
}
async function dismissOverlays(page) {
  await leaveSideMenu(page);
  await page.keyboard.press('Escape');
  const close = page.getByRole('button', { name: 'Close account panel' });
  if (await close.isVisible().catch(() => false)) await close.click({ timeout: 5000 }).catch(() => {});
  await clearBackdrops(page);
}
async function scrollToTop(page) {
  await page.evaluate(() => document.querySelectorAll('.page-container').forEach(e => { e.scrollTop = 0; }));
  await pause(page, 400);
}
// the balance only shows in the account panel, which also holds "Sign out": nothing else in it is ever touched
async function readCredits(page) {
  await dismissOverlays(page); await scrollToTop(page);
  await page.getByRole('button', { name: 'Account details' }).click({ timeout: 5000 });
  const link = page.getByRole('link', { name: /Google Flow credits/ });
  try {
    await link.waitFor({ state: 'visible', timeout: 5000 });
    const n = Number((await link.innerText()).replace(/[^\d]/g, ''));
    return Number.isNaN(n) ? null : n;
  } finally { await dismissOverlays(page); await pause(page, 300); }
}

// each grid tile is known by its media id, or (videos at rest have none) by its title
const TILE_ID_JS = `(tile) => {
  const media = tile.querySelector("img[data-media-id], video[data-media-id], img[src], video[src]");
  const id = media && (media.getAttribute("data-media-id") || (media.getAttribute("src") || "").match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0]);
  if (id) return id;
  const title = tile.getAttribute("aria-label");
  return title ? "title:" + title : undefined;
}`;
const mediaIds = page => page.evaluate(js => [...document.querySelectorAll('flow-grid-tile-container')].map(eval(js)).filter(Boolean), TILE_ID_JS);
const q = s => s.replace(/"/g, '\\"');
const mediaTile = (page, id) => page.locator(id.startsWith('title:') ? `flow-grid-tile-container[aria-label="${q(id.slice(6))}"]`
  : `flow-grid-tile-container:has([data-media-id="${id}"]), flow-grid-tile-container:has([src*="${id}"])`).first();

// New finished tiles of the right kind: not our own uploads (named kf-...), not still rendering ("NN%", or a video
// with no thumbnail yet)
async function freshMedia(page, before, kind) {
  const tiles = await page.evaluate(js => {
    const idOf = eval(js);
    return [...document.querySelectorAll('flow-grid-tile-container')].map(t => ({
      id: idOf(t), label: t.getAttribute('aria-label') || '',
      kind: t.querySelector('flow-video-tile') ? 'video' : t.querySelector('flow-image-tile') ? 'image' : 'other',
      busy: /\d+%/.test(t.innerText) || (!!t.querySelector('flow-video-tile') && !t.querySelector('img[alt="Generated video thumbnail"], video')),
    }));
  }, TILE_ID_JS);
  return [...new Set(tiles.filter(t => t.id && !before.includes(t.id) && !/^(kf|fm)-/.test(t.label) && !t.busy && (!kind || t.kind === kind)).map(t => t.id))];
}
async function newErrorTiles(page, known) {
  return page.evaluate(([ids, js]) => {
    const seen = new Set(ids), idOf = eval(js); let errors = 0;
    for (const tile of document.querySelectorAll('flow-grid-tile-container')) { const id = idOf(tile); if (id && seen.has(id)) break; if (tile.querySelector('flow-error-tile')) errors++; }
    return errors;
  }, [known, TILE_ID_JS]);
}
async function hoverTile(page, tile, settle = 900) {
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); else await tile.hover();
  await pause(page, settle);
}
// Flow's own Retry on a failed tile makes it again for free
async function retryErrorTile(page) {
  const tile = page.locator('flow-grid-tile-container:has(flow-error-tile)').first();
  await hoverTile(page, tile);
  const retry = tile.getByRole('button', { name: 'Retry' });
  if (!(await retry.isVisible({ timeout: 2000 }).catch(() => false))) return false;
  await retry.click({ timeout: 10000 }); await pause(page, 1500); await scrollToTop(page);
  return true;
}
async function waitForNewMedia(page, before, timeoutMs, kind, onProgress) {
  const deadline = Date.now() + timeoutMs;
  let retries = 1, failures = 0, seen = '', said = '';
  while (Date.now() < deadline) {
    await pause(page, 2000);
    const fresh = await freshMedia(page, before, kind);
    if (fresh.length) {
      // a video's title may still change right after it finishes: take it once it shows the same twice running
      if (!fresh[0].startsWith('title:') || fresh[0] === seen) return fresh.slice(0, 1);
      seen = fresh[0]; continue;
    }
    const progress = await page.evaluate(() => [...document.querySelectorAll('flow-grid-tile-container')].slice(0, 8).map(t => (t.innerText.match(/\d+%/) || [])[0]).filter(Boolean));
    if (progress.length && progress[0] !== said) { said = progress[0]; onProgress(said); }
    const errors = progress.length ? 0 : await newErrorTiles(page, before);
    if (!errors) continue;
    failures += errors;
    if (retries-- > 0 && (await retryErrorTile(page))) { onProgress('Flow failed, trying again (free)'); continue; }
    throw new Error(`Flow couldn't make it (${failures} time(s), "Sorry, this failed to generate"). Nothing was charged. Try again later, or change the words a little.`);
  }
  throw new Error(`Flow took longer than ${Math.round(timeoutMs / 60000)} minutes. If it finishes later, it is in your Flow project.`);
}

// ---------- settings: image or video, frames, aspect, model, length; returns Flow's price ----------
const settingsTrigger = page => page.getByRole('button', { name: 'Settings trigger' });
async function openSettings(page) {
  const probe = page.getByRole('radio', { name: 'Image', exact: true });
  for (let i = 0; i < 3; i++) {
    if (await probe.isVisible().catch(() => false)) return;
    await settingsTrigger(page).click();
    await probe.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
  if (!(await probe.isVisible().catch(() => false))) throw new Error("Couldn't open Flow's settings (image or video, size, model).");
}
// A choice in the settings panel. Closing a menu inside the panel (the model menu) can close the whole panel, so a
// hidden choice reopens it first. An optional choice that Flow doesn't offer is simply left alone.
async function pickRadio(page, name, optional = false) {
  const radio = page.getByRole('radio', { name, exact: typeof name === 'string' }).first();
  if (!(await radio.isVisible().catch(() => false))) {
    await openSettings(page);
    await radio.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  }
  if (!(await radio.isVisible().catch(() => false))) {
    if (optional) return;
    throw new Error(`Flow has no "${name}" choice here.`);
  }
  if (!(await radio.isChecked())) { await radio.click(); await pause(page, 500); }
}
// the newest Nano Banana for images (the highest version that isn't a Lite one), read from Flow's own menu
function newestNanoBanana(names) {
  const version = n => ((/nano banana\s+(\d+(?:\.\d+)*)/i.exec(n) || [])[1] || '').split('.').filter(Boolean).map(Number);
  let best = -1;
  names.forEach((n, i) => {
    const v = version(n); if (!v.length || /\blite\b/i.test(n)) return;
    if (best < 0) { best = i; return; }
    const b = version(names[best]);
    for (let k = 0; k < Math.max(v.length, b.length); k++) { if ((v[k] || 0) !== (b[k] || 0)) { if ((v[k] || 0) > (b[k] || 0)) best = i; break; } }
  });
  return best;
}
async function pickModel(page, model) {
  const button = page.getByRole('button', { name: 'Select model family' }), latest = !model;
  if (!latest && (await button.innerText()).toLowerCase().includes(model.toLowerCase())) return;
  await button.click();
  const items = page.getByRole('menuitem');
  await items.first().waitFor({ state: 'visible', timeout: 5000 });
  const names = (await items.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  const index = latest ? newestNanoBanana(names) : names.findIndex(n => n.toLowerCase().includes(model.toLowerCase()));
  const shown = (await button.innerText()).replace(/\s+/g, ' ');
  if (index < 0 || (latest && shown.includes(names[index]))) {
    await page.keyboard.press('Escape'); await clearBackdrops(page);
    if (index < 0 && !latest) throw new Error(`Flow has no model called "${model}". It has: ${names.join(', ')}`);
    return;
  }
  await items.nth(index).click(); await pause(page, 700);
}
async function applySettings(page, s) {
  await openSettings(page);
  await pickRadio(page, s.type === 'image' ? 'Image' : 'Video');
  if (s.type === 'video') await pickRadio(page, s.first_frame || s.last_frame ? 'Frames' : 'Ingredients');
  if (s.aspect_ratio) await pickRadio(page, s.aspect_ratio);
  if (s.type === 'image') await pickModel(page, s.model && !/^\s*(nano banana( 2)?|latest)?\s*$/i.test(s.model) ? s.model : null);
  else if (s.model) await pickModel(page, s.model);
  if (s.type === 'video' && s.resolution) await pickRadio(page, new RegExp(`^${s.resolution}`));
  if (s.type === 'video' && s.duration) await pickRadio(page, `${s.duration}s`);
  // one result each time (Flow doesn't always offer the choice)
  await pickRadio(page, 'x1', true);
  await openSettings(page);
  await pause(page, 600);
  // the price: only the link that shows a number ("0 credits", "20 credits"), never "Add AI credits"
  const costText = await page.getByRole('link', { name: /^\s*\d[\d,]*\s*credits?\s*$/i }).first().innerText();
  const cost = Number((costText.match(/\d[\d,]*/) || [''])[0].replace(/,/g, '') || NaN);
  await page.keyboard.press('Escape'); await pause(page, 400);
  if (Number.isNaN(cost)) throw new Error(`Couldn't read Flow's price ("${costText}").`);
  return cost;
}

// ---------- frames and references ----------
// a file is uploaded under its own unique name; "asset:<name>" is something already in the Flow project (a character)
async function uploadAsset(page, file, name) {
  if (file.startsWith('asset:')) return file.slice(6).trim();
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kitsu-flow-')), name + path.extname(file).toLowerCase());
  fs.copyFileSync(file, staged);
  await scrollToTop(page);
  await page.getByRole('button', { name: 'Add media menu' }).click();
  const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
  await page.getByRole('menuitem', { name: 'Upload', exact: true }).click();
  await (await chooser).setFiles(staged);
  const label = path.basename(staged);
  await page.locator(`flow-grid-tile-container[aria-label="${q(label)}"]:has([data-media-id])`).first().waitFor({ state: 'attached', timeout: 90000 })
    .catch(() => { throw new Error(`Flow didn't finish taking the picture "${path.basename(file)}" within 90 s.`); });
  await pause(page, 1000);
  return label;
}
const escapeRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const optionByName = (list, name) => list.getByRole('option', { name: new RegExp(`^${escapeRe(name)}`, 'i') }).first();
async function attachAsset(page, opener, assetName) {
  const list = page.getByRole('listbox', { name: 'Asset list' }), all = page.getByRole('tab', { name: 'All', exact: true });
  const shows = (l, ms) => l.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
  let opened = false;
  for (let i = 0; i < 3 && !opened; i++) {
    if (i) { await page.keyboard.press('Escape'); await pause(page, 800); }
    await opener.click();
    opened = await Promise.race([shows(list, 5000), shows(all, 5000)]);
  }
  if (!opened) throw new Error(`Flow's picture picker didn't open while adding "${assetName}". Nothing was made.`);
  if ((await all.isVisible().catch(() => false)) && (await all.getAttribute('aria-selected')) !== 'true') { await all.click(); await pause(page, 1000); }
  await list.waitFor({ state: 'visible', timeout: 10000 });
  // Flow's picker (2026-11-01): "Images" (pictures made in Flow, like the frames) and "Uploads" on the left, a "Search
  // assets" box on top; earlier it had "All", "Characters", "Uploads" and "Avatars" tabs. The name is searched for,
  // then looked for in each of them.
  const search = page.getByPlaceholder(/search assets/i).first();
  if (await search.isVisible().catch(() => false)) { await search.fill(assetName).catch(() => {}); await pause(page, 1500); }
  let option = optionByName(list, assetName);
  if (!(await option.isVisible().catch(() => false))) {
    for (const tab of ['Images', 'Uploads', 'Characters', 'Avatars']) {
      const t = page.getByRole('tab', { name: tab, exact: true }).or(page.getByRole('button', { name: tab, exact: true })).first();
      if (!(await t.isVisible().catch(() => false))) continue;
      await t.click(); await pause(page, 1500);
      option = optionByName(list, assetName);
      if (await option.isVisible().catch(() => false)) break;
    }
  }
  await option.waitFor({ state: 'visible', timeout: 10000 })
    .catch(async () => {
      await page.keyboard.press('Escape').catch(() => {}); await pause(page, 600);
      throw new Error(`"${assetName}" isn't in this Flow project. If it's a character, create it in this account's project (or use --account with the account that has it).`);
    });
  await option.click();
  const add = page.getByRole('button', { name: 'Add to prompt', exact: true });
  if (await add.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await add.click().catch(() => {});
  await list.waitFor({ state: 'hidden', timeout: 10000 });
  await pause(page, 500);
}
async function typePrompt(page, prompt) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete');
  // Enter starts the generation in Flow, so the prompt goes in as one line
  await page.keyboard.type(prompt.replace(/\s*\n+\s*/g, ' ').trim(), { delay: 8 });
  await pause(page, 500);
}

// ---------- the project grid ----------
async function clickProjectNav(page, item) {
  const button = page.getByRole('navigation', { name: 'Project navigation' }).locator('button, a').filter({ hasText: new RegExp(`${item}\\s*$`) }).first();
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click({ timeout: 5000 }); await leaveSideMenu(page);
  return true;
}
async function ensureProjectGrid(page) {
  await dismissOverlays(page);
  const root = (page.url().match(/^https:\/\/[^/]+\/project\/[0-9a-f-]{36}/) || [])[0];
  if (root && new URL(page.url()).pathname !== new URL(root).pathname) { await page.goto(inEnglish(root), { waitUntil: 'domcontentloaded' }); await pause(page, 2500); }
  if (!(await clickProjectNav(page, 'All media').catch(() => false))) {
    // the menu is hidden: the Filter menu does the same (nothing ticked, newest first)
    const filter = page.getByRole('button', { name: 'Filtering and sorting options' });
    if (await filter.isVisible().catch(() => false)) {
      await filter.click({ timeout: 5000 }).catch(() => {}); await pause(page, 600);
      const menu = page.locator('.cdk-overlay-container');
      if (await menu.locator('input[type=checkbox]:checked').count().catch(() => 0)) { await page.getByRole('button', { name: 'Clear all filters' }).click({ timeout: 4000 }).catch(() => {}); await pause(page, 600); }
      const newest = menu.locator('label', { hasText: /^\s*Newest\s*$/ }).locator('input[type=radio]');
      if ((await newest.count().catch(() => 0)) && !(await newest.first().isChecked().catch(() => true))) { await newest.first().click({ force: true, timeout: 4000 }).catch(() => {}); await pause(page, 600); }
      await page.keyboard.press('Escape'); await clearBackdrops(page);
    }
  }
  await pause(page, 800); await scrollToTop(page);
}
async function renameTile(page, tile, title) {
  try {
    await hoverTile(page, tile);
    const more = tile.getByRole('button', { name: 'More options' });
    if (!(await more.isVisible({ timeout: 3000 }).catch(() => false))) return false;
    await more.click();
    const rename = page.getByRole('menuitem', { name: 'Rename', exact: true });
    if (!(await rename.isVisible({ timeout: 4000 }).catch(() => false))) { await page.keyboard.press('Escape'); return false; }
    await rename.click(); await pause(page, 1200);
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(title, { delay: 8 }); await page.keyboard.press('Enter');
    await pause(page, 1500);
    return true;
  } catch (_) { await page.keyboard.press('Escape').catch(() => {}); return false; }
}

// ---------- downloading ----------
// Chrome saves downloads into this account's own folder (re-asserted every time: another connection can reset it);
// a file that lands in the usual Downloads folder instead is found there too
const SYSTEM_DOWNLOADS = path.join(os.homedir(), 'Downloads');
function filesIn(dirs) { const seen = new Set(); for (const d of dirs) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) seen.add(path.join(d, f)); return seen; }
async function waitForDownloadedFile(page, dirs, before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let stable = null;
  while (Date.now() < deadline) {
    await pause(page, 250);
    for (const f of filesIn(dirs)) {
      if (before.has(f) || f.endsWith('.crdownload') || path.basename(f).startsWith('.')) continue;
      const size = fs.statSync(f).size;
      if (stable && stable.f === f && stable.size === size && size > 0) return f;
      stable = { f, size };
    }
  }
  throw new Error('Flow started the download but no file arrived.');
}
// Chrome names these downloads without an extension, so the kind is read from the first bytes
function extensionOf(file) {
  const h = Buffer.alloc(12), fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, h, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return '.jpg';
  if (h[0] === 0x89 && h.subarray(1, 4).toString('latin1') === 'PNG') return '.png';
  if (h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (h.subarray(4, 8).toString('latin1') === 'ftyp') return '.mp4';
  return '.bin';
}
async function downloadMedia(page, id, stem, quality, downloadDir) {
  await scrollToTop(page); await pause(page, 2500);
  const first = mediaTile(page, id);
  await first.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { throw new Error('The finished picture or clip is in your Flow project, but could not be found again to download it.'); });
  const title = await first.getAttribute('aria-label').catch(() => null);
  const find = async () => {
    const byId = mediaTile(page, id); if (await byId.count()) return byId;
    if (title) { const byTitle = page.locator(`flow-grid-tile-container[aria-label="${q(title)}"]:has([src])`).first(); if (await byTitle.count()) return byTitle; }
    throw new Error('The finished tile is no longer in the grid. It is still in your Flow project.');
  };
  fs.mkdirSync(downloadDir, { recursive: true }); fs.mkdirSync(path.dirname(stem), { recursive: true });
  const dirs = [downloadDir, SYSTEM_DOWNLOADS];
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloadDir, eventsEnabled: true }).catch(() => {});
      const tile = await find(), before = filesIn(dirs);
      await hoverTile(page, tile, 250);
      const more = tile.getByRole('button', { name: 'More options' });
      if (await more.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await more.click(); else await tile.click({ button: 'right' });
      const download = page.getByRole('menuitem', { name: 'Download', exact: true });
      if (!(await download.isVisible({ timeout: 8000 }).catch(() => false))) {
        const items = await page.locator('[role="menuitem"]').evaluateAll(ms => ms.map(m => (m.textContent || '').replace(/\s+/g, ' ').trim()));
        throw new Error(items.length ? `Flow's menu has no Download. It offered: ${items.join(' | ')}` : "Flow's tile menu didn't open.");
      }
      await download.click({ timeout: 10000 });
      const original = page.getByRole('menuitem', { name: /original/i }).first();
      if (await original.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
        const upscaled = page.locator('[role="menuitem"]:not([aria-disabled="true"]):not([disabled])').filter({ hasText: /upscaled/i }).first();
        await (quality === 'upscaled' && (await upscaled.isVisible().catch(() => false)) ? upscaled : original).click();
      }
      const file = await waitForDownloadedFile(page, dirs, before, quality === 'upscaled' ? 600000 : 180000);
      const target = stem + extensionOf(file);
      fs.copyFileSync(file, target); fs.rmSync(file, { force: true });
      await page.keyboard.press('Escape'); await scrollToTop(page);
      return [target];
    } catch (err) { lastError = err; await page.keyboard.press('Escape').catch(() => {}); await pause(page, 2000); }
  }
  throw lastError;
}

module.exports = { FlowAccount, newestNanoBanana, extensionOf, inEnglish };
