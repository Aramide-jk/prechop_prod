import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 8 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasExpectedSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG";
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function POST(request: Request) {
  const privateHeaders = { "Cache-Control": "private, no-store" };
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return NextResponse.json({ error: "Sign in with the approved admin account to upload images." }, { status: 401, headers: privateHeaders });
    }
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin_user");
    if (adminError) {
      return NextResponse.json({ error: "Admin image uploads are not set up yet. Apply the latest admin workspace migration." }, { status: 503, headers: privateHeaders });
    }
    if (!isAdmin) return NextResponse.json({ error: "This account is not approved to upload admin images." }, { status: 403, headers: privateHeaders });

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) return NextResponse.json({ error: "Image uploads need the server-only IMAGEKIT_PRIVATE_KEY in .env.local." }, { status: 503, headers: privateHeaders });

    const form = await request.formData();
    const file = form.get("file");
    const category = form.get("category");
    if (!(file instanceof File) || !(category === "meals" || category === "add-ons")) {
      return NextResponse.json({ error: "Choose a meal or add-on image to upload." }, { status: 400, headers: privateHeaders });
    }
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415, headers: privateHeaders });
    }
    if (file.size < 1 || file.size > maxImageBytes) {
      return NextResponse.json({ error: "Images must be smaller than 8 MB." }, { status: 413, headers: privateHeaders });
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!hasExpectedSignature(bytes, file.type)) {
      return NextResponse.json({ error: "The selected file does not match its image type." }, { status: 415, headers: privateHeaders });
    }

    const baseName = file.name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "menu-image";
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const uploadForm = new FormData();
    uploadForm.set("file", file, `${baseName}.${extension}`);
    uploadForm.set("fileName", `${category}-${baseName}.${extension}`);
    uploadForm.set("folder", `/prechop/${category}`);
    uploadForm.set("useUniqueFileName", "true");
    uploadForm.set("tags", `prechop,${category}`);

    const uploadResponse = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}` },
      body: uploadForm,
      cache: "no-store",
    });
    const result = await uploadResponse.json().catch(() => null) as { url?: string; fileId?: string; message?: string } | null;
    if (!uploadResponse.ok || !result?.url) {
      console.error("ImageKit image upload failed.", uploadResponse.status);
      return NextResponse.json({ error: uploadResponse.status === 401 || uploadResponse.status === 403 ? "ImageKit rejected the server key. Check IMAGEKIT_PRIVATE_KEY." : "ImageKit could not upload this image. Try again." }, { status: 502, headers: privateHeaders });
    }
    return NextResponse.json({ url: result.url, fileId: result.fileId ?? "" }, { headers: privateHeaders });
  } catch (error) {
    console.error("Admin image upload failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "We could not upload that image. Please try again." }, { status: 500, headers: privateHeaders });
  }
}
