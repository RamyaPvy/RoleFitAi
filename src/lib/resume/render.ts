import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import type { TailoredResume } from "./tailor";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2022": "-",
  "\u2026": "...",
  "\u00a0": " ",
};

// Standard PDF fonts only cover Latin-1, so other characters are mapped or replaced.
function toLatin1(text: string) {
  let output = "";
  for (const char of text) {
    const mapped = REPLACEMENTS[char] ?? char;
    for (const c of mapped) {
      const code = c.charCodeAt(0);
      output +=
        (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? c : code <= 255 ? " " : "?";
    }
  }
  return output;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of toLatin1(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderResumePdf(resume: TailoredResume): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const paragraph = (
    text: string,
    opts: { font?: PDFFont; size?: number; indent?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    for (const line of wrap(text, font, size, CONTENT_WIDTH - indent)) {
      ensure(size + 3);
      y -= size + 3;
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    }
  };

  const heading = (text: string) => {
    ensure(30);
    y -= 12;
    paragraph(text.toUpperCase(), { font: bold, size: 10.5 });
    page.drawLine({
      start: { x: MARGIN, y: y - 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - 3 },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 3;
  };

  paragraph(resume.name || "Candidate", { font: bold, size: 18 });
  if (resume.contact.length > 0) paragraph(resume.contact.join("  |  "), { size: 9.5 });

  if (resume.summary) {
    heading("Summary");
    paragraph(resume.summary);
  }
  if (resume.skills.length > 0) {
    heading("Skills");
    paragraph(resume.skills.join(", "));
  }
  if (resume.experience.length > 0) {
    heading("Experience");
    for (const entry of resume.experience) {
      y -= 4;
      paragraph([entry.title, entry.company].filter(Boolean).join(", "), { font: bold });
      if (entry.dates) paragraph(entry.dates, { size: 9.5 });
      for (const bullet of entry.bullets) paragraph(`- ${bullet}`, { indent: 10 });
    }
  }
  if (resume.education.length > 0) {
    heading("Education");
    for (const item of resume.education) paragraph(item);
  }
  if (resume.other.length > 0) {
    heading("Additional");
    for (const item of resume.other) paragraph(`- ${item}`, { indent: 10 });
  }

  return pdf.save();
}

export function tailoredFileName(company: string, candidateName: string) {
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  return `${clean(company) || "Company"}_${clean(candidateName) || "Candidate"}_Resume.pdf`;
}
