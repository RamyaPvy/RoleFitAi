import type { TailoredResume } from "./tailor";

// Built-in, free tailoring: no AI service. It only reorders and emphasizes what the resume
// already says, so nothing can be invented. Quality depends on the resume having clear
// headings (Summary, Skills, Experience, Education).

const KEYWORDS = [
  "python",
  "java",
  "javascript",
  "typescript",
  "c++",
  "c#",
  "golang",
  "rust",
  "ruby",
  "php",
  "scala",
  "kotlin",
  "swift",
  "sql",
  "nosql",
  "bash",
  "powershell",
  "perl",
  "matlab",
  "react",
  "angular",
  "vue",
  "next.js",
  "node.js",
  "express",
  "django",
  "flask",
  "fastapi",
  "spring",
  "spring boot",
  ".net",
  "asp.net",
  "rails",
  "graphql",
  "rest",
  "grpc",
  "html",
  "css",
  "sass",
  "tailwind",
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "ec2",
  "s3",
  "lambda",
  "cloudformation",
  "docker",
  "kubernetes",
  "helm",
  "terraform",
  "ansible",
  "puppet",
  "chef",
  "pulumi",
  "jenkins",
  "github actions",
  "gitlab ci",
  "circleci",
  "argocd",
  "ci/cd",
  "devops",
  "sre",
  "linux",
  "unix",
  "nginx",
  "prometheus",
  "grafana",
  "datadog",
  "splunk",
  "new relic",
  "elk",
  "opentelemetry",
  "git",
  "postgresql",
  "postgres",
  "mysql",
  "sql server",
  "oracle",
  "mongodb",
  "redis",
  "cassandra",
  "dynamodb",
  "elasticsearch",
  "snowflake",
  "bigquery",
  "redshift",
  "databricks",
  "spark",
  "hadoop",
  "kafka",
  "airflow",
  "dbt",
  "etl",
  "data warehouse",
  "data modeling",
  "data pipelines",
  "tableau",
  "power bi",
  "looker",
  "excel",
  "pandas",
  "numpy",
  "scikit-learn",
  "tensorflow",
  "pytorch",
  "machine learning",
  "deep learning",
  "nlp",
  "llm",
  "statistics",
  "a/b testing",
  "forecasting",
  "data analysis",
  "data visualization",
  "microservices",
  "distributed systems",
  "system design",
  "api",
  "agile",
  "scrum",
  "jira",
  "confluence",
  "security",
  "iam",
  "oauth",
  "soc 2",
  "networking",
  "tcp/ip",
  "monitoring",
  "observability",
  "incident response",
  "on-call",
  "automation",
  "scripting",
  "testing",
  "unit testing",
  "selenium",
  "cypress",
  "jest",
  "pytest",
  "qa",
  "salesforce",
  "sap",
  "servicenow",
  "figma",
  "product management",
  "roadmap",
  "stakeholder",
  "project management",
  "leadership",
  "mentoring",
];

const SECTION_HEADINGS: [RegExp, "summary" | "skills" | "experience" | "education" | "other"][] = [
  [/^(professional\s+)?(summary|profile|objective|about( me)?)$/i, "summary"],
  [
    /^(technical\s+|key\s+|core\s+)?(skills|competencies|technologies|tech stack)( & tools)?$/i,
    "skills",
  ],
  [
    /^(professional\s+|work\s+|relevant\s+)?(experience|employment( history)?|work history)$/i,
    "experience",
  ],
  [/^(education|academic background|academics)$/i, "education"],
  [
    /^(projects|certifications?|awards|achievements|publications|additional( information)?|volunteer(ing)?|languages|leadership)$/i,
    "other",
  ],
];

const BULLET = /^\s*[-•*▪●◦·–—]\s+/;
const DATE_RANGE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\s*[-–—to]+\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}|present|current)/i;
const CONTACT = /@|https?:\/\/|linkedin|github\.com|\+?\d[\d\s().-]{8,}/i;

// Drops a trailing "City, ST" or country that PDF extraction leaves on a title line.
function stripLocation(value: string) {
  return value
    .replace(/\s+[A-Z][a-z]+,\s*[A-Z]{2}$/, "")
    .replace(/\s+(India|Remote|USA|United States)$/, "")
    .trim();
}

// PDF text wraps long lines, often splitting a hyphenated word across two lines.
function joinWrapped(previous: string, next: string) {
  return /[A-Za-z]-$/.test(previous) && /^[a-z]/.test(next)
    ? previous.slice(0, -1) + next
    : `${previous} ${next}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTerm(text: string, term: string) {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(term)}(?![A-Za-z0-9])`, "gi");
  return (text.match(pattern) ?? []).length;
}

