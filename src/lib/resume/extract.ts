import { extractText, getDocumentProxy } from "unpdf";

const MAX_TEXT_CHARS = 30_000;

export async function extractResumeText(bytes: Uint8Array, contentType: string): Promise<string> {
  let text: string;
  if (contentType === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } else {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  }
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
