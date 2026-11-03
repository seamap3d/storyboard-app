import { mkdir, writeFile } from 'node:fs/promises';

/** Collect only this local app's source, stripping callback URLs and query data. */
export function collectBrowserCoverage(browser) {
  const entries = [];
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    const newPage = context.newPage.bind(context);
    context.newPage = async (...args) => {
      const page = await newPage(...args);
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      return page;
    };
    const close = context.close.bind(context);
    context.close = async (...args) => {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        for (const entry of await page.coverage.stopJSCoverage()) {
          if (!entry.url.startsWith('http://127.0.0.1:')) continue;
          const pathname = new URL(entry.url).pathname;
          if (pathname.endsWith('.mjs'))
            entries.push({ url: pathname, source: entry.source, functions: entry.functions });
        }
      }
      return close(...args);
    };
    return context;
  };
  const close = browser.close.bind(browser);
  browser.close = async (...args) => {
    for (const context of browser.contexts()) await context.close();
    await mkdir('coverage', { recursive: true });
    await writeFile('coverage/browser-v8.json', JSON.stringify(entries));
    return close(...args);
  };
}
