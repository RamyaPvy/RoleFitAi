import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: tailored } = await supabase
    .from("tailored_resumes")
    .select("storage_path, file_name")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tailored) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(tailored.storage_path, 60, { download: tailored.file_name });
  if (error || !data) return new NextResponse("Unable to download", { status: 500 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
