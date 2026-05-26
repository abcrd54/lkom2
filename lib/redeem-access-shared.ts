export type ProviderPayload = {
  accountEmail?: string | null;
  activationStatus?: string | null;
  emailCode?: string | null;
  expiresAt?: string | null;
  hasProductFiles?: boolean | null;
  keyCode?: string | null;
  keyStatus?: string | null;
  keyType?: string | null;
  message?: string | null;
  requiresToken?: boolean | null;
  shouldTrack?: boolean | null;
  taskNo?: string | null;
  usedAt?: string | null;
  refreshedEmailCode?: string | null;
} & Record<string, unknown>;

const CHINESE_TEXT_MAP: Record<string, string> = {
  "系统成品号": "Produk sistem",
  "已使用": "Sudah digunakan",
  "未使用": "Belum digunakan",
  "已激活": "Sudah aktif",
  "未激活": "Belum aktif",
  "订阅开通成功": "Langganan berhasil diaktifkan",
  "订阅开通失败": "Langganan gagal diaktifkan",
  "成功": "Berhasil",
  "失败": "Gagal"
};

export type RedeemLookupResult =
  | {
      ok: true;
      queryUrl: string;
      refreshUrl: string | null;
      payload: ProviderPayload | unknown;
      code: string;
      userName: string;
    }
  | {
      ok: false;
      code: string;
      userName: string;
      queryUrl: string | null;
      refreshUrl: string | null;
      errorMessage: string;
      payload?: ProviderPayload | unknown;
    };

export function formatRedeemDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date)} WIB`;
}

export function activationLabel(status: string | null | undefined) {
  if (!status) {
    return "Tidak diketahui";
  }

  if (status === "success") {
    return "Berhasil";
  }

  return translateChineseText(status);
}

export function asProviderPayload(payload: unknown): ProviderPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const nestedData = record.data;

  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as ProviderPayload;
  }

  return payload as ProviderPayload;
}

export function translateChineseText(value: string | null | undefined) {
  if (!value) {
    return value ?? "";
  }

  return CHINESE_TEXT_MAP[value] ?? value;
}
