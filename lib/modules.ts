export type Field = {
  key: string;
  label: string;
  type?:
    "text" | "date" | "number" | "time" | "select" | "textarea" | "password";
  required?: boolean;
  options?: string[];
  relation?: string;
};
export type Module = {
  title: string;
  description: string;
  table: string;
  area: "hr" | "attendance" | "finance" | "settings" | "private";
  employee?: boolean;
  readonly?: boolean;
  fields: Field[];
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  required = true,
): Field => ({ key, label, type, required });
const ref = (
  key: string,
  label: string,
  relation: string,
  required = true,
): Field => ({ key, label, relation, required });
const select = (key: string, label: string, options: string[]): Field => ({
  key,
  label,
  type: "select",
  options,
  required: true,
});
export const modules: Record<string, Module> = {
  "advance-balances": {
    title: "Advance balances",
    description:
      "Principal, installments reserved by drafts, approved recoveries and remaining balances.",
    table: "advance_balances",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  "damage-balances": {
    title: "Recovery balances",
    description:
      "Authorized recovery, scheduled installments, approved recoveries and remaining balances.",
    table: "damage_balances",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  repayments: {
    title: "Advance installments",
    description:
      "Due dates and payroll reservations for each advance installment.",
    table: "advance_repayments",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  installments: {
    title: "Damage installments",
    description:
      "Due dates and payroll reservations for authorized damage recoveries.",
    table: "damage_recovery_installments",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  notifications: {
    title: "Notifications",
    description:
      "Private document expiration alerts and workspace notifications.",
    table: "notifications",
    area: "hr",
    readonly: true,
    fields: [],
  },
  policies: {
    title: "Company policies",
    description:
      "Company-specific settings. The late_policy value supports warning, fixed, per_minute and per_hour rules; deduction requires documented authorization.",
    table: "application_settings",
    area: "settings",
    fields: [
      f("key", "Setting key (for example late_policy)"),
      f("value", "JSON policy value", "textarea"),
    ],
  },
  "leave-balances": {
    title: "Leave balances",
    description:
      "Annual entitlement, approved usage, pending requests and remaining leave.",
    table: "leave_balances",
    area: "attendance",
    employee: true,
    readonly: true,
    fields: [],
  },
  "leave-policies": {
    title: "Employee leave policies",
    description:
      "Employee-specific entitlement overrides, effective from a chosen date.",
    table: "leave_policies",
    area: "attendance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      ref("leave_type_id", "Leave type", "leave_types"),
      f("annual_entitlement", "Entitlement days", "number"),
      f("effective_from", "Effective from", "date"),
    ],
  },
  balances: {
    title: "Salary reconciliation",
    description:
      "Period earnings, actual payments and remaining payable, including reversals.",
    table: "payroll_balances",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  employees: {
    title: "Employees",
    description: "People, employment details and private employee profiles.",
    table: "employees",
    area: "hr",
    fields: [
      f("first_name", "First name"),
      f("middle_name", "Middle name", "text", false),
      f("last_name", "Last name"),
      ref("branch_id", "Branch", "branches"),
      ref("department_id", "Department", "departments", false),
      ref("position_id", "Position", "positions", false),
      f("father_name", "Father’s name", "text", false),
      f("mother_name", "Mother’s name", "text", false),
      f("date_of_birth", "Date of birth", "date", false),
      f("gender", "Gender", "text", false),
      f("nationality", "Nationality", "text", false),
      f("phone", "Phone", "text", false),
      f("alternative_phone", "Alternative phone", "text", false),
      f("district", "District", "text", false),
      f("address", "Residential address", "textarea", false),
      f("emergency_name", "Emergency contact", "text", false),
      f("emergency_phone", "Emergency phone", "text", false),
      f("emergency_relationship", "Emergency relationship", "text", false),
      f("start_date", "Start date", "date"),
      f("end_date", "End date", "date", false),
      select("employment_type", "Employment type", [
        "full_time",
        "part_time",
        "contract",
      ]),
      select("status", "Status", [
        "active",
        "inactive",
        "terminated",
        "on_leave",
      ]),
      f("basic_salary", "Basic salary", "number"),
      f("currency", "Currency"),
      f("payment_method", "Payment method", "text", false),
      ref("reporting_manager_id", "Reporting manager", "employees", false),
      f("user_id", "Linked auth user UUID", "text", false),
    ],
  },
  branches: {
    title: "Branches",
    description: "Company locations and operating time zones.",
    table: "branches",
    area: "settings",
    fields: [
      f("name", "Branch name"),
      f("timezone", "IANA time zone"),
      f("address", "Address", "text", false),
    ],
  },
  departments: {
    title: "Departments",
    description: "Organize teams across your company.",
    table: "departments",
    area: "settings",
    fields: [
      f("name", "Department name"),
      ref("branch_id", "Branch", "branches", false),
    ],
  },
  positions: {
    title: "Positions",
    description: "Job titles and responsibilities.",
    table: "positions",
    area: "settings",
    fields: [
      f("name", "Position name"),
      f("description", "Description", "textarea", false),
    ],
  },
  shifts: {
    title: "Work shifts",
    description:
      "Local shift times, grace periods and breaks. Date-based assignments support rotating schedules.",
    table: "work_shifts",
    area: "attendance",
    fields: [
      f("name", "Shift name"),
      f("start_time", "Start time", "time"),
      f("end_time", "End time", "time"),
      f("grace_minutes", "Grace minutes", "number"),
      f("break_minutes", "Break minutes", "number"),
      f("overtime_multiplier", "Overtime multiplier", "number"),
      f(
        "working_days",
        "Working weekdays JSON (Monday=1, Sunday=7)",
        "text",
        false,
      ),
      f(
        "segments",
        'Split segments JSON: [{"start":"08:00","end":"12:00"},…]',
        "textarea",
        false,
      ),
    ],
  },
  assignments: {
    title: "Shift assignments",
    description: "Date-based employee, department or branch assignments.",
    table: "shift_assignments",
    area: "attendance",
    fields: [
      ref("employee_id", "Employee", "employees", false),
      ref("department_id", "Department", "departments", false),
      ref("branch_id", "Branch", "branches", false),
      ref("shift_id", "Shift", "work_shifts"),
      f("starts_on", "Starts on", "date"),
      f("ends_on", "Ends on", "date", false),
    ],
  },
  devices: {
    title: "Attendance devices",
    description:
      "Compatible devices, branch mapping and synchronization health.",
    table: "attendance_devices",
    area: "attendance",
    fields: [
      f("name", "Device name"),
      f("model", "Model"),
      f("serial_number", "Serial number"),
      f("ip_address", "IP address"),
      f("port", "Port", "number"),
      ref("branch_id", "Branch", "branches"),
      select("connection_type", "Protocol", ["pyzk", "adms", "vendor_api"]),
      f("timezone", "IANA time zone"),
      f("connector_key_hash", "SHA-256 connector key hash", "password"),
    ],
  },
  mappings: {
    title: "Device user mappings",
    description:
      "Map device user IDs to employees. No biometric templates are stored.",
    table: "device_employee_mappings",
    area: "attendance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      ref("device_id", "Device", "attendance_devices"),
      f("device_user_id", "Device user ID"),
    ],
  },
  attendance: {
    title: "Attendance",
    description:
      "Processed attendance. Uncertain records require review before payroll.",
    table: "attendance_summaries",
    area: "attendance",
    employee: true,
    readonly: true,
    fields: [],
  },
  punches: {
    title: "Raw punches",
    description: "Immutable device events with duplicate prevention.",
    table: "raw_attendance_events",
    area: "attendance",
    employee: true,
    readonly: true,
    fields: [],
  },
  corrections: {
    title: "Attendance corrections",
    description:
      "Documented corrections reviewed by a second authorized person.",
    table: "attendance_corrections",
    area: "attendance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("work_date", "Work date", "date"),
      f("check_in", "Check-in ISO timestamp"),
      f("check_out", "Check-out ISO timestamp"),
      f("reason", "Reason", "textarea"),
    ],
  },
  "leave-types": {
    title: "Leave types",
    description:
      "Company leave entitlements. Confirm policies against applicable contracts and law.",
    table: "leave_types",
    area: "attendance",
    fields: [
      f("name", "Leave type"),
      f(
        "annual_entitlement",
        "Annual entitlement (0 = no configured cap)",
        "number",
      ),
      select("paid", "Paid leave", ["true", "false"]),
      select("requires_document", "Supporting document required", [
        "false",
        "true",
      ]),
    ],
  },
  leave: {
    title: "Leave requests",
    description: "Leave requests, balances and approval history.",
    table: "leave_requests",
    area: "attendance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      ref("leave_type_id", "Leave type", "leave_types"),
      f("start_date", "Start date", "date"),
      f("end_date", "End date", "date"),
      f("total_days", "Scheduled leave days", "number"),
      f("reason", "General reason"),
      f("description", "Description", "textarea", false),
    ],
  },
  overtime: {
    title: "Overtime",
    description: "Only approved overtime contributes to payroll.",
    table: "overtime_records",
    area: "attendance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("work_date", "Work date", "date"),
      f("hours", "Hours", "number"),
      f("multiplier", "Multiplier", "number"),
      select("category", "Category", [
        "regular",
        "weekend",
        "holiday",
        "night",
      ]),
    ],
  },
  incidents: {
    title: "Incidents",
    description:
      "Evidence, employee explanations and review. An incident does not establish financial liability.",
    table: "employee_incidents",
    area: "private",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("incident_date", "Incident date", "date"),
      select("category", "Category", [
        "broken_equipment",
        "broken_plates",
        "damaged_property",
        "lost_inventory",
        "cash_shortage",
        "workplace_error",
        "other",
      ]),
      f("description", "Description", "textarea"),
      f("estimated_loss", "Estimated loss", "number"),
      f("verified_loss", "Verified loss", "number"),
      f("employee_explanation", "Employee explanation", "textarea", false),
      f("manager_review", "Manager review", "textarea", false),
      select("status", "Review status", [
        "pending",
        "reviewed",
        "disputed",
        "approved",
        "rejected",
      ]),
    ],
  },
  recoveries: {
    title: "Damage recoveries",
    description:
      "Documented legal basis and employee authorization are required.",
    table: "damage_recovery_plans",
    area: "finance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      ref("incident_id", "Incident", "employee_incidents"),
      f("approved_amount", "Recoverable amount", "number"),
      f("authorization_reference", "Authorization reference"),
      f("employee_consent_at", "Consent timestamp (ISO)"),
      f("legal_basis", "Legal basis", "textarea"),
      select("status", "Status", ["pending", "approved", "disputed", "closed"]),
    ],
  },
  advances: {
    title: "Salary advances",
    description: "Requests, authorizations and disbursement evidence.",
    table: "salary_advances",
    area: "finance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("requested_amount", "Requested amount", "number"),
      f("approved_amount", "Approved amount", "number", false),
      f("reason", "Reason", "textarea"),
      select("status", "Status", [
        "pending",
        "approved",
        "disbursed",
        "rejected",
        "closed",
      ]),
      f("disbursed_at", "Disbursed at (ISO)", "text", false),
      f("disbursement_reference", "Disbursement reference", "text", false),
      f("authorization_reference", "Recovery authorization", "text", false),
    ],
  },
  periods: {
    title: "Payroll periods",
    description:
      "Set the company-specific divisor before generating draft payroll.",
    table: "payroll_periods",
    area: "finance",
    fields: [
      f("name", "Period name"),
      f("start_date", "Start date", "date"),
      f("end_date", "End date", "date"),
      f("divisor", "Pay divisor", "number"),
      f("currency", "Currency"),
    ],
  },
  payroll: {
    title: "Payroll runs",
    description:
      "Draft → verified → approved → partially paid → paid → locked.",
    table: "payroll_runs",
    area: "finance",
    readonly: true,
    fields: [],
  },
  "payroll-items": {
    title: "Payroll ledger",
    description: "Immutable calculated earnings, deductions and net salary.",
    table: "payroll_items",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  payments: {
    title: "Salary payments",
    description:
      "Actual payments, references and reversals, recorded separately from payroll.",
    table: "salary_payments",
    area: "finance",
    employee: true,
    readonly: true,
    fields: [],
  },
  salaries: {
    title: "Salary structures",
    description: "Date-effective allowances and bonuses.",
    table: "salary_structures",
    area: "finance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("name", "Structure name"),
      f("allowances", "Allowances", "number"),
      f("bonuses", "Bonuses", "number"),
      f("effective_from", "Effective from", "date"),
      f("effective_to", "Effective to", "date", false),
    ],
  },
  deductions: {
    title: "Authorized deductions",
    description:
      "Reviewed late and other deductions with a legal and contractual basis.",
    table: "authorized_deductions",
    area: "finance",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      ref("period_id", "Payroll period", "payroll_periods"),
      select("category", "Category", ["late", "other"]),
      f("amount", "Amount", "number"),
      f("legal_basis", "Legal basis", "textarea"),
      f("authorization_reference", "Authorization reference"),
    ],
  },
  performance: {
    title: "Performance reviews",
    description: "Attendance, punctuality and manager feedback.",
    table: "employee_performance_reviews",
    area: "private",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("review_date", "Review date", "date"),
      f("attendance_rate", "Attendance rate (%)", "number"),
      f("punctuality_rate", "Punctuality rate (%)", "number"),
      f("manager_comments", "Manager comments", "textarea"),
    ],
  },
  guarantors: {
    title: "Guarantors",
    description: "Private employee guarantor contact details.",
    table: "employee_guarantors",
    area: "private",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("full_name", "Full name"),
      f("phone", "Phone"),
      f("address", "Address", "text", false),
      f("relationship", "Relationship", "text", false),
    ],
  },
  contacts: {
    title: "Employee contacts",
    description: "Private contact information.",
    table: "employee_contacts",
    area: "private",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("name", "Name"),
      f("phone", "Phone"),
      f("relationship", "Relationship"),
      f("address", "Address", "text", false),
    ],
  },
  contracts: {
    title: "Employment contracts",
    description: "Employment terms and validity.",
    table: "employment_contracts",
    area: "private",
    employee: true,
    fields: [
      ref("employee_id", "Employee", "employees"),
      f("contract_type", "Contract type"),
      f("start_date", "Start date", "date"),
      f("end_date", "End date", "date", false),
      f("terms", "Terms", "textarea", false),
    ],
  },
  holidays: {
    title: "Holidays",
    description: "Company public holidays used by attendance processing.",
    table: "holidays",
    area: "attendance",
    fields: [f("name", "Name"), f("holiday_date", "Date", "date")],
  },
  sync: {
    title: "Synchronization logs",
    description: "Device ingestion results and synchronization errors.",
    table: "attendance_sync_logs",
    area: "attendance",
    readonly: true,
    fields: [],
  },
  audit: {
    title: "Audit log",
    description:
      "Append-only record of changes. Sensitive field values are omitted.",
    table: "audit_logs",
    area: "settings",
    readonly: true,
    fields: [],
  },
};
export function canWrite(role: string | undefined, area: Module["area"]) {
  return (
    !!role &&
    (["super_admin", "company_admin"].includes(role) ||
      (role === "hr_manager" &&
        ["hr", "private", "attendance"].includes(area)) ||
      (role === "accountant" && area === "finance") ||
      (["branch_manager", "supervisor"].includes(role) &&
        area === "attendance"))
  );
}
export function canView(role: string | undefined, area: Module["area"]) {
  if (
    !role ||
    ![
      "super_admin",
      "company_admin",
      "hr_manager",
      "branch_manager",
      "supervisor",
      "accountant",
      "employee",
    ].includes(role)
  )
    return false;
  if (["super_admin", "company_admin"].includes(role)) return true;
  if (area === "finance") return role === "accountant" || role === "employee";
  if (area === "private" || area === "hr")
    return role === "hr_manager" || role === "employee";
  return true;
}

/** Payroll administration is separate from an employee's own salary records. RLS scopes own records. */
export function canViewModule(role: string | undefined, key: string) {
  const m = modules[key];
  if (!m || !canView(role, m.area)) return false;
  if (key === "audit" || key === "policies")
    return ["super_admin", "company_admin"].includes(role ?? "");
  if (
    role === "employee" &&
    [
      "payroll",
      "periods",
      "salaries",
      "deductions",
      "devices",
      "mappings",
      "sync",
      "assignments",
    ].includes(key)
  )
    return false;
  return true;
}
