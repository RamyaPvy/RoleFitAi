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

// Maps a question to one of the candidate's saved answers. Returns null when the question is
// not covered, so it is left for the candidate.
function savedAnswerFor(question, answers) {
  if (!answers) return null;
  const q = question.toLowerCase();
  if (/previously (worked|employed)|former employee|currently,? or have you|relative|conflict/.test(q)) return null;
  if (/sponsor|visa/.test(q)) return answers.needs_sponsorship;
  if (/authori[sz]ed|legally|eligible to work|right to work|work authori/.test(q)) {
    return answers.authorized_to_work;
  }
  if (/relocat/.test(q)) return answers.open_to_relocate;
  if (/hear about|how did you (find|hear)|where did you (find|hear)|referral source/.test(q)) {
    return answers.how_heard;
  }
  if (/notice period|earliest (start|date)|when can you start|availability/.test(q)) {
    return answers.notice_period;
  }
  if (/salary|compensation expectation|expected pay/.test(q)) return answers.salary_expectation;
  if (/^\s*country\b/.test(q)) return answers.country;
  return null;
}

// Tags every visible dropdown, yes/no radio group and combobox so Playwright can act on it.
async function answerChoices(frame, answers, me) {
  const controls = await frame
    .evaluate(() => {
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
      const questionOf = (el) => {
        const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const group = el.closest("fieldset");
        const box = el.closest("div");
        return clean(
          el.getAttribute("aria-label") ||
            byFor?.textContent ||
            group?.querySelector("legend")?.textContent ||
            box?.parentElement?.querySelector("label, legend")?.textContent ||
            box?.querySelector("label, legend")?.textContent,
        );
      };
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const out = [];
      let n = 0;
      for (const el of document.querySelectorAll("select, input[type=radio], input[role=combobox]")) {
        if (el.tagName !== "SELECT" && !visible(el) && el.type !== "radio") continue;
        if (el.tagName === "SELECT" && !visible(el)) continue;
        const tag = `rf${n++}`;
        el.setAttribute("data-rf", tag);
        if (el.type === "radio") {
          const own = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          out.push({
            tag,
            kind: "radio",
            question: questionOf(el),
            option: clean(own?.textContent || el.closest("label")?.textContent || el.value),
            checked: el.checked,
          });
        } else {
          out.push({
            tag,
            kind: el.tagName === "SELECT" ? "select" : "combobox",
            question: questionOf(el),
            options:
              el.tagName === "SELECT" ? [...el.options].map((o) => clean(o.textContent)) : [],
            chosen: el.tagName === "SELECT" ? el.selectedIndex > 0 : !!el.value,
          });
        }
      }
      return out;
    })
    .catch(() => []);

  let applied = 0;
  const skipped = [];
  const yes = (v) => v === "yes";
  const pickOption = (options, value) => {
    const wanted = yes(value) || value === "no" ? (yes(value) ? "yes" : "no") : value.toLowerCase();
    return options.find((o) => o.toLowerCase() === wanted) ??
      options.find((o) => o.toLowerCase().startsWith(wanted)) ??
      options.find((o) => o.toLowerCase().includes(wanted));
  };

  for (const c of controls) {
    const value =
      savedAnswerFor(c.question, answers) ||
      (/location|city/i.test(c.question) && c.kind === "combobox" ? me.location : null);
    const loc = frame.locator(`[data-rf="${c.tag}"]`);
    try {
      if (c.kind === "radio") {
        if (c.checked || !value) continue;
        const wanted = yes(value) ? "yes" : value === "no" ? "no" : null;
        if (wanted && c.option.toLowerCase() === wanted) {
          await loc.check({ force: true });
          applied += 1;
        }
        continue;
      }
      if (c.chosen) continue;
      if (!value) {
        if (c.question) skipped.push(c.question.slice(0, 60));
        continue;
      }
      if (c.kind === "select") {
        const option = pickOption(c.options, value);
        if (option) {
          await loc.selectOption({ label: option });
          applied += 1;
        } else skipped.push(c.question.slice(0, 60));
      } else {
        await loc.click();
        await loc.fill(yes(value) ? "Yes" : value === "no" ? "No" : value);
        await frame.page().waitForTimeout(400);
        await frame.page().keyboard.press("Enter");
        applied += 1;
      }
    } catch {
      if (c.question) skipped.push(c.question.slice(0, 60));
    }
  }
  return { applied, skipped };
}

async function fillFrame(frame, me, resumePath, answers) {
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
  const choices = await answerChoices(frame, answers, me);
  filled += choices.applied;
  const needsYou = [...choices.skipped];
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
      if (!f.visible || !textTypes.has(f.type) || f.role === "combobox") continue;
      if (f.value !== "") continue;
      const saved = savedAnswerFor(f.label, answers);
      const value =
        fieldValueFor(f.label, me) ||
        (saved === "yes" ? "Yes" : saved === "no" ? "No" : saved);
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

  const { data: answers } = await supabase
    .from("application_answers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!answers) console.log("Tip: save your standard answers on My profile to pre-fill more.");
  if (!me.last || !me.phone || !me.location) {
    console.log("Tip: add your full name, phone and location on My profile to pre-fill more.");
  }

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
        const r = await fillFrame(frame, me, resumePath, answers);
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
