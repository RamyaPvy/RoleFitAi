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
  if (/first\s*name|given name|vorname|voornaam|prénom|^nombre\b/.test(text)) return me.first;
  if (/last\s*name|surname|family name|nachname|achternaam|apellido|nom de famille/.test(text)) return me.last;
  if (/full name|^name\b|your name|legal name|vollständiger name|nombre completo/.test(text)) return me.full;
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

const APPLY_BUTTON =
  /^\s*(apply( now| here| today| online| for (this|the) (job|role|position|vacancy|opening)| to (this|the) (job|role|position))?|start (your |the )?application|i'?m interested|submit (your )?application|auf diese stelle bewerben|jetzt bewerben|bewerben|postuler|solicitar)\s*[.!>»→]*\s*$/i;

async function hasApplicationForm(page) {
  for (const frame of page.frames()) {
    const count = await frame
      .evaluate(
        () =>
          document.querySelectorAll("input[type=file]").length * 5 +
          document.querySelectorAll("input[type=text], input[type=tel], textarea").length,
      )
      .catch(() => 0);
    if (count >= 4) return true;
  }
  return false;
}

// Many career pages only show a job description with an Apply link, sometimes through two
// pages. Following the link just navigates to the form; nothing is submitted.
async function findApplyTarget(frame) {
  return frame
    .evaluate((source) => {
      const pattern = new RegExp(source, "i");
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const text = (el) => (el.textContent || el.value || el.getAttribute("aria-label") || "").trim();
      const items = [...document.querySelectorAll("a, button, [role=button], input[type=submit]")]
        .filter((el) => pattern.test(text(el)))
        .filter((el) => !el.closest("form") || !el.closest("form").querySelector("input[type=file]"));
      const real = (el) => {
        const href = el.tagName === "A" ? el.getAttribute("href") : null;
        return href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("javascript:");
      };
      const link = items.find(real);
      if (link) return { href: link.href };
      const button = items.find(visible);
      if (button) {
        button.setAttribute("data-rf-apply", "1");
        return { click: true };
      }
      return null;
    }, APPLY_BUTTON.source)
    .catch(() => null);
}

async function openApplyPage(page) {
  // Cloudflare check pages pass on their own in a real browser; give them a moment.
  for (let i = 0; i < 8 && /just a moment/i.test(await page.title().catch(() => "")); i++) {
    await page.waitForTimeout(2000);
  }
  let opened = false;
  for (let hop = 0; hop < 3; hop++) {
    if (await hasApplicationForm(page)) break;
    let target = null;
    for (const frame of page.frames()) {
      target = await findApplyTarget(frame);
      if (target) {
        target.frame = frame;
        break;
      }
    }
    if (!target) break;
    const before = page.url();
    try {
      if (target.href) {
        await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      } else {
        const popup = page.context().waitForEvent("page", { timeout: 4000 }).catch(() => null);
        await target.frame.locator('[data-rf-apply="1"]').first().click({ timeout: 8000 });
        const extra = await popup;
        if (extra) {
          await extra.waitForLoadState("domcontentloaded").catch(() => {});
          await extra.close().catch(() => {});
        }
      }
    } catch {
      break;
    }
    await page.waitForTimeout(3000);
    opened = opened || page.url() !== before;
    if (!opened && hop > 0) break;
  }
  return opened;
}

// Employer pages often pick a language from the location. Pick English when a switcher exists.
async function switchToEnglish(page) {
  const lang = await page.evaluate(() => document.documentElement.lang || "").catch(() => "en");
  if (/^en/i.test(lang) || !lang) return false;
  const found = await page
    .evaluate(() => {
      const els = [...document.querySelectorAll("a, button, option, [role=menuitem], [role=option]")];
      const hit = els.find((el) => /^\s*(english|en|inglés|englisch|engels)(\s*\(.*\))?\s*$/i.test(el.textContent || ""));
      if (!hit) return null;
      if (hit.tagName === "OPTION") {
        const select = hit.closest("select");
        if (!select) return null;
        select.value = hit.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return { done: true };
      }
      if (hit.tagName === "A" && hit.getAttribute("href") && !hit.getAttribute("href").startsWith("#")) {
        return { href: hit.href };
      }
      hit.setAttribute("data-rf-lang", "1");
      return { click: true };
    })
    .catch(() => null);
  if (!found) return false;
  try {
    if (found.href) await page.goto(found.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    else if (found.click) await page.locator('[data-rf-lang="1"]').first().click({ timeout: 5000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(2500);
  return true;
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
        const form = el.closest("form") || el.parentElement?.parentElement;
        const nearby = (form?.innerText || "").slice(0, 500).toLowerCase();
        const fieldCount = form ? form.querySelectorAll("input:not([type=hidden]), textarea").length : 0;
        const hasFile = !!form?.querySelector("input[type=file]");
        const marketing =
          /subscribe|newsletter|job alerts?|get notified|notify me|stay (up to date|updated)|talent (community|network)|join our/.test(
            nearby,
          ) &&
          !hasFile &&
          fieldCount <= 3;
        return {
          index,
          visible: visible && !marketing,
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
  if (!me.last) {
    console.log(
      "WARNING: your profile name is only one word, so Last name cannot be filled. Put your FULL name on My profile.",
    );
  }
  if (!me.phone || !me.location) {
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
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
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
      if (await openApplyPage(page)) console.log("  Opened the Apply page.");
      if (await switchToEnglish(page)) console.log("  Switched the page to English.");
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
