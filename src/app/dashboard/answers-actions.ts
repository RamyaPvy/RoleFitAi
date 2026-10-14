"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const yesNo = z.union([z.literal("yes"), z.literal("no"), z.literal("")]);
const text = (max: number) => z.string().trim().max(max);

const answersSchema = z.object({
  country: text(80),
  authorizedToWork: yesNo,
  needsSponsorship: yesNo,
  openToRelocate: yesNo,
  howHeard: text(200),
  noticePeriod: text(120),
  salaryExpectation: text(120),
});

export async function saveAnswersAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = answersSchema.safeParse({
    country: String(formData.get("country") ?? ""),
    authorizedToWork: String(formData.get("authorizedToWork") ?? ""),
    needsSponsorship: String(formData.get("needsSponsorship") ?? ""),
    openToRelocate: String(formData.get("openToRelocate") ?? ""),
    howHeard: String(formData.get("howHeard") ?? ""),
    noticePeriod: String(formData.get("noticePeriod") ?? ""),
    salaryExpectation: String(formData.get("salaryExpectation") ?? ""),
  });
  if (!parsed.success) redirect("/dashboard?answers=invalid#answers");

  const a = parsed.data;
  const { error } = await supabase.from("application_answers").upsert({
    user_id: user.id,
    country: a.country || null,
    authorized_to_work: a.authorizedToWork || null,
    needs_sponsorship: a.needsSponsorship || null,
    open_to_relocate: a.openToRelocate || null,
    how_heard: a.howHeard || null,
    notice_period: a.noticePeriod || null,
    salary_expectation: a.salaryExpectation || null,
    updated_at: new Date().toISOString(),
  });
  if (error) redirect("/dashboard?answers=failed#answers");

  revalidatePath("/dashboard");
  redirect("/dashboard?answers=saved#answers");
}
