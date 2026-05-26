import { buildPreferredUserLink } from "@/lib/access-links";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { getRequestOrigin } from "@/lib/request";
import { listUsers } from "@/lib/users";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const origin = getRequestOrigin(request);
    const users = await listUsers();

    return jsonOk({
      items: users.map((user) => ({
        ...user,
        accessLink: buildPreferredUserLink(origin, user.accessToken, {
          hasInbox: Boolean(user.mailAccountId)
        })
      }))
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
