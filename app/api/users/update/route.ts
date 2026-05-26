import { buildAbsoluteAccessLink } from "@/lib/access-links";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { getRequestOrigin } from "@/lib/request";
import { updateUser, updateUserSchema } from "@/lib/users";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = updateUserSchema.parse(await request.json());
    const user = await updateUser(payload);
    const origin = getRequestOrigin(request);

    return jsonOk({
      user,
      accessLink: buildAbsoluteAccessLink(origin, user.accessToken)
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
