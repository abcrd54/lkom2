import { buildPreferredUserLink } from "@/lib/access-links";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { getRequestOrigin } from "@/lib/request";
import { regenerateLinkSchema, regenerateUserAccessLink } from "@/lib/users";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = regenerateLinkSchema.parse(await request.json());
    const user = await regenerateUserAccessLink(payload);
    const origin = getRequestOrigin(request);

    return jsonOk({
      user,
      accessLink: buildPreferredUserLink(origin, user.accessToken, {
        hasInbox: Boolean(user.mailAccountId)
      })
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
