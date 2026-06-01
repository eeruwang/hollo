import type { PostVisibility, ThemeColor } from "../schema.ts";
import { AccountForm } from "./AccountForm.tsx";
import { DashboardLayout } from "./DashboardLayout.tsx";

export interface NewAccountPageProps {
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
    discoverable?: boolean;
    expandSpoilers?: boolean;
    language?: string;
    visibility?: PostVisibility;
    themeColor?: ThemeColor;
    news?: boolean;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    fields?: Array<{ name: string; value: string }>;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
    avatar?: string;
    header?: string;
  };
  officialAccount: string;
  host: string;
}

export function NewAccountPage(props: NewAccountPageProps) {
  return (
    <DashboardLayout title="Hollo: New account" selectedMenu="accounts">
      <hgroup>
        <h1>Create a new account</h1>
        <p>You can create a new account by filling out the form below.</p>
      </hgroup>
      <AccountForm
        action="/accounts"
        values={props.values}
        errors={props.errors}
        submitLabel="Create a new account"
        officialAccount={props.officialAccount}
        host={props.host}
      />
    </DashboardLayout>
  );
}
