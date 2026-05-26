import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const createRedeemCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(120)
});

export const bulkImportRedeemCodesSchema = z.object({
  codes: z.array(z.string().trim().min(3).max(120)).min(1).max(500)
});

export const assignRedeemCodeUserSchema = z.object({
  redeemCodeId: z.string().uuid(),
  userId: z.string().uuid()
});

export const unassignRedeemCodeUserSchema = z.object({
  redeemCodeUserId: z.string().uuid()
});

type RedeemCodeRow = {
  id: string;
  code: string;
  created_at: string;
  updated_at: string;
  redeem_code_users?:
    | Array<{
        id: string;
        user_id: string;
        assigned_at: string;
        users?:
          | {
              id: string;
              name: string;
              phone_number: string;
              status: "active" | "disabled";
            }
          | Array<{
              id: string;
              name: string;
              phone_number: string;
              status: "active" | "disabled";
            }>
          | null;
      }>
    | null;
};

function normalizeRedeemCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function mapRedeemCodeRow(row: RedeemCodeRow) {
  const assignments =
    row.redeem_code_users?.map((assignment) => {
      const user = Array.isArray(assignment.users)
        ? (assignment.users[0] ?? null)
        : assignment.users ?? null;

      return {
        id: assignment.id,
        userId: assignment.user_id,
        assignedAt: assignment.assigned_at,
        user: user
          ? {
              id: user.id,
              name: user.name,
              phoneNumber: user.phone_number,
              status: user.status
            }
          : null
      };
    }) ?? [];

  return {
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignments,
    usedSlots: assignments.length,
    remainingSlots: Math.max(0, 3 - assignments.length)
  };
}

export async function listRedeemCodes() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("redeem_codes")
    .select(
      "id, code, created_at, updated_at, redeem_code_users(id, user_id, assigned_at, users(id, name, phone_number, status))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RedeemCodeRow[]).map(mapRedeemCodeRow);
}

export async function createRedeemCode(input: z.infer<typeof createRedeemCodeSchema>) {
  const supabase = createSupabaseAdminClient();
  const normalizedCode = normalizeRedeemCode(input.code);
  const { data, error } = await supabase
    .from("redeem_codes")
    .insert({
      code: normalizedCode
    })
    .select("id, code, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    code: data.code,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

export async function bulkImportRedeemCodes(input: z.infer<typeof bulkImportRedeemCodesSchema>) {
  const supabase = createSupabaseAdminClient();
  const normalizedCodes = Array.from(
    new Set(input.codes.map(normalizeRedeemCode).filter(Boolean))
  );

  const failed: Array<{ code: string; reason: string }> = [];
  let successCount = 0;

  for (const code of normalizedCodes) {
    const { error } = await supabase.from("redeem_codes").insert({ code });

    if (error) {
      failed.push({
        code,
        reason: error.message
      });
      continue;
    }

    successCount += 1;
  }

  return {
    successCount,
    failed
  };
}

async function assertAssignableUser(userId: string) {
  const supabase = createSupabaseAdminClient();
  const [{ data, error }, assignmentResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("redeem_code_users")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
  ]);

  if (error) {
    throw error;
  }

  if (assignmentResult.error) {
    throw assignmentResult.error;
  }

  if (!data) {
    throw new Error("Selected user was not found.");
  }

  if (data.status !== "active") {
    throw new Error("Selected user is disabled.");
  }

  if ((assignmentResult.count ?? 0) > 0) {
    throw new Error("Selected user already has a redeem code.");
  }
}

export async function assignUserToRedeemCode(input: z.infer<typeof assignRedeemCodeUserSchema>) {
  await assertAssignableUser(input.userId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("redeem_code_users")
    .insert({
      redeem_code_id: input.redeemCodeId,
      user_id: input.userId
    })
    .select("id, redeem_code_id, user_id, assigned_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    redeemCodeId: data.redeem_code_id,
    userId: data.user_id,
    assignedAt: data.assigned_at
  };
}

export async function unassignUserFromRedeemCode(
  input: z.infer<typeof unassignRedeemCodeUserSchema>
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("redeem_code_users")
    .delete()
    .eq("id", input.redeemCodeUserId);

  if (error) {
    throw error;
  }

  return {
    deleted: true
  };
}
