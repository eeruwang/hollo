import { PublicShellLayout } from "../../components/PublicShellLayout";
import type { Application } from "../../schema";

interface AuthorizationCodePageProps {
  application: Application;
  code: string;
}

export function AuthorizationCodePage(props: AuthorizationCodePageProps) {
  return (
    <PublicShellLayout
      title="~/oauth · authorization code"
      shellPath="oauth/code"
      shellStatus="grant approved"
      shellContext={`oauth · ${props.application.name}`}
    >
      <div class="cmdline">
        <span class="u">hollo</span>:~$ <span class="cmd">oauth</span>{" "}
        <span class="arg">--code</span>
      </div>
      <h2 class="h-sec">Authorization code</h2>
      <p class="muted" style="margin-bottom:14px;">
        Copy this code and paste it into{" "}
        <em class="gn">{props.application.name}</em>.
      </p>
      <pre
        style="background:var(--bg2); border:1px solid var(--bd); padding:14px; color:var(--fgs); font-family:var(--mono); font-size:13.5px; user-select:all; word-break:break-all; white-space:pre-wrap; max-width:560px;"
      >
        {props.code}
      </pre>
    </PublicShellLayout>
  );
}
