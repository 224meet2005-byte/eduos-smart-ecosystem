import type { StudentAdmissionCredentials } from "@/types";

export function formatCredentialsText(
  studentName: string,
  credentials: StudentAdmissionCredentials,
): string {
  return [
    "EduOS — Student Login Credentials",
    "================================",
    "",
    `Student: ${studentName}`,
    `Admission No: ${credentials.admission_no}`,
    "",
    `Login ID: ${credentials.login_id}`,
    `Sign-in Email: ${credentials.generated_email}`,
    `Temporary Password: ${credentials.temporary_password}`,
    "",
    "Sign in at your institute EduOS portal using the email and password above.",
    "Change your password after first login.",
    "",
    "CONFIDENTIAL — Share securely with the student or guardian only.",
  ].join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadCredentialsFile(studentName: string, credentials: StudentAdmissionCredentials) {
  const body = formatCredentialsText(studentName, credentials);
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `eduos-credentials-${credentials.login_id}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printCredentials(studentName: string, credentials: StudentAdmissionCredentials) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Student Credentials — ${credentials.login_id}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .muted { color: #555; font-size: 0.875rem; }
    table { border-collapse: collapse; margin-top: 1.5rem; width: 100%; max-width: 32rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; }
    th { width: 40%; font-weight: 600; }
    code { font-family: ui-monospace, monospace; }
    .warn { margin-top: 2rem; font-size: 0.75rem; color: #666; }
  </style>
</head>
<body>
  <h1>Student Login Credentials</h1>
  <p class="muted">${studentName} · Admission ${credentials.admission_no}</p>
  <table>
    <tr><th>Login ID</th><td><code>${credentials.login_id}</code></td></tr>
    <tr><th>Sign-in email</th><td><code>${credentials.generated_email}</code></td></tr>
    <tr><th>Temporary password</th><td><code>${credentials.temporary_password}</code></td></tr>
  </table>
  <p class="warn">Confidential — shown once at admission. Student signs in with the email and password above.</p>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=640,height=720");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
