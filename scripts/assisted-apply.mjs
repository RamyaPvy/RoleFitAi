// Assisted apply: opens each tailored job's employer form in a visible Chrome window, fills
// your details, uploads the tailored resume, and then WAITS for you to review and click Submit.
// It never presses Submit and never solves CAPTCHAs. Run with: npm run apply:assist
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const root = process.cwd();

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function argValue(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function applyUrlFor(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "jobs.lever.co" && !u.pathname.endsWith("/apply")) {
      u.pathname = `${u.pathname.replace(/\/$/, "")}/apply`;
    }
    if (u.hostname === "jobs.ashbyhq.com" && !u.pathname.endsWith("/application")) {
      u.pathname = `${u.pathname.replace(/\/$/, "")}/application`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Only identity and contact fields are filled. Legal, demographic and free-text questions
// are always left for the candidate.
function fieldValueFor(label, me) {
  const text = label.toLowerCase();
  if (/cover letter|why |salary|compensation|pronoun|gender|race|veteran|disabilit/.test(text)) return null;
  if (/first\s*name|given name/.test(text)) return me.first;
  if (/last\s*name|surname|family name/.test(text)) return me.last;
  if (/full name|^name\b|your name|legal name/.test(text)) return me.full;
  if (/e-?mail/.test(text)) return me.email;
  if (/phone|mobile|telephone/.test(text)) return me.phone;
  if (/linkedin/.test(text)) return me.linkedin;
  if (/github/.test(text)) return me.github;
  if (/website|portfolio|personal site|url/.test(text)) return me.github || me.linkedin;
  if (/current location|^location|city/.test(text)) return me.location;
  return null;
}

async function fillFrame(frame, me, resumePath) {
  const fields = await frame
    .locator("input, textarea")
    .evaluateAll((nodes) =>
      nodes.map((el, index) => {
        const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const id = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const wrap = el.closest("label");
        const group = el.closest("div, fieldset, li");
        const label = [
          el.getAttribute("aria-label"),
          id?.textContent,
          wrap?.textContent,
          el.placeholder,
          el.name,
          el.id,
          group?.querySelector("label, legend")?.textContent,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        return {
          index,
          visible,
          type: (el.getAttribute("type") || el.tagName).toLowerCase(),
          role: el.getAttribute("role") || "",
          value: el.value || "",
          required: el.required || el.getAttribute("aria-required") === "true",
          label,
        };
      }),
    )
    .catch(() => []);

  let filled = 0;
  let uploaded = false;
  const needsYou = [];
  const textTypes = new Set(["text", "email", "tel", "url", "input", "textarea", "search"]);
  const files = fields.filter((f) => f.type === "file");

  for (const f of fields) {
    const locator = frame.locator("input, textarea").nth(f.index);
    try {
      if (f.type === "file") {
        const isResume = /resume|cv/i.test(f.label) || files.length === 1;
        if (isResume && !uploaded) {
          await locator.setInputFiles(resumePath);
          uploaded = true;
        }
        continue;
      }
      if (!f.visible || !textTypes.has(f.type) || f.role === "combobox") {
        if (f.visible && f.required && f.value === "") needsYou.push(f.label.slice(0, 60));
        continue;
      }
      if (f.value !== "") continue;
      const value = fieldValueFor(f.label, me);
      if (value) {
        await locator.fill(value);
        filled += 1;
      } else if (f.required) {
        needsYou.push(f.label.slice(0, 60));
      }
    } catch {
      // Skip fields that cannot be interacted with; the candidate can fill them.
    }
  }
  return { filled, uploaded, needsYou };
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const wanted = (argValue("email") || process.env.APPLY_EMAIL || "").toLowerCase();
  const users = usersPage?.users ?? [];
  const user = wanted
    ? users.find((u) => u.email?.toLowerCase() === wanted)
    : users.length === 1
      ? users[0]
      : undefined;
  if (!user) {
    console.error(
      `Could not choose an account. Run: npm run apply:assist -- --email you@example.com\nAccounts: ${users
        .map((u) => u.email)
        .join(", ")}`,
    );
    process.exit(1);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, location, linkedin_url, github_url")
    .eq("user_id", user.id)
    .maybeSingle();
  const full = (profile?.full_name || "").trim();
  const parts = full.split(/\s+/);
  const me = {
    full,
    first: parts[0] || "",
    last: parts.slice(1).join(" "),
    email: user.email || "",
    phone: profile?.phone || "",
    location: profile?.location || "",
    linkedin: profile?.linkedin_url || "",
    github: profile?.github_url || "",
  };

  const { data: tailored } = await supabase
    .from("tailored_resumes")
    .select("id, job_id, company_name, job_title, apply_url, file_name, storage_path")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const { data: apps } = await supabase
    .from("applications")
    .select("job_id, status")
    .eq("user_id", user.id)
    .eq("status", "applied");
  const done = new Set((apps ?? []).map((a) => a.job_id));
  const limit = Number(argValue("limit")) || 30;
  const queue = (tailored ?? [])
    .filter((t) => process.argv.includes("--all") || !t.job_id || !done.has(t.job_id))
    .slice(0, limit);

  if (queue.length === 0) {
    console.log("Nothing in the queue. Tailor jobs first on the Job matches page.");
    return;
  }

  const folder = path.join(root, "applications", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(folder, { recursive: true });
  console.log(`\n${queue.length} application(s) queued. Resumes are saved in:\n  ${folder}\n`);

  const context = await chromium.launchPersistentContext(path.join(root, ".apply-profile"), {
    channel: "chrome",
    headless: false,
    viewport: null,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let submitted = 0;
  for (const [n, item] of queue.entries()) {
    console.log(`\n[${n + 1}/${queue.length}] ${item.job_title} at ${item.company_name}`);
    const { data: blob } = await supabase.storage.from("resumes").download(item.storage_path);
    if (!blob) {
      console.log("  Could not download the tailored resume; skipping.");
      continue;
    }
    const resumePath = path.join(folder, item.file_name);
    fs.writeFileSync(resumePath, Buffer.from(await blob.arrayBuffer()));

    try {
      await page.goto(applyUrlFor(item.apply_url), { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      let total = { filled: 0, uploaded: false, needsYou: [] };
      for (const frame of page.frames()) {
        const r = await fillFrame(frame, me, resumePath);
        total = {
          filled: total.filled + r.filled,
          uploaded: total.uploaded || r.uploaded,
          needsYou: [...total.needsYou, ...r.needsYou],
        };
      }
      console.log(
        `  Filled ${total.filled} field(s). Resume uploaded: ${total.uploaded ? "yes" : "NO - attach it yourself"}.`,
      );
      if (total.needsYou.length > 0) {
        console.log(`  Needs you: ${[...new Set(total.needsYou)].slice(0, 8).join(" | ")}`);
      }
      console.log("  Review the form, answer any questions, solve any CAPTCHA, then click Submit.");
    } catch (error) {
      console.log(`  Could not open or fill the page (${error.message}). You can apply manually.`);
    }

    const answer = (await rl.question("  Did you submit it? [y]es / [n]o, next / [q]uit: ")).trim().toLowerCase();
    if (answer.startsWith("y")) {
      const now = new Date().toISOString();
      const row = {
        company_name: item.company_name,
        job_title: item.job_title,
        apply_url: item.apply_url,
        resume_file_name: item.file_name,
        status: "applied",
        applied_at: now,
        updated_at: now,
      };
      const { data: existing } = item.job_id
        ? await supabase
            .from("applications")
            .select("id")
            .eq("user_id", user.id)
            .eq("job_id", item.job_id)
            .maybeSingle()
        : { data: null };
      if (existing) await supabase.from("applications").update(row).eq("id", existing.id);
      else await supabase.from("applications").insert({ ...row, user_id: user.id, job_id: item.job_id });
      submitted += 1;
      console.log("  Recorded in your Applications ledger.");
    }
    if (answer.startsWith("q")) break;
  }

  rl.close();
  await context.close();
  console.log(`\nDone. ${submitted} application(s) recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
