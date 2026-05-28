export type MailProvider = "google" | "microsoft";
export type MailAccountStatus = "active" | "reauth_required" | "disabled";
export type UserStatus = "active" | "disabled";

export type MailAccount = {
  id: string;
  provider: MailProvider;
  emailAddress: string;
  status: MailAccountStatus;
  connectedUsers: number;
  lastSyncAt: string;
  subAccounts?: Array<{
    id: string;
    label: string;
    displayEmail: string;
    maxUsers: number;
    connectedUsers: number;
  }>;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  mailAccountId: string | null;
  subMailAccountId: string | null;
  provider: MailProvider | null;
  inboxAddress: string;
  sourceInboxAddress?: string;
  status: UserStatus;
};

export type OtpMessage = {
  id: string;
  mailAccountId: string;
  provider: MailProvider;
  inboxAddress: string;
  sender: string;
  recipient: string;
  subject: string;
  otpCode: string;
  receivedAt: string;
};
