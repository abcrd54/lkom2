import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { getEmailLogProgressByRequestId } from "@/lib/email-campaigns";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

const querySchema = z.object({
  requestId: z.string().uuid()
});

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const payload = querySchema.parse({
      requestId: searchParams.get("requestId")
    });
    const progress = await getEmailLogProgressByRequestId(payload.requestId);

    if (!progress) {
      return jsonOk({ progress: null });
    }

    return jsonOk({ progress });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
