import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getRedeemCodeForUser } from "@/lib/redeem-codes";
import { getUserByAccessToken } from "@/lib/users";

type RedeemLookupResult =
  | {
      ok: true;
      queryUrl: string;
      payload: unknown;
      code: string;
      userName: string;
    }
  | {
      ok: false;
      code: string;
      userName: string;
      queryUrl: string | null;
      errorMessage: string;
      payload?: unknown;
    };

function buildRedeemQueryUrl(code: string) {
  const template =
    env.REDEEM_QUERY_URL_TEMPLATE ??
    "https://gptplus.lol/api/exchange/query?keyword={code}";

  if (template.includes("{code}")) {
    return template.replace("{code}", encodeURIComponent(code));
  }

  const url = new URL(template);
  url.searchParams.set("keyword", code);
  return url.toString();
}

async function queryRedeemApi(token: string): Promise<RedeemLookupResult | null> {
  const user = await getUserByAccessToken(token);

  if (!user || user.status !== "active") {
    return null;
  }

  const code = await getRedeemCodeForUser(user.id);

  if (!code) {
    return {
      ok: false,
      code: "-",
      userName: user.name,
      queryUrl: null,
      errorMessage: "Redeem code is not assigned for this user yet."
    };
  }

  const queryUrl = buildRedeemQueryUrl(code);

  try {
    const response = await fetch(queryUrl, {
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.8"
      }
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text();
    }

    if (!response.ok) {
      return {
        ok: false,
        code,
        userName: user.name,
        queryUrl,
        errorMessage: "Redeem provider returned an error response.",
        payload
      };
    }

    return {
      ok: true,
      code,
      userName: user.name,
      queryUrl,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      code,
      userName: user.name,
      queryUrl,
      errorMessage: error instanceof Error ? error.message : "Failed to reach redeem provider."
    };
  }
}

export default async function RedeemAccessPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await queryRedeemApi(token);

  if (!result) {
    notFound();
  }

  return (
    <section className="redeem-access-shell">
      <div className="redeem-access-card">
        <span className="user-access-kicker">Redeem Access</span>
        <h1 className="redeem-access-title">{result.userName}</h1>
        <p className="user-access-copy">
          Redeem code lookup handled from <strong>mail.lkom.cloud</strong>.
        </p>

        <div className="redeem-access-meta">
          <div className="user-summary-card">
            <span className="user-summary-label">Redeem Code</span>
            <strong>{result.code}</strong>
          </div>
          <div className="user-summary-card">
            <span className="user-summary-label">Status</span>
            <strong>{result.ok ? "Fetched" : "Unavailable"}</strong>
          </div>
        </div>

        {!result.ok ? (
          <div className="redeem-provider-panel error">
            <strong>{result.errorMessage}</strong>
            {result.queryUrl ? <p className="micro">Source: {result.queryUrl}</p> : null}
            {"payload" in result && result.payload ? (
              <pre className="redeem-provider-json">
                {JSON.stringify(result.payload, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : (
          <div className="redeem-provider-panel">
            <div className="redeem-provider-head">
              <strong>Provider Response</strong>
              <span className="micro">{result.queryUrl}</span>
            </div>
            <pre className="redeem-provider-json">
              {JSON.stringify(result.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
