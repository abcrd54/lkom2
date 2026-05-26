import { requireAdminSession } from "@/lib/auth";
import { deleteUser, deleteUserSchema } from "@/lib/users";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = deleteUserSchema.parse(await request.json());
    const result = await deleteUser(payload);

    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
