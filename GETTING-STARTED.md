# RoleFit: beginner setup guide

This guide takes you from this project folder to a working **local** RoleFit app with
Supabase sign-up and a private candidate profile. Follow the steps in order. You do not
need to know how to program.

> **What you will have at the end:** the app running on your own computer, with a Supabase
> account, sign-in, and a database that lets each signed-in user see only their own profile.
>
> **What you will not have yet:** a public website, live job listings,
> automatic applications, or an employer integration. Do not enter your real profile until
> you have created and configured your own Supabase project and have reviewed its security
> settings.

## Before you start

You will need:

- This project on your Windows computer in `E:\RoleFitAi`.
- Internet access.
- A free Supabase account and project.
- A web browser and Visual Studio Code (VS Code).

The computer for this project already has Node.js and npm available. Next.js requires
Node.js 20.9 or newer; the current installed version is Node.js 24.13.0. If you follow this
guide on a different computer, install the current Node.js LTS release from
[nodejs.org](https://nodejs.org/) and then reopen PowerShell. The version requirement is
also listed in the [official Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation).

## Part 1: Create your Supabase project

Supabase is the hosted service that supplies the account sign-in and private database for
this app. You create and own the project; RoleFit does not yet have its own hosted
database.

1. In your browser, open [supabase.com](https://supabase.com/). You can also follow
   [Supabase's official Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
   if its dashboard labels look different from this guide.
2. Sign up or sign in. Use an email address you can access, because you may need to confirm
   it.
3. Create an organization if Supabase asks. You can name it `RoleFit`.
4. Choose **New project**.
5. Name the project `rolefit-development`.
6. Create a strong database password. Save it in a reputable password manager. **Do not
   put this database password in `.env.local`, send it in chat, or commit it to GitHub.**
   RoleFit uses the project URL and the public publishable key; it does not need your
   database password.
7. Choose a region near you to reduce delay.
8. If Supabase asks for a pricing plan, you can start with its free option for development.
   Review its current limits and terms in the dashboard; availability and limits can
   change. Do not use a development/free project as a promise of production availability
   or backup guarantees.
9. Wait for project setup to finish. Leave this browser tab open.

## Part 2: Copy the project's public connection details

RoleFit needs two values to connect to your Supabase project.

1. In the Supabase project dashboard, open **Project Settings** (the gear).
2. Open **API Keys** (in some dashboard versions, these keys are also shown under
   **Connect**).
3. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
4. Copy the **Publishable key**. It is a public project key, often beginning with `sb_publishable_`.
5. Use only the **publishable** key in this guide. Never use a `secret` key, a
   `service_role` key, the database password, or an access token in the web app.

The publishable key is designed to be used by an app, but it is not a password and does
not make private data public: the database Row Level Security rules in Part 4 are what
restrict access. Keep your own account password and database password private.

## Part 3: Add the connection settings to this computer

Open **PowerShell**. You can find it by opening the Windows Start menu and typing
`PowerShell`.

Run:

```powershell
Set-Location E:\RoleFitAi
```

Create your private local settings file. This command does not overwrite an existing file:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Open the file in Notepad:

```powershell
notepad .env.local
```

It contains these three lines:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Fill in the first two values using the Project URL and Publishable key from Part 2. For
example, the shape should look like this (the example values below are fake):

```text
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example_not_a_real_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not include quotes around the values. Do not add spaces before or after the `=` sign.
Save the file and close Notepad.

`.env.local` is excluded from Git by the project settings. **Never paste its contents into
chat, take screenshots of it, or commit it.** The `.env.example` file is safe to share
because its values are blank.

## Part 4: Create the private profile table

This step creates the profile table and the database rules that restrict each account to
its own row.

1. In VS Code, open the folder `E:\RoleFitAi`.
   - If VS Code is already open, choose **File → Open Folder…** and select `E:\RoleFitAi`.
   - If it is not open, you can run `code E:\RoleFitAi` in PowerShell if the `code`
     command is installed. Otherwise, open VS Code from the Start menu and use **File →
     Open Folder…**.
2. In VS Code's file list, open:
   `supabase` → `migrations` →
   `202610100001_create_private_profiles.sql`.
3. Select the entire file with **Ctrl+A**, then copy it with **Ctrl+C**.
4. Go back to the Supabase dashboard tab.
5. Open **SQL Editor**, choose **New query**, click in the query editor, and paste with
   **Ctrl+V**.
6. Check that the query starts with `create table if not exists public.profiles` and ends
   with the profile update policy.
7. Click **Run**.
8. Confirm Supabase reports success and no error.

This migration can safely be run again if you are unsure whether it completed. It creates
the profile table and its owner-only policies. It does **not** create a sample candidate
or sample job listing.

### Part 4b: Create private resume storage

Repeat the same steps with the second file,
`202610100002_create_private_resumes.sql`, in a **new** SQL Editor query. It creates the
private `resumes` storage bucket, the `resumes` table, and owner-only policies. It is also
safe to run again. Afterwards, **Storage** should show a private `resumes` bucket.

### Part 4c: Create job listing tables

Run `202610130001_create_jobs.sql` the same way in another new query. It creates shared
`companies` and `jobs` tables (readable by signed-in users, writable only by the server) and
seeds a starter list of company job boards (Greenhouse, Lever, Ashby public APIs).

To load listings, the sync needs two **server-only** values in `.env.local`:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase **Project Settings → API Keys → secret / service_role** key.
  It bypasses database security: never put it in chat, a public repo, or any `NEXT_PUBLIC_` variable.
- `CRON_SECRET`: any random string of 24+ characters you make up.

Restart `npm run dev`, then run the sync (replace the secret with yours):

```powershell
curl.exe -X POST http://localhost:3000/api/jobs/sync -H "Authorization: Bearer YOUR_CRON_SECRET"
```

The response gives the number of companies and jobs loaded and any boards that failed. Check
**Table Editor → jobs** in Supabase. Work-authorization is `unknown` unless the posting
explicitly mentions sponsorship, visa, or OPT; the quoted sentence is stored as evidence.

### Part 4d: More companies, job feeds, applications, and tailored resumes

Run these in order, each in a **new** SQL Editor query (all are safe to re-run):

1. `202610130002_create_applications.sql`: the private application ledger.
2. `202610130003_more_companies.sql` and `202610130004_many_more_companies.sql`: about 180 verified company boards.
3. `202610130005_add_job_feeds.sql`: the Remotive and Arbeitnow feeds.
4. `202610130006_create_tailored_resumes.sql`: private tailored-resume records.

Then run the sync again. It loads ~25,000 jobs in about a minute. Open **Job matches**,
set a title, a Posted window, and optionally location or keyword.

### Part 4e: Resume tailoring (free, built in)

Tailoring needs **no account, key or subscription**. It runs inside RoleFit:

1. On **Job matches**, pick a resume and click **Tailor my resume**. The app reads your PDF/DOCX,
   moves the skills and bullet points that match the posting to the top, adds a short
   "Applying for ..." summary, and lists posting requirements your resume doesn't show.
   It only rearranges your own words: it never adds skills, jobs or numbers.
2. The PDF appears under **Tailored resumes** as `Company_YourName_Resume.pdf`. Download it for a
   local copy, apply on the employer site, then click **I submitted this application**.

Your resume needs clear headings (Summary, Skills, Experience, Education) with bullet points
under each job, and must be a text-based PDF or DOCX (not a scan). Review each PDF before
sending; at most 20 are generated per day per account.

Optional upgrade: if you later add `ANTHROPIC_API_KEY=...` to `.env.local` (server-only, paid
by usage), the app will use Claude to rewrite wording instead of only rearranging it.

## Part 5: Set local sign-in and email-confirmation addresses

Supabase must allow the app to send an account-confirmation link back to your computer.

1. In Supabase, open **Authentication → URL Configuration**. Dashboard labels can move;
   search dashboard settings for “URL Configuration” if necessary.
2. Set **Site URL** to:
   `http://localhost:3000`
3. Add this exact address to **Redirect URLs**:
   `http://localhost:3000/auth/callback`
4. Save the changes.
5. Open **Authentication → Providers → Email** (or the Email provider's settings).
   Confirm the Email provider is enabled. Leave email confirmation enabled if you want new
   accounts to verify their address before signing in.

Supabase's built-in email sender may have limits or require your own SMTP configuration.
If a confirmation email does not arrive, check spam and the Supabase Auth logs. See
[Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls)
for the current settings and rules.

## Part 6: Start RoleFit on your computer

Return to PowerShell, in the `E:\RoleFitAi` folder. Install the project's packages, then
start the development server:

```powershell
npm install
npm run dev
```

Wait until PowerShell says the server is ready and shows `http://localhost:3000`.
Keep this PowerShell window open while you use the app.

If PowerShell asks whether Node may run or Windows shows a firewall prompt, allow the
normal development server on your private network only if you understand the prompt. You
do not need to open it to the public internet.

In your browser, open:

[http://localhost:3000](http://localhost:3000)

You should see the RoleFit welcome page and enabled account form. If the page still says
the account service is not connected, stop the server with **Ctrl+C**, recheck `.env.local`
for the two Supabase values, and start it again with `npm run dev`.

## Part 7: Create your account and save your profile

1. On the RoleFit welcome page, choose **Create account**.
2. Enter an email address you can access and a new password with at least 12 characters.
   Use a unique password that you do not use on another website.
3. Submit the form.
4. If Supabase asks for email confirmation, open its email and click the confirmation
   link. The link should take you back to `http://localhost:3000/auth/callback`.
5. If you see the RoleFit welcome page after confirming, use **Sign in** with the account
   you just created.
6. The signed-in area should show **Your profile**. Enter a name and any profile
   information you want to save. Use complete `https://…` URLs for LinkedIn and GitHub.
7. Choose **Save private profile**.
8. Refresh the page. The values should remain.
9. Choose **Sign out**, then sign in again and confirm your profile is still there.

For a first test, you can use made-up details. Enter your real candidate data only in your
own Supabase project after you have verified that the RLS migration succeeded.

## Part 8: Verify privacy between accounts

The database rules are intended to keep candidate profiles separate. Before adding real
data, you can do a simple check:

1. Create a second test account using a different email address. A private/incognito
   browser window can be used so it does not share the first account's session.
2. Save a clearly different test name in the second profile.
3. Sign out, close the private window, and sign back in to the first account.
4. Confirm that you see only the first account's profile. The other user's data must not
   appear.

If you ever see another account's profile, stop using the app and do not upload personal
information. Contact the developer before continuing.

## Stop and start the app later

- To stop the server, go to the PowerShell window running `npm run dev` and press
  **Ctrl+C**.
- To start it another day:

  ```powershell
  Set-Location E:\RoleFitAi
  npm run dev
  ```

- Keep `.env.local` on your computer. Do not delete it unless you are ready to enter the
  Supabase settings again.
- Your account and profile live in your Supabase project; they are not stored in a
  fictional browser demo.

## Troubleshooting

### “Account service not connected yet”

Confirm `.env.local` exists in `E:\RoleFitAi`, contains the Supabase Project URL and
Publishable key (with no surrounding quotes), and then stop and restart `npm run dev`.
Never show or send the actual key while asking for help.

### `Invalid API key`, `Invalid JWT`, or authorization error

Confirm that the Project URL and Publishable key come from the same Supabase project. Use
the Publishable key, not a secret key or database password. Restart the development
server after editing `.env.local`.

### The confirmation link says it expired, failed, or returned to the wrong page

Confirm that the Site URL is exactly `http://localhost:3000` and that the allowed Redirect
URL is exactly `http://localhost:3000/auth/callback`. Request a new confirmation email.

### `relation "profiles" does not exist`, profile loading fails, or saving fails

The migration was not applied successfully or was applied to a different Supabase
project. Repeat Part 4 in the project that matches the URL and Publishable key in
`.env.local`. Check the query result in the SQL Editor.

### `localhost:3000` is already in use

Check whether another RoleFit development server is already running. If you choose a
different port, for example `3001`, stop the server, run:

```powershell
npm run dev -- --port 3001
```

Then change `NEXT_PUBLIC_SITE_URL` and Supabase's Site URL and Redirect URL to use
`http://localhost:3001`, stop the server, and start it again. All three locations must
match.

## When local setup works: prepare for a public website

Local setup makes RoleFit usable **only on your computer**. `localhost` is not a public
internet address. Making a public app involves a separate deployment and security review:

1. Create/choose an organization-owned GitHub repository and publish the source code.
   The currently linked `RamyaPvy/RoleFitAi` repository is empty, and this local folder is
   not yet connected to it.
2. Create a hosting project, for example with Vercel, and connect the GitHub repository.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
   `NEXT_PUBLIC_SITE_URL` in the host's encrypted environment-variable settings. For
   `NEXT_PUBLIC_SITE_URL`, use the real `https://…` website address provided by your host.
   Also add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` (server-only; the job sync needs
   them). `vercel.json` already schedules the sync every 6 hours, and Vercel sends
   `CRON_SECRET` automatically as the bearer token. Leave `ANTHROPIC_API_KEY` unset to keep
   the free tailoring engine.
4. In Supabase URL Configuration, use the deployed `https://…` site as the Site URL and
   add the exact deployed address ending in `/auth/callback` to Redirect URLs.
5. Deploy and test registration, email confirmation, sign-in, profile saving, sign-out,
   and the two-account privacy check on the deployed site.
6. Before inviting the public, arrange database backups, account recovery, abuse
   prevention, privacy disclosures and deletion/export procedures, and monitoring.

Do not put private environment files, database passwords, Supabase secret/service-role
keys, employer API keys, or candidate data in a public repository. Do not enable real
candidate registration on a public site until its security, privacy, and operations have
been reviewed.

## Automatic job applications: what remains

Job discovery, per-job resume tailoring, and the application ledger now exist. The app
still has **no** application-submission integration, and it does not claim any application
was submitted: you apply on the employer's site and confirm it in the ledger.

Public job listings do not by themselves allow a third-party service to submit a
candidate's application. Submission keys are controlled by employers or their applicant
tracking systems. RoleFit must first obtain permission from a participating employer, then
build and test that employer's integration. Until then, the app must not claim an
application was submitted. Do not provide job-site passwords or MFA codes to a
third-party automation tool.
