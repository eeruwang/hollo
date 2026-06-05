import { AuthLayout } from "../../components/AuthLayout";
import type { Application } from "../../schema";

interface AuthorizationCodePageProps {
  application: Application;
  code: string;
}

export function AuthorizationCodePage(props: AuthorizationCodePageProps) {
  return (
    <AuthLayout
      title={`${props.application.name} · authorization code`}
      cardSubtitle="grant approved"
      promptCommand="oauth --code"
    >
      <div class="ac-b">
        <div class="field">
          <label>authorization code</label>
          <span class="desc">
            copy this code and paste it into{" "}
            <em class="gn">{props.application.name}</em>.
          </span>
          <pre
            style="margin:9px 0 0; background:var(--bg2); border:1px solid var(--bd); padding:12px; color:var(--fgs); font-family:var(--mono); font-size:13px; user-select:all; word-break:break-all; white-space:pre-wrap;"
          >
            {props.code}
          </pre>
        </div>
      </div>
    </AuthLayout>
  );
}
