/**
 * 文件解析工具 - 提取 PDF 和 Excel 文件的文本内容
 */

import * as path from "path";
import * as fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_EXTRACTED_TEXT = 50000; // 最大提取文本字符数

/**
 * 确保上传目录存在
 */
function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * 保存上传的文件到磁盘
 */
export function saveUploadedFile(
  fileName: string,
  base64Data: string,
  discussionId: number
): { filePath: string; buffer: Buffer } {
  ensureUploadsDir();

  const ext = path.extname(fileName);
  const safeName = `${discussionId}_${Date.now()}${ext}`;
  const relativePath = `uploads/${safeName}`;
  const fullPath = path.join(UPLOADS_DIR, safeName);

  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(fullPath, buffer);

  return { filePath: relativePath, buffer };
}

/**
 * 解析 PDF 文件，提取文本
 */
export async function parsePDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse") as any;
  const parser = new PDFParse({ verbosity: 0, data: new Uint8Array(buffer) });
  await parser.load();
  const result = await parser.getText();
  let text = result?.text || "";
  if (text.length > MAX_EXTRACTED_TEXT) {
    text = text.slice(0, MAX_EXTRACTED_TEXT) + "\n...[文本过长，已截断]";
  }
  parser.destroy();
  return text;
}

/**
 * 解析 Excel 文件，提取文本（CSV 格式，每个 sheet）
 */
export function parseExcel(buffer: Buffer): string {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
  }

  let text = parts.join("\n\n");
  if (text.length > MAX_EXTRACTED_TEXT) {
    text = text.slice(0, MAX_EXTRACTED_TEXT) + "\n...[文本过长，已截断]";
  }
  return text;
}

/**
 * 解析 Markdown 文件，直接读取文本
 */
export function parseMarkdown(buffer: Buffer): string {
  let text = buffer.toString("utf-8");
  if (text.length > MAX_EXTRACTED_TEXT) {
    text = text.slice(0, MAX_EXTRACTED_TEXT) + "\n...[文本过长，已截断]";
  }
  return text;
}

/**
 * 图片文件仅存储引用，不提取内容
 */
export function parseImage(fileName: string, fileSize: number): string {
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
  return `[图片文件: ${fileName}, 大小: ${sizeMB} MB]`;
}

/** 图片格式扩展名 */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
