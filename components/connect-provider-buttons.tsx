"use client";

const POPUP_FEATURES =
  "popup=yes,width=720,height=820,left=120,top=80,resizable=yes,scrollbars=yes";

type ConnectProviderButtonsProps = {
  provider: "google" | "microsoft";
  label: string;
  secondary?: boolean;
};

export function ConnectProviderButton({
  provider,
  label,
  secondary = false
}: ConnectProviderButtonsProps) {
  const className = secondary ? "button secondary" : "button";

  function handleClick() {
    const popupName =
      provider === "microsoft" ? `${provider}-oauth-${Date.now()}` : `${provider}-oauth`;
    const popupFeatures =
      provider === "microsoft"
        ? `${POPUP_FEATURES},noopener=yes,noreferrer=yes`
        : POPUP_FEATURES;

    window.open(`/api/providers/${provider}/connect`, popupName, popupFeatures);
  }

  return (
    <button className={className} type="button" onClick={handleClick}>
      {label}
    </button>
  );
}
