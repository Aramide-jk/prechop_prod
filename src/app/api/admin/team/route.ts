import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatNigerianPhone } from "@/lib/notifications";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status, headers });
}

async function getAdminClient() {
  const userClient = await getSupabaseServerClient();
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return { response: errorResponse("Sign in with the admin account to continue.", 401, "signed_out") };
  }
  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin_user");
  if (adminErr || !isAdmin) {
    return { response: errorResponse("This account is not approved for PreChop admin operations.", 403, "not_admin") };
  }
  const adminClient = getSupabaseAdminClient();
  return { supabase: adminClient, userId: data.user.id };
}

type TeamRow = {
  id: string;
  user_id: string | null;
  phone_e164: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at?: string;
};

export async function GET() {
  try {
    const client = await getAdminClient();
    if ("response" in client) return client.response;

    let teamRows: TeamRow[] = [];
    let isLegacySchema = false;

    // 1. Try modern schema (id, phone_e164, role, etc.)
    const fullResult = await client.supabase
      .from("admin_users")
      .select("id, user_id, phone_e164, full_name, role, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (fullResult.error) {
      // Check for code 42703 (undefined column) or missing id column in legacy schema
      if (
        fullResult.error.code === "42703" ||
        fullResult.error.message?.includes("does not exist") ||
        fullResult.error.message?.includes("id")
      ) {
        isLegacySchema = true;
        const legacyResult = await client.supabase
          .from("admin_users")
          .select("user_id, created_at")
          .order("created_at", { ascending: true });

        if (legacyResult.error) {
          console.error("Failed to load legacy admin_users:", legacyResult.error);
          return errorResponse("Could not load admin team members.", 500);
        }

        teamRows = (legacyResult.data ?? []).map((r) => ({
          id: r.user_id,
          user_id: r.user_id,
          phone_e164: null,
          full_name: null,
          role: "super_admin",
          created_at: r.created_at,
        }));
      } else {
        console.error("Failed to load admin_users:", fullResult.error);
        return errorResponse("Could not load admin team members.", 500);
      }
    } else {
      teamRows = (fullResult.data ?? []).map((r) => ({
        id: r.id || r.user_id,
        user_id: r.user_id,
        phone_e164: r.phone_e164,
        full_name: r.full_name,
        role: r.role || "super_admin",
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    }

    // 2. Collect linked user_ids to cross-reference with profiles
    const userIds = teamRows.map((r) => r.user_id).filter(Boolean) as string[];
    let profilesById = new Map<string, { full_name: string; phone_e164: string }>();

    if (userIds.length > 0) {
      const { data: profiles } = await client.supabase
        .from("profiles")
        .select("id, full_name, phone_e164")
        .in("id", userIds);

      profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    const members = teamRows.map((row) => {
      const profile = row.user_id ? profilesById.get(row.user_id) : null;
      const rawPhone = row.phone_e164 || profile?.phone_e164 || "";
      const phone = rawPhone ? formatNigerianPhone(rawPhone) : "Unknown phone";
      const name = row.full_name || profile?.full_name || (row.user_id === client.userId ? "Primary Admin" : "Admin Member");
      const isCurrentUser = row.user_id === client.userId;

      return {
        id: row.id,
        userId: row.user_id,
        phone,
        name,
        role: row.role || "super_admin",
        status: row.user_id ? "active" : "pending_signin",
        createdAt: row.created_at,
        isCurrentUser,
      };
    });

    return NextResponse.json(
      {
        currentUserId: client.userId,
        members,
        isLegacySchema,
      },
      { headers }
    );
  } catch (error) {
    console.error("Admin team GET failed:", error);
    return errorResponse("Failed to load admin team.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const client = await getAdminClient();
    if ("response" in client) return client.response;

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      name?: string;
      role?: string;
    };

    const rawPhone = String(body.phone ?? "").trim();
    if (!rawPhone) {
      return errorResponse("Enter an 11-digit Nigerian phone number (e.g., 0803 123 4567).", 400);
    }

    const formattedPhone = formatNigerianPhone(rawPhone);
    if (!/^\+234[789]\d{9}$/.test(formattedPhone)) {
      return errorResponse("Please enter a valid Nigerian mobile phone number.", 400);
    }

    const cleanName = String(body.name ?? "").trim() || "Admin Member";
    const allowedRoles = ["super_admin", "kitchen_manager", "dispatch_lead"];
    const role = allowedRoles.includes(body.role ?? "") ? (body.role as string) : "super_admin";

    // Check if user has already signed in on PreChop (exists in profiles)
    const { data: existingProfile } = await client.supabase
      .from("profiles")
      .select("id, full_name, phone_e164")
      .eq("phone_e164", formattedPhone)
      .maybeSingle();

    // Check if phone or profile is already an admin
    if (existingProfile?.id) {
      const { data: alreadyAdmin } = await client.supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", existingProfile.id)
        .maybeSingle();

      if (alreadyAdmin) {
        return errorResponse("This phone number is already an authorized admin.", 409, "already_admin");
      }
    }

    // Attempt insert with modern schema
    const insertPayload = {
      phone_e164: formattedPhone,
      full_name: cleanName,
      user_id: existingProfile?.id || null,
      role,
    };

    const modernInsert = await client.supabase
      .from("admin_users")
      .insert(insertPayload)
      .select("id, user_id, phone_e164, full_name, role, created_at")
      .maybeSingle();

    if (modernInsert.error) {
      // If column id, phone_e164, or nullable user_id does not exist, use legacy insert
      if (
        modernInsert.error.code === "42703" ||
        modernInsert.error.message?.includes("does not exist") ||
        modernInsert.error.message?.includes("null value in column \"user_id\"")
      ) {
        if (!existingProfile?.id) {
          return errorResponse(
            "This phone number has not created a PreChop profile yet. Either have them sign in to PreChop once with their phone, or execute the SQL migration in your Supabase SQL Editor to allow pre-approving unregistered numbers.",
            400,
            "migration_required_for_unregistered_phone"
          );
        }

        const legacyInsert = await client.supabase
          .from("admin_users")
          .insert({ user_id: existingProfile.id })
          .select("user_id, created_at")
          .single();

        if (legacyInsert.error) {
          if (legacyInsert.error.code === "23505") {
            return errorResponse("This phone number is already an authorized admin.", 409, "already_admin");
          }
          console.error("Failed to legacy-insert admin_user:", legacyInsert.error);
          return errorResponse(legacyInsert.error.message || "Could not add admin member.", 500);
        }

        // Audit log
        try {
          await client.supabase.from("admin_audit_logs").insert({
            category: "auth",
            action: "add_admin_member",
            details: `Granted admin access to ${formattedPhone} (${cleanName}).`,
            metadata: { phone: formattedPhone, userId: existingProfile.id },
          });
        } catch {
          // Non-fatal
        }

        return NextResponse.json(
          {
            success: true,
            member: {
              id: legacyInsert.data.user_id,
              userId: legacyInsert.data.user_id,
              phone: formattedPhone,
              name: cleanName,
              role: "super_admin",
              status: "active",
              createdAt: legacyInsert.data.created_at,
              isCurrentUser: legacyInsert.data.user_id === client.userId,
            },
          },
          { headers }
        );
      }

      console.error("Failed to insert admin_user:", modernInsert.error);
      return errorResponse(modernInsert.error.message || "Could not add admin member.", 500);
    }

    const newAdmin = modernInsert.data;
    if (!newAdmin) {
      return errorResponse("Could not add admin member.", 500);
    }

    // Audit log
    try {
      await client.supabase.from("admin_audit_logs").insert({
        category: "auth",
        action: "add_admin_member",
        details: `Granted admin access (${role}) to ${formattedPhone} (${cleanName}).`,
        metadata: { phone: formattedPhone, role, linkedUserId: existingProfile?.id },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json(
      {
        success: true,
        member: {
          id: newAdmin.id,
          userId: newAdmin.user_id,
          phone: newAdmin.phone_e164 || formattedPhone,
          name: newAdmin.full_name || cleanName,
          role: newAdmin.role || role,
          status: newAdmin.user_id ? "active" : "pending_signin",
          createdAt: newAdmin.created_at,
          isCurrentUser: newAdmin.user_id === client.userId,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error("Admin team POST failed:", error);
    return errorResponse("Failed to add admin team member.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const client = await getAdminClient();
    if ("response" in client) return client.response;

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("id");

    if (!memberId || !uuidRegex.test(memberId)) {
      return errorResponse("Invalid admin member ID.", 400);
    }

    // 1. Lockout protection: count total admins using user_id which exists in both schemas
    const { count, error: countErr } = await client.supabase
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });

    if (countErr) {
      console.error("Failed to count admin_users:", countErr);
      return errorResponse("Could not verify admin team status.", 500);
    }

    if ((count ?? 0) <= 1) {
      return errorResponse(
        "Cannot remove the only remaining admin account. Add a new admin phone number first to prevent locking out the system.",
        400,
        "cannot_remove_sole_admin"
      );
    }

    // 2. Try delete by id first, fallback to user_id for legacy schema
    let deleteResult = await client.supabase
      .from("admin_users")
      .delete()
      .eq("id", memberId);

    if (
      deleteResult.error &&
      (deleteResult.error.code === "42703" ||
        deleteResult.error.message?.includes("does not exist") ||
        deleteResult.error.message?.includes("id"))
    ) {
      deleteResult = await client.supabase
        .from("admin_users")
        .delete()
        .eq("user_id", memberId);
    }

    if (deleteResult.error) {
      console.error("Failed to delete admin_user:", deleteResult.error);
      return errorResponse("Could not remove admin member.", 500);
    }

    // 3. Log to admin audit log
    try {
      await client.supabase.from("admin_audit_logs").insert({
        category: "auth",
        action: "remove_admin_member",
        details: `Revoked admin access for member ID ${memberId}.`,
        metadata: { memberId },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true, removedId: memberId }, { headers });
  } catch (error) {
    console.error("Admin team DELETE failed:", error);
    return errorResponse("Failed to remove admin team member.", 500);
  }
}
