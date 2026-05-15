// ---------------------------------------------------------------------------
// EduOS — Services barrel
//
// Import services like:
//   import { signIn, signOut } from '@/services';
//   import { getStudentsByInstitute } from '@/services';
//
// Or import directly from the specific module when tree-shaking matters:
//   import { signIn } from '@/services/auth.service';
// ---------------------------------------------------------------------------

export * from "./attendance.service";
export * from "./auth.service";
export * from "./institute.service";
export * from "./student.service";
export * from "./parent.service";
export * from "./staff.service";
export * from "./security.service";
export * from "./fee.service";
export * from "./batch.service";
