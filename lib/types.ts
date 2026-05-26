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
};

export type ManagedUser = {
  id: string;
  name: string;
  phoneNumber: string;
  mailAccountId: string;
  provider: MailProvider;
  inboxAddress: string;
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
