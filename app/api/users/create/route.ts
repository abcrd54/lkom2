import { buildAbsoluteAccessLink } from "@/lib/access-links";
import { requireAdminSession } from "@/lib/auth";
import { createUser, createUserSchema } from "@/lib/users";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { getRequestOrigin } from "@/lib/request";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createUserSchema.parse(await request.json());
    const user = await createUser(payload);
    const origin = getRequestOrigin(request);

    return jsonOk({
      user,
      accessLink: buildAbsoluteAccessLink(origin, user.accessToken)
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
