import { useState, useEffect, type ReactNode } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, User, Briefcase, GraduationCap, Calendar, Shield, Phone, Mail, Plus, Trash2, BookOpen, Layers } from "lucide-react";

import { staffAdmissionSchema, type StaffAdmissionSchema } from "@/modules/staff/validations";
import { admitStaff } from "@/services/staff.service";
import { getBatchesByInstitute } from "@/services/batch.service";
import { getCoursesByInstitute } from "@/services/course.service";
import type { AdmitStaffResult, Batch, Course } from "@/types";
import { StaffCredentialsCard } from "@/modules/staff/components/StaffCredentialsCard";
import { toast } from "sonner";

interface StaffAdmissionFormProps {
  instituteId: string;
  onSuccess: (result: AdmitStaffResult) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

export function StaffAdmissionForm({ instituteId, onSuccess, onCancel }: StaffAdmissionFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<AdmitStaffResult | null>(null);
  const [admittedStaffName, setAdmittedStaffName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<StaffAdmissionSchema>({
    resolver: zodResolver(staffAdmissionSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      designation: "",
      department: "",
      qualification: "",
      joiningDate: new Date().toISOString().split("T")[0],
      roleName: "Teacher",
      assignments: [{ batch_id: "", course_name: "", subject_name: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "assignments",
  });

  useEffect(() => {
    async function fetchMetadata() {
      setIsLoadingMetadata(true);
      const [batchRes, courseRes] = await Promise.all([
        getBatchesByInstitute(instituteId),
        getCoursesByInstitute(instituteId),
      ]);
      if (batchRes.success) setBatches(batchRes.data ?? []);
      if (courseRes.success) setCourses(courseRes.data ?? []);
      setIsLoadingMetadata(false);
    }
    fetchMetadata();
  }, [instituteId]);

  async function onSubmit(values: StaffAdmissionSchema) {
    setServerError(null);
    const result = await admitStaff({
      institute_id: instituteId,
      name: values.fullName,
      email: values.email,
      phone: values.phone,
      designation: values.designation,
      department: values.department,
      qualification: values.qualification,
      joining_date: values.joiningDate,
      role_name: values.roleName,
      assignments: values.assignments?.filter(a => a.batch_id || a.course_name || a.subject_name),
    });

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to admit staff. Please try again.");
      toast.error(result.error ?? "Failed to admit staff");
      return;
    }

    setAdmittedStaffName(values.fullName);
    setSuccessResult(result.data);
    onSuccess(result.data);
    toast.success("Staff admitted successfully");
  }

  if (successResult) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
        </div>
        <div className="max-w-sm space-y-2">
          <h3 className="text-base font-semibold text-foreground">Staff admitted successfully!</h3>
          <p className="text-sm text-muted-foreground">Login credentials generated below.</p>
        </div>
        <StaffCredentialsCard staffName={admittedStaffName} credentials={successResult} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { reset(); setSuccessResult(null); }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add Another
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* 1. Personal Details */}
      <div>
        <SectionHeader icon={<User />} title="Personal Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Full Name *</label>
            <input {...register("fullName")} className={INPUT_CLASS} placeholder="e.g. John Doe" />
            {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Email *</label>
            <input {...register("email")} type="email" className={INPUT_CLASS} placeholder="john@example.com" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Phone *</label>
            <input {...register("phone")} className={INPUT_CLASS} placeholder="+91 9876543210" />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
          </div>
        </div>
      </div>

      {/* 2. Professional Details */}
      <div>
        <SectionHeader icon={<Briefcase />} title="Professional Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Designation *</label>
            <input {...register("designation")} className={INPUT_CLASS} placeholder="e.g. Senior Teacher" />
            {errors.designation && <p className="mt-1 text-xs text-destructive">{errors.designation.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Department *</label>
            <input {...register("department")} className={INPUT_CLASS} placeholder="e.g. Mathematics" />
            {errors.department && <p className="mt-1 text-xs text-destructive">{errors.department.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Qualification *</label>
            <input {...register("qualification")} className={INPUT_CLASS} placeholder="e.g. PhD in Mathematics" />
            {errors.qualification && <p className="mt-1 text-xs text-destructive">{errors.qualification.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Joining Date *</label>
            <input {...register("joiningDate")} type="date" className={INPUT_CLASS} />
            {errors.joiningDate && <p className="mt-1 text-xs text-destructive">{errors.joiningDate.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>System Role *</label>
            <select {...register("roleName")} className={INPUT_CLASS}>
              <option value="Teacher">Teacher</option>
              <option value="Coordinator">Coordinator</option>
              <option value="HOD">HOD</option>
              <option value="Counselor">Counselor</option>
              <option value="Accountant">Accountant</option>
              <option value="Librarian">Librarian</option>
              <option value="HR">HR</option>
              <option value="Lab Assistant">Lab Assistant</option>
            </select>
            {errors.roleName && <p className="mt-1 text-xs text-destructive">{errors.roleName.message}</p>}
          </div>
        </div>
      </div>

      {/* 3. Assignments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={<BookOpen />} title="Assigned Courses & Subjects" />
          <button
            type="button"
            onClick={() => append({ batch_id: "", course_name: "", subject_name: "" })}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add Assignment
          </button>
        </div>
        
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="relative grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
              <div>
                <label className={LABEL_CLASS}>Course</label>
                <select {...register(`assignments.${index}.course_name`)} className={INPUT_CLASS}>
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Batch / Class</label>
                <select {...register(`assignments.${index}.batch_id`)} className={INPUT_CLASS}>
                  <option value="">Select Batch</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.academic_year})</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Subject</label>
                <input 
                  {...register(`assignments.${index}.subject_name`)} 
                  className={INPUT_CLASS} 
                  placeholder="e.g. Calculus" 
                />
              </div>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {fields.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">No assignments added yet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Admitting..." : "Admit Staff Member"}
        </button>
      </div>
    </form>
  );
}
