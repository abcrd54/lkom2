"use client";

import { useEffect, useState } from "react";
import {
  asProviderPayload,
  type RedeemLookupResult
} from "@/lib/redeem-access-shared";

export function RedeemAccessPage({
  accessToken,
  initialResult
}: {
  accessToken: string;
  initialResult: RedeemLookupResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const providerPayload = result.ok ? asProviderPayload(result.payload) : null;

  async function handleRefreshOtp() {
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      const response = await fetch(`/api/access/${accessToken}/redeem?refreshOtp=1`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok || !payload?.data) {
        throw new Error(payload?.error ?? "Gagal memperbarui OTP.");
      }

      setResult(payload.data as RedeemLookupResult);
      setRefreshMessage("OTP berhasil diperbarui.");
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : "Gagal memperbarui OTP.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!result.ok || !providerPayload?.accountEmail) {
      return;
    }

    const interval = window.setInterval(() => {
      void handleRefreshOtp();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [accessToken, result.ok, providerPayload?.accountEmail]);

  return (
    <section className="redeem-access-shell">
      <div className="redeem-access-card">
        <span className="user-access-kicker">Akses Redeem</span>
        <h1 className="redeem-access-title">{result.userName}</h1>
        <p className="user-access-copy">
          Hasil redeem ditampilkan dari <strong>mail.lkom.cloud</strong> agar lebih mudah dibaca.
        </p>

        <div className="redeem-access-meta">
          <div className="user-summary-card">
            <span className="user-summary-label">Kode Redeem</span>
            <strong>{result.code}</strong>
          </div>
          <div className="user-summary-card">
            <span className="user-summary-label">Status</span>
            <strong>{result.ok ? "Siap" : "Tidak tersedia"}</strong>
          </div>
        </div>

        {result.ok && providerPayload?.accountEmail ? (
          <div className="button-row">
            <button className="button" disabled={isRefreshing} onClick={handleRefreshOtp} type="button">
              {isRefreshing ? "Memperbarui OTP..." : "Refresh OTP"}
            </button>
            <p className="micro">Auto refresh tiap 10 detik.</p>
            {refreshMessage ? <p className="micro">{refreshMessage}</p> : null}
          </div>
        ) : refreshMessage ? (
          <p className="micro">{refreshMessage}</p>
        ) : null}

        {!result.ok ? (
          <div className="redeem-provider-panel error">
            <strong>{result.errorMessage}</strong>
            {result.queryUrl ? <p className="micro">Sumber: {result.queryUrl}</p> : null}
            {"payload" in result && result.payload ? (
              <details className="redeem-raw-json" open>
                <summary>Lihat JSON mentah</summary>
                <pre className="redeem-provider-json">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <>
            {providerPayload ? (
              <div className="redeem-result-grid">
                <div className="user-summary-card">
                  <span className="user-summary-label">Email Akun</span>
                  <strong>{providerPayload.accountEmail ?? "-"}</strong>
                </div>
                <div className="user-summary-card">
                  <span className="user-summary-label">Kode OTP Email</span>
                  <strong>{providerPayload.emailCode ?? "-"}</strong>
                </div>
              </div>
            ) : null}

            <div className="redeem-provider-panel">
              <div className="redeem-provider-head">
                <span className="micro">{result.queryUrl}</span>
              </div>

              <details className="redeem-raw-json">
                <summary>Lihat JSON mentah</summary>
                <pre className="redeem-provider-json">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </details>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
