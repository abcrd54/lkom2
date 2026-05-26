import { notFound } from "next/navigation";
import { RedeemAccessPage } from "@/components/redeem-access-page";
import { queryRedeemAccess } from "@/lib/redeem-access";

export default async function RedeemAccessRoute({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await queryRedeemAccess(token);

  if (!result) {
    notFound();
  }

  return <RedeemAccessPage accessToken={token} initialResult={result} />;
}
