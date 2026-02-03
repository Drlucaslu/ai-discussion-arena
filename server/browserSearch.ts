/**
 * 浏览器搜索服务 - 使用 Puppeteer 控制 Chrome 进行网页搜索
 * AI 可以在讨论中主动触发搜索以获取更多信息
 *
 * 搜索策略：使用 DuckDuckGo HTML 版（对自动化友好，无 CAPTCHA），
 * 然后用 Puppeteer 抓取结果页面的详细内容。
 */

import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import * as os from 'os';
import * as fs from 'fs';

// Chrome 可执行文件路径检测
function findChromePath(): string {
  const platform = os.platform();

  const candidates: string[] = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    '未找到 Chrome 浏览器。请安装 Google Chrome 或 Chromium。\n' +
    `已检查路径: ${candidates.join(', ')}`
  );
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  pageContent?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  error?: string;
}

// 浏览器实例池（复用以提高性能）
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // 防止并发启动
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    const executablePath = findChromePath();
    console.log(`[BrowserSearch] 启动 Chrome: ${executablePath}`);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--no-first-run',
      ],
    });

    browserInstance = browser;
    browserLaunchPromise = null;

    // 浏览器断开时清理
    browser.on('disconnected', () => {
      browserInstance = null;
    });

    return browser;
  })();

  return browserLaunchPromise;
}

/**
 * 关闭浏览器实例
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 使用 DuckDuckGo HTML 版搜索（无 CAPTCHA，对自动化友好）
 */
export async function searchWeb(
  query: string,
  maxResults: number = 5,
  fetchPageContent: boolean = true
): Promise<SearchResponse> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    // 使用 DuckDuckGo HTML 版（轻量、无 JS 验证）
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`[BrowserSearch] 搜索: ${query}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 提取 DuckDuckGo HTML 版搜索结果
    const results: SearchResult[] = await page.evaluate((max) => {
      const items: { title: string; url: string; snippet: string }[] = [];
      const links = Array.from(document.querySelectorAll('.result'));

      for (const el of links) {
        if (items.length >= max) break;

        const titleEl = el.querySelector('.result__a');
        const snippetEl = el.querySelector('.result__snippet');
        const urlEl = el.querySelector('.result__url');

        if (titleEl) {
          // DuckDuckGo 的链接可能经过重定向
          let href = (titleEl as HTMLAnchorElement).href || '';
          // 提取真实 URL
          if (href.includes('uddg=')) {
            try {
              const urlParam = new URL(href).searchParams.get('uddg');
              if (urlParam) href = urlParam;
            } catch {}
          }

          // 如果 href 还是不对，用显示的 URL
          if (!href || href.startsWith('//duckduckgo.com')) {
            const displayUrl = urlEl?.textContent?.trim();
            if (displayUrl) {
              href = displayUrl.startsWith('http') ? displayUrl : `https://${displayUrl}`;
            }
          }

          if (href && !href.includes('duckduckgo.com')) {
            items.push({
              title: titleEl.textContent?.trim() || '',
              url: href,
              snippet: snippetEl?.textContent?.trim() || '',
            });
          }
        }
      }

      return items;
    }, maxResults);

    console.log(`[BrowserSearch] 找到 ${results.length} 个结果`);

    // 获取页面内容（可选，取前 3 个结果）
    if (fetchPageContent && results.length > 0) {
      const contentPages = results.slice(0, 3);
      for (const result of contentPages) {
        try {
          result.pageContent = await fetchPageText(browser, result.url);
        } catch (e) {
          console.warn(`[BrowserSearch] 获取页面内容失败: ${result.url}`, e);
        }
      }
    }

    return { query, results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[BrowserSearch] 搜索失败:`, errorMessage);
    return { query, results: [], error: errorMessage };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// 保留旧名称作为别名
export const searchGoogle = searchWeb;

/**
 * 获取网页文本内容（精简版）
 */
async function fetchPageText(browser: Browser, url: string): Promise<string> {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

    // 提取主要文本内容
    const text = await page.evaluate(() => {
      // 移除不需要的元素
      const selectors = ['script', 'style', 'nav', 'header', 'footer', 'iframe', 'noscript', '.sidebar', '.menu', '.ad', '.advertisement'];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => el.remove());
      }

      // 尝试提取主内容区域
      const main = document.querySelector('article, main, [role="main"], .content, .post-content, .article-body') as HTMLElement | null;
      const target = main || document.body;

      return target.innerText || target.textContent || '';
    });

    // 限制文本长度（每页最多 3000 字符）
    const maxLen = 3000;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...[内容已截断]' : cleaned;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * 格式化搜索结果为 AI 可读的文本
 */
export function formatSearchResults(response: SearchResponse): string {
  if (response.error) {
    return `搜索"${response.query}"时出错: ${response.error}`;
  }

  if (response.results.length === 0) {
    return `搜索"${response.query}"未找到相关结果。`;
  }

  let text = `=== 网络搜索结果：${response.query} ===\n\n`;

  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i];
    text += `[${i + 1}] ${r.title}\n`;
    text += `    链接: ${r.url}\n`;
    if (r.snippet) {
      text += `    摘要: ${r.snippet}\n`;
    }
    if (r.pageContent) {
      text += `    页面内容:\n${r.pageContent.split('\n').map(l => `    ${l}`).join('\n')}\n`;
    }
    text += '\n';
  }

  return text;
}

/**
 * 从 AI 回复中解析搜索请求
 * 支持格式: 【搜索:关键词】 或 【搜索：关键词】
 */
export function parseSearchRequests(content: string): string[] {
  const pattern = /【搜索[:：](.+?)】/g;
  const queries: string[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const query = match[1].trim();
    if (query) {
      queries.push(query);
    }
  }

  return queries;
}
