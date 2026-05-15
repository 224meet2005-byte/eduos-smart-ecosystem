import { useState } from "react";
import { Copy, Check, Printer, Download, ShieldAlert } from "lucide-react";
import type { StudentAdmissionCredentials } from "@/types";
import {
  copyToClipboard,
  downloadCredentialsFile,
  formatCredentialsText,
  printCredentials,
} from "@/modules/students/utils/credentialsExport";

interface StudentCredentialsCardProps {
  studentName: string;
  credentials: StudentAdmissionCredentials;
}

function CredentialRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!(await copyToClipboard(value))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-sm font-semibold text-foreground break-all ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function StudentCredentialsCard({ studentName, credentials }: StudentCredentialsCardProps) {
  const [allCopied, setAllCopied] = useState(false);

  return (
    <div className="w-full max-w-lg rounded-xl border border-primary/20 bg-card text-left shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-base font-semibold text-foreground">Student credentials</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Share with {studentName}. Shown once — not stored in plain text.
        </p>
      </div>
      <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 sm:px-5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Sign in with the <strong>sign-in email</strong> and <strong>temporary password</strong> below.
        </p>
      </div>
      <div className="space-y-2 p-4 sm:p-5">
        <CredentialRow label="Login ID" value={credentials.login_id} />
        <CredentialRow label="Sign-in email" value={credentials.generated_email} />
        <CredentialRow label="Temporary password" value={credentials.temporary_password} />
        <CredentialRow label="Admission number" value={credentials.admission_no} mono={false} />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={async () => {
            if (await copyToClipboard(formatCredentialsText(studentName, credentials))) {
              setAllCopied(true);
              window.setTimeout(() => setAllCopied(false), 2000);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          {allCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {allCopied ? "Copied all" : "Copy all"}
        </button>
        <button
          type="button"
          onClick={() => printCredentials(studentName, credentials)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Save PDF
        </button>
        <button
          type="button"
          onClick={() => downloadCredentialsFile(studentName, credentials)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
    </div>
  );
}