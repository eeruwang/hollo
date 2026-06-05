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
    <DashboardLayout
      title="~/accounts/new · Hollo"
      selectedMenu="accounts"
      shellPath="accounts/new"
      shellStatus="new account"
    >
      <div class="cmdline">
        <span class="u">root@hollo</span>:~${" "}
        <span class="cmd">account create</span>{" "}
        <span class="arg">--new</span>
      </div>
      <AccountForm
        action="/accounts"
        values={props.values}
        errors={props.errors}
        submitLabel="create account"
        officialAccount={props.officialAccount}
        host={props.host}
      />
    </DashboardLayout>
  );
}
