export type MatchProfile = {
  skills: string[];
  currentRole: string | null;
  location: string | null;
};

export type MatchableJob = {
  title: string;
  location: string | null;
  description: string | null;
};

export type JobMatch = {
  matchedSkills: string[];
  totalSkills: number;
  titleMatch: boolean;
  locationMatch: boolean;
  score: number;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "senior",
  "junior",
  "lead",
  "staff",
  "principal",
  "sr",
  "jr",
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack: string, term: string) {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, "i");
  return pattern.test(haystack);
}

export function roleKeywords(role: string | null) {
  return (role ?? "")
    .split(/[^A-Za-z0-9+#.]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
}

// Counts only terms that literally appear in the posting; this is overlap, not a prediction of success.
export function scoreJob(job: MatchableJob, profile: MatchProfile): JobMatch {
  const text = `${job.title}\n${job.description ?? ""}`;
  const skills = profile.skills.filter(Boolean);
  const matchedSkills = skills.filter((skill) => containsTerm(text, skill));

  const keywords = roleKeywords(profile.currentRole);
  const titleMatch =
    keywords.length > 0 && keywords.filter((word) => containsTerm(job.title, word)).length >= 1;

  const profileCity = profile.location?.split(",")[0]?.trim();
  const locationMatch = Boolean(
    profileCity && job.location && containsTerm(job.location, profileCity),
  );

  const skillShare = skills.length > 0 ? matchedSkills.length / skills.length : 0;
  const score = Math.round(skillShare * 70 + (titleMatch ? 20 : 0) + (locationMatch ? 10 : 0));

  return { matchedSkills, totalSkills: skills.length, titleMatch, locationMatch, score };
}

// Keeps characters that are safe inside a PostgREST filter value.
export function sanitizeSearchTerm(term: string) {
  return term
    .replace(/[^A-Za-z0-9 +#.\-/]/g, "")
    .trim()
    .slice(0, 60);
}

const RELATED_TITLES: { match: RegExp; titles: string[] }[] = [
  {
    match: /devops|sre|site reliability|platform engineer|cloud engineer|infrastructure/i,
    titles: [
      "DevOps",
      "Site Reliability",
      "SRE",
      "Platform Engineer",
      "Infrastructure Engineer",
      "Cloud Engineer",
      "Reliability Engineer",
      "Release Engineer",
    ],
  },
  {
    match: /data analyst|business analyst|analytics|bi analyst|business intelligence/i,
    titles: [
      "Data Analyst",
      "Business Analyst",
      "Analytics",
      "Business Intelligence",
      "BI Analyst",
      "Insights Analyst",
      "Reporting Analyst",
      "Product Analyst",
    ],
  },
  {
    match: /data engineer|analytics engineer|etl/i,
    titles: ["Data Engineer", "Analytics Engineer", "Data Platform", "ETL", "Data Infrastructure"],
  },
  {
    match: /data scien|machine learning|ml engineer|ai engineer/i,
    titles: [
      "Data Scientist",
      "Machine Learning",
      "ML Engineer",
      "AI Engineer",
      "Applied Scientist",
      "Research Engineer",
    ],
  },
  {
    match: /software engineer|software developer|backend|full.?stack|developer/i,
    titles: [
      "Software Engineer",
      "Software Developer",
      "Backend Engineer",
      "Full Stack",
      "Fullstack",
      "Member of Technical Staff",
    ],
  },
  {
    match: /frontend|front.end|ui engineer|web developer/i,
    titles: ["Frontend", "Front-End", "Front End", "UI Engineer", "Web Developer"],
  },
  {
    match: /product manager|program manager/i,
    titles: ["Product Manager", "Program Manager", "Technical Program Manager", "Product Owner"],
  },
  {
    match: /security/i,
    titles: ["Security Engineer", "Security Analyst", "Application Security", "Detection"],
  },
  {
    match: /qa|test engineer|quality/i,
    titles: ["QA", "Quality Engineer", "Test Engineer", "SDET", "Quality Assurance"],
  },
];

// Adds commonly used alternate titles for the roles a candidate typed, so one role such as
// "DevOps Engineer" also finds "Site Reliability Engineer" or "Platform Engineer" postings.
export function expandRelatedTitles(roles: string[]) {
  const expanded = new Set(roles);
  for (const role of roles) {
    for (const group of RELATED_TITLES) {
      if (group.match.test(role)) for (const title of group.titles) expanded.add(title);
    }
  }
  return [...expanded];
}
