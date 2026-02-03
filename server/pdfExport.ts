/**
 * PDF 导出服务 - 使用 Puppeteer 将讨论内容渲染为 PDF
 * 复用 browserSearch.ts 的 Chrome 实例
 */

import puppeteer, { type Browser } from 'puppeteer-core';
import * as os from 'os';
import * as fs from 'fs';
import { getDiscussionById, getMessagesByDiscussionId } from './db';
import type { Discussion, Message } from '../drizzle/schema';

// Chrome 路径检测（与 browserSearch.ts 共享逻辑）
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

  throw new Error('未找到 Chrome 浏览器，无法生成 PDF');
}

const ROLE_LABELS: Record<string, string> = {
  host: '主持人',
  judge: '裁判',
  guest: '嘉宾',
  system: '系统',
};

/**
 * 构建讨论内容的 HTML 页面
 */
function buildHTML(discussion: Discussion, messages: Message[]): string {
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const roleColors: Record<string, string> = { host: '#3b82f6', judge: '#a855f7', guest: '#22c55e', system: '#6b7280' };

  let messagesHtml = '';
  for (const msg of messages) {
    const roleLabel = ROLE_LABELS[msg.role] || msg.role;
    const header = msg.modelName ? `${roleLabel} (${msg.modelName})` : roleLabel;
    const time = new Date(msg.createdAt).toLocaleTimeString('zh-CN');
    const color = roleColors[msg.role] || '#333';
    // 内容保持 Markdown 原文，由 Puppeteer 中的 marked.js 渲染
    const contentEscaped = msg.role === 'host'
      ? escHtml(msg.content).replace(/\n/g, '<br/>')
      : `<div class="markdown-content" data-md="${escHtml(msg.content)}"></div>`;
    messagesHtml += `
      <div class="msg" style="border-left-color:${color}">
        <div class="msg-header">[${time}] <strong style="color:${color}">${escHtml(header)}</strong></div>
        <div class="msg-body">${contentEscaped}</div>
      </div>`;
  }

  let verdictHtml = '';
  if (discussion.finalVerdict) {
    verdictHtml = `
      <h2 style="margin-top:30px;padding-bottom:8px;border-bottom:2px solid #22c55e;">最终裁决</h2>
      <div class="verdict"><div class="markdown-content" data-md="${escHtml(discussion.finalVerdict)}"></div></div>`;
    if (discussion.confidenceScores && Object.keys(discussion.confidenceScores).length > 0) {
      verdictHtml += '<h3 style="margin-top:16px;">置信度评分</h3><ul>';
      for (const [hypo, score] of Object.entries(discussion.confidenceScores)) {
        verdictHtml += `<li>${escHtml(hypo)}: <strong>${(score as number).toFixed(2)}</strong></li>`;
      }
      verdictHtml += '</ul>';
    }
  }

  const createdStr = discussion.createdAt ? new Date(discussion.createdAt).toLocaleString('zh-CN') : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(discussion.title)}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;max-width:800px;margin:0 auto;padding:40px 30px;color:#333;font-size:14px;line-height:1.6;}
  h1{font-size:22px;margin-bottom:8px;} h2{font-size:17px;} h3{font-size:15px;}
  .meta{font-size:12px;color:#888;margin-bottom:24px;}
  .question{padding:16px;background:#eff6ff;border-radius:8px;margin-bottom:24px;}
  .msg{margin-bottom:16px;padding:12px;border-left:4px solid #ccc;background:#f9f9f9;border-radius:4px;break-inside:avoid;}
  .msg-header{font-size:12px;color:#666;margin-bottom:6px;}
  .msg-body{font-size:13px;line-height:1.7;}
  .msg-body img{max-width:100%;height:auto;border-radius:4px;margin:8px 0;}
  .msg-body pre{background:#f0f0f0;padding:12px;border-radius:4px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;}
  .msg-body code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px;}
  .msg-body pre code{background:none;padding:0;}
  .msg-body table{border-collapse:collapse;width:100%;margin:8px 0;}
  .msg-body th,.msg-body td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:12px;}
  .msg-body th{background:#f5f5f5;font-weight:600;}
  .msg-body blockquote{border-left:3px solid #ddd;margin:8px 0;padding:4px 12px;color:#666;}
  .msg-body ul,.msg-body ol{padding-left:24px;}
  .msg-body li{margin:2px 0;}
  .verdict{padding:12px;background:#f0fdf4;border-radius:6px;line-height:1.7;}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;}
</style></head><body>
  <h1>${escHtml(discussion.title)}</h1>
  <div class="meta">
    状态: ${discussion.status === 'completed' ? '已完成' : '进行中'} &nbsp;|&nbsp;
    裁判: ${escHtml(discussion.judgeModel)} &nbsp;|&nbsp;
    嘉宾: ${escHtml(discussion.guestModels.join(', '))}
    ${createdStr ? `&nbsp;|&nbsp; 创建时间: ${createdStr}` : ''}
  </div>
  <h2>讨论问题</h2>
  <div class="question">${escHtml(discussion.question).replace(/\n/g, '<br/>')}</div>
  <h2>讨论记录</h2>
  ${messagesHtml}
  ${verdictHtml}
  <div class="footer">由 AI 讨论竞技场生成 · ${new Date().toLocaleString('zh-CN')}</div>
<script>
  // 渲染所有 Markdown 内容
  document.querySelectorAll('.markdown-content').forEach(el => {
    const md = el.getAttribute('data-md') || '';
    // 反转义 HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = md;
    const raw = textarea.value;
    el.innerHTML = marked.parse(raw, { gfm: true, breaks: true });
  });
<\/script>
</body></html>`;
}

/**
 * 生成 PDF Buffer（供 API 端点使用）
 */
export async function generatePDFBuffer(discussionId: number): Promise<{ buffer: Buffer; filename: string }> {
  const discussion = await getDiscussionById(discussionId);
  if (!discussion) {
    throw new Error(`讨论 #${discussionId} 不存在`);
  }

  const messages = await getMessagesByDiscussionId(discussionId);
  const html = buildHTML(discussion, messages);

  const executablePath = findChromePath();
  const browser: Browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // 等待 marked.js CDN 加载并渲染完毕
    await page.waitForFunction(() => {
      const els = document.querySelectorAll('.markdown-content');
      return els.length === 0 || !document.querySelector('.markdown-content[data-md]')
        || Array.from(els).every(el => el.innerHTML.length > 0);
    }, { timeout: 10000 }).catch(() => {
      console.warn('[PDF Export] Markdown 渲染超时，使用当前状态');
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:9px;color:#aaa;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    // 安全的文件名
    const safeName = discussion.title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 80);
    const filename = `${safeName}.pdf`;

    return { buffer: Buffer.from(pdfBuffer), filename };
  } finally {
    await browser.close();
  }
}
