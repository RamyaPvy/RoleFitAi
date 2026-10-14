"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
};

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(12, "Use at least 12 characters for your password.").max(72),
});

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!credentials.success) {
    return { error: credentials.error.issues[0]?.message ?? "Check your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);
  if (error)
    return { error: "Unable to sign in with those details. Please check them and try again." };

  redirect("/dashboard");
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!credentials.success) {
    return { error: credentials.error.issues[0]?.message ?? "Check your email and password." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: "Set NEXT_PUBLIC_SITE_URL before enabling account registration." };
  }

  const { data, error } = await supabase.auth.signUp({
    ...credentials.data,
    options: { emailRedirectTo: new URL("/auth/callback", siteUrl).toString() },
  });

  if (error)
    return { error: "Unable to create an account. Check the email address or try again later." };
  if (data.session) redirect("/dashboard");

  return { message: "Check your email for a confirmation link to finish creating your account." };
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Unable to sign out. Please try again.");
  redirect("/");
}

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
  phone: z.string().trim().max(60),
  location: z.string().trim().max(120),
  linkedinUrl: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.url().max(250)])),
  githubUrl: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.url().max(250)])),
  currentRole: z.string().trim().max(160),
  experienceYears: z.number().int().min(0).max(80).nullable(),
  skills: z.array(z.string().min(1).max(80)).max(60),
  summary: z.string().trim().max(4000),
  experience: z.string().trim().max(20000),
});

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_RESUMES_PER_USER = 10;
const RESUME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

function hasValidSignature(extension: keyof typeof RESUME_TYPES, bytes: Uint8Array) {
  const signature = extension === "pdf" ? [0x25, 0x50, 0x44, 0x46] : [0x50, 0x4b, 0x03, 0x04];
  return signature.every((byte, index) => bytes[index] === byte);
}

export async function uploadResumeAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Your session has ended. Sign in again to upload." };

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or DOCX file." };
  if (file.size > MAX_RESUME_BYTES) return { error: "Resumes must be 5 MB or smaller." };

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") {
    return { error: "Only PDF and DOCX resumes are supported." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(extension, bytes)) {
    return { error: "That file doesn't look like a valid PDF or DOCX document." };
  }

  const { count, error: countError } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true });
  if (countError) return { error: "We couldn't check your saved resumes. Try again." };
  if ((count ?? 0) >= MAX_RESUMES_PER_USER) {
    return { error: "You can store up to 10 resumes. Delete one before uploading another." };
  }

  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const contentType = RESUME_TYPES[extension];
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error("RoleFit resume upload failed.", { message: uploadError.message });
    return { error: "We couldn't upload your resume. Check the database setup and try again." };
  }

  const { error: insertError } = await supabase.from("resumes").insert({
    user_id: user.id,
    file_name: file.name.replace(/[\r\n]/g, " ").slice(0, 200),
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: file.size,
  });
  if (insertError) {
    await supabase.storage.from("resumes").remove([storagePath]);
    console.error("RoleFit resume record failed.", { code: insertError.code });
    return { error: "We couldn't save your resume record. Try again." };
  }

  revalidatePath("/dashboard");
  return { message: "Resume uploaded privately to your account." };
}

export async function deleteResumeAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) return;

  const { data: resume } = await supabase
    .from("resumes")
    .select("storage_path")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!resume) return;

  const { error: removeError } = await supabase.storage
    .from("resumes")
    .remove([resume.storage_path]);
  if (removeError) {
    console.error("RoleFit resume file delete failed.", { message: removeError.message });
    return;
  }
  await supabase.from("resumes").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/dashboard");
}

export async function saveProfileAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return { error: "Your session has ended. Sign in again to save your profile." };

  const yearsValue = String(formData.get("experienceYears") ?? "").trim();
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const parsed = profileSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    location: String(formData.get("location") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    githubUrl: String(formData.get("githubUrl") ?? ""),
    currentRole: String(formData.get("currentRole") ?? ""),
    experienceYears: yearsValue === "" ? null : Number(yearsValue),
    skills,
    summary: String(formData.get("summary") ?? ""),
    experience: String(formData.get("experience") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please review your profile details." };
  }

  const profile = parsed.data;
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    full_name: profile.fullName,
    phone: profile.phone || null,
    location: profile.location || null,
    linkedin_url: profile.linkedinUrl || null,
    github_url: profile.githubUrl || null,
    current_role: profile.currentRole || null,
    experience_years: profile.experienceYears,
    skills: profile.skills,
    summary: profile.summary || null,
    experience: profile.experience || null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("RoleFit profile save failed.", { code: error.code });
    return { error: "We couldn't save your profile. Check the database setup and try again." };
  }

  return { message: "Profile saved privately to your account." };
}