function headingKind(line: string) {
  const cleaned = line.replace(/[:#*_]/g, "").trim();
  if (cleaned.length === 0 || cleaned.length > 32) return null;
  for (const [pattern, kind] of SECTION_HEADINGS) if (pattern.test(cleaned)) return kind;
  return null;
}

type Entry = { header: string[]; bullets: string[] };

export function parseResumeText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections: Record<string, string[]> = {
    summary: [],
    skills: [],
    experience: [],
    education: [],
    other: [],
  };
  const header: string[] = [];
  let current: keyof typeof sections | null = null;
  for (const line of lines) {
    const kind = headingKind(line);
    if (kind) {
      current = kind;
      continue;
    }
    if (current) sections[current].push(line);
    else header.push(line);
  }

  const entries: Entry[] = [];
  const expLines = sections.experience;
  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    const body = line.replace(BULLET, "");
    const last = entries[entries.length - 1];
    if (BULLET.test(line)) {
      if (last) last.bullets.push(body);
      else entries.push({ header: [], bullets: [body] });
      continue;
    }
    const next = expLines[i + 1];
    const nextHasDate = next !== undefined && !BULLET.test(next) && DATE_RANGE.test(next);
    const startsEntry =
      !last ||
      (last.bullets.length > 0 &&
        !/[.!?]$/.test(body) &&
        (DATE_RANGE.test(body) || (nextHasDate && body.length <= 80)));
    if (startsEntry) {
      entries.push({ header: [body], bullets: [] });
    } else if (last.bullets.length === 0 && last.header.length < 4) {
      last.header.push(body);
    } else if (last.bullets.length === 0) {
      last.bullets.push(body);
    } else {
      last.bullets[last.bullets.length - 1] = joinWrapped(
        last.bullets[last.bullets.length - 1],
        body,
      );
    }
  }

  const skills = sections.skills
    .map((line) => line.replace(/^[^:,]{1,40}:/, ""))
    .join(",")
    .split(/[,;|•·\n](?![^()]*\))/)
    .map((item) =>
      item
        .replace(BULLET, "")
        .replace(/^[^:()]{1,40}:\s*/, "")
        .trim(),
    )
    .filter((item) => item.length > 1 && item.length <= 40);

  return {
    name: header[0] ?? "",
    contact: header
      .slice(1)
      .filter((line) => CONTACT.test(line))
      .flatMap((line) => line.split(/\s+[#§ï•|]\s*/))
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 6),
    summary: sections.summary
      .map((line) => line.replace(BULLET, ""))
      .reduce((text, line) => (text ? joinWrapped(text, line) : line), ""),
    skills: [...new Set(skills)],
    entries,
    education: sections.education,
    other: sections.other,
  };
}

export function tailorResumeLocal(input: {
  resumeText: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
}): TailoredResume {
  const parsed = parseResumeText(input.resumeText);
  if (parsed.entries.length === 0 && parsed.skills.length === 0) {
    throw new Error("unstructured");
  }

  const jobText = `${input.jobTitle}\n${input.jobTitle}\n${input.jobDescription}`;
  const resumeLower = input.resumeText;

  // Weight = how often the posting mentions the term (capped), for terms in the shared list
  // or listed in the candidate's own skills section.
  const candidateTerms = new Set([...KEYWORDS, ...parsed.skills.map((s) => s.toLowerCase())]);
  const weights = new Map<string, number>();
  const missing: [string, number][] = [];
  for (const term of candidateTerms) {
    const inJob = countTerm(jobText, term);
    if (inJob === 0) continue;
    const weight = Math.min(inJob, 5);
    if (countTerm(resumeLower, term) > 0) weights.set(term, weight);
    else if (KEYWORDS.includes(term)) missing.push([term, weight]);
  }

  const score = (text: string) => {
    let total = 0;
    for (const [term, weight] of weights) if (countTerm(text, term) > 0) total += weight;
    return total;
  };
  const byScore = <T>(items: T[], textOf: (item: T) => string) =>
    items
      .map((item, index) => ({ item, index, value: score(textOf(item)) }))
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .map((x) => x.item);

  const skills = byScore(parsed.skills, (skill) => skill).slice(0, 40);
  const matchedSkills = skills.filter((skill) => score(skill) > 0).slice(0, 6);

  const experience = parsed.entries.slice(0, 12).map((entry) => {
    let dates = "";
    const rest: string[] = [];
    for (const line of entry.header) {
      const match = dates ? null : line.match(DATE_RANGE);
      if (match && match.index !== undefined) {
        dates = match[0].trim();
        const remainder =
          `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`
            .replace(/\s+/g, " ")
            .trim();
        if (remainder) rest.push(stripLocation(remainder));
      } else {
        rest.push(stripLocation(line));
      }
    }
    return {
      title: rest[0] ?? "",
      company: rest.slice(1).join(", "),
      dates,
      bullets: byScore(entry.bullets, (bullet) => bullet).slice(0, 6),
    };
  });

  const focus = matchedSkills.length > 0 ? ` Relevant strengths: ${matchedSkills.join(", ")}.` : "";
  const base = parsed.summary ? ` ${parsed.summary}` : "";
  const summary = `Applying for ${input.jobTitle}.${focus}${base}`.trim().slice(0, 900);

  const gaps = missing
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => `The posting mentions "${term}", which your resume doesn't show.`);

  return {
    name: parsed.name,
    contact: parsed.contact.slice(0, 6),
    summary,
    skills,
    experience,
    education: parsed.education.slice(0, 8),
    other: parsed.other.slice(0, 10),
    gaps,
  };
}
