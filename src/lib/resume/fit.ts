import { KEYWORDS, parseResumeText } from "./local-tailor";

// Free, rule-based fit analysis. It compares terms that literally appear in the posting with
// terms that literally appear in the resume. It estimates keyword overlap, which is what many
// ATS filters check first; it does not predict whether you will get an interview.

export type FitCheck = { label: string; ok: boolean; hint: string };

export type FitAnalysis = {
  score: number;
  matched: string[];
  missingRequired: string[];
  missingPreferred: string[];
  checks: FitCheck[];
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function has(text: string, term: string) {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegex(term)}(?![A-Za-z0-9])`, "i").test(text);
}

function count(text: string, term: string) {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(term)}(?![A-Za-z0-9])`, "gi");
  return (text.match(pattern) ?? []).length;
}

// Text after these headings is treated as "nice to have" instead of required.
const PREFERRED_START =
  /(nice to have|preferred|bonus|plus|desirable|good to have|wünschenswert|ideally)/i;

const SENIORITY: [RegExp, number][] = [
  [/\b(intern|junior|jr\.?|entry.level|graduate)\b/i, 1],
  [/\b(mid.level|intermediate)\b/i, 2],
  [/\b(senior|sr\.?)\b/i, 3],
  [/\b(staff|lead|principal|architect|manager|head of)\b/i, 4],
];

function seniorityOf(text: string) {
  let level = 0;
  for (const [pattern, value] of SENIORITY) if (pattern.test(text)) level = Math.max(level, value);
  return level;
}

function yearsRequired(description: string) {
  const years = [...description.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs)/gi)].map((m) =>
    Number(m[1]),
  );
  return years.length > 0 ? Math.max(...years.filter((y) => y <= 20), 0) : 0;
}

function resumeYears(resumeText: string) {
  const years = [...resumeText.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length === 0) return 0;
  const now = new Date().getFullYear();
  const earliest = Math.min(...years.filter((y) => y >= 1990 && y <= now));
  return Number.isFinite(earliest) ? now - earliest : 0;
}

const AMBIGUOUS = new Set([
  "go",
  "safe",
  "less",
  "search",
  "api",
  "rest",
  "express",
  "spring",
  "swift",
  "chef",
  "r",
  "c",
]);

export function analyzeFit(input: {
  resumeText: string;
  jobTitle: string;
  jobDescription: string;
}): FitAnalysis {
  const description = input.jobDescription ?? "";
  const splitAt = description.search(PREFERRED_START);
  const requiredText = `${input.jobTitle}\n${splitAt > 200 ? description.slice(0, splitAt) : description}`;
  const preferredText = splitAt > 200 ? description.slice(splitAt) : "";

  const parsed = parseResumeText(input.resumeText);
  const terms = new Set([...KEYWORDS, ...parsed.skills.map((s) => s.toLowerCase())]);

  const matched: string[] = [];
  const missingRequired: [string, number][] = [];
  const missingPreferred: [string, number][] = [];
  let weightTotal = 0;
  let weightMatched = 0;

  for (const term of terms) {
    if (
      term.length < 2 ||
      (AMBIGUOUS.has(term) &&
        !/\b(devops|engineer|developer|software|cloud|data)\b/i.test(input.jobTitle))
    )
      continue;
    const inRequired = count(requiredText, term);
    const inPreferred = count(preferredText, term);
    if (inRequired + inPreferred === 0) continue;
    const weight = inRequired > 0 ? Math.min(inRequired, 4) + 1 : 1;
    const inResume = has(input.resumeText, term);
    weightTotal += weight;
    if (inResume) {
      weightMatched += weight;
      matched.push(term);
    } else if (!KEYWORDS.includes(term)) {
      weightTotal -= weight;
    } else if (inRequired > 0) {
      missingRequired.push([term, weight]);
    } else {
      missingPreferred.push([term, weight]);
    }
  }

  const titleWords = input.jobTitle
    .split(/[^A-Za-z0-9+#.]+/)
    .filter(
      (w) => w.length > 3 && !/^(senior|junior|engineer|manager|specialist|all|genders?)$/i.test(w),
    );
  const titleHit =
    matched.length >= 3 && titleWords.length > 0 && titleWords.some((w) => has(input.resumeText, w))
      ? 1
      : 0;

  // Prior of 5 unmatched weight: a posting with only a couple of recognizable terms cannot
  // reach a top score, because there is too little evidence either way.
  const keywordShare = weightMatched / (weightTotal + 5);
  const score = Math.round(Math.min(100, keywordShare * 90 + titleHit * 10));

  const neededYears = yearsRequired(description);
  const haveYears = resumeYears(input.resumeText);
  const jobLevel = seniorityOf(input.jobTitle);
  const resumeLevel = seniorityOf(input.resumeText);
  const text = input.resumeText;

  const checks: FitCheck[] = [
    {
      label: "Contact details readable",
      ok: /@/.test(text) && /\d[\d\s().-]{8,}/.test(text),
      hint: "An email address and phone number should appear as plain text near the top.",
    },
    {
      label: "Standard section headings",
      ok: parsed.entries.length > 0 && parsed.skills.length > 0,
      hint: "Use headings such as Summary, Skills, Experience and Education so ATS software can sort your content.",
    },
    {
      label: "Dated work history",
      ok: parsed.entries.length > 0 && parsed.entries.every((e) => e.header.length > 0),
      hint: "Each job should show a title, company and a date range.",
    },
    {
      label:
        neededYears > 0 ? `Experience length (job asks ${neededYears}+ yrs)` : "Experience length",
      ok: neededYears === 0 || haveYears >= neededYears,
      hint: "The posting asks for more years than your resume dates show.",
    },
    {
      label: "Seniority fits the title",
      ok: jobLevel === 0 || resumeLevel === 0 || resumeLevel >= jobLevel - 1,
      hint: "The job title is more senior than the titles on your resume.",
    },
    {
      label: "Resume length",
      ok: text.length >= 1200 && text.length <= 14000,
      hint: "Aim for one to two pages of readable text.",
    },
  ];

  const top = (list: [string, number][], n: number) =>
    list
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([term]) => term);

  return {
    score,
    matched: matched.slice(0, 20),
    missingRequired: top(missingRequired, 8),
    missingPreferred: top(missingPreferred, 6),
    checks,
  };
}
