/** Isolated real PostgreSQL harness. No remote URLs, credentials or production database access. */
import EmbeddedPostgres from "embedded-postgres";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const directory = resolve(".test-postgres", `run-${Date.now()}`);
// A failed startup must never be mistaken for a passing test run.
process.exitCode = 1;
await mkdir(directory, { recursive: true });
const server = new EmbeddedPostgres({
  databaseDir: directory,
  port: Number(process.env.MAAMUL_TEST_DB_PORT ?? 54329),
  user: "postgres",
  password: randomBytes(24).toString("hex"),
  persistent: true,
  createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: (message) => {
    if (/FATAL|PANIC/.test(String(message)))
      console.error(
        "Local PostgreSQL fatal/startup error; check port availability.",
      );
  },
  onError: (message) => {
    if (String(message).includes("FATAL")) console.error(message);
  },
});
let client;
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
}
async function rejected(work, message, pattern) {
  await assert.rejects(work, pattern);
  checks++;
  console.log(`PASS ${message}`);
}
try {
  await server.initialise();
  await server.start();
  client = server.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  await client.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  const preflight = await client.query(
    await readFile("supabase/preflight.sql", "utf8"),
  );
  check(
    Array.isArray(preflight) &&
      preflight.some(
        (result) => result.rows?.[0]?.supports_security_invoker_views === true,
      ),
    "Read-only remote preflight executes against managed-schema contracts",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await client.query(await readFile(`supabase/migrations/${file}`, "utf8"));
      console.log(`Applied ${file}`);
    } catch (e) {
      console.error(`MIGRATION FAILED ${file}: ${e.message}\n${e.where ?? ""}`);
      throw e;
    }
  }
  check(
    (
      await client.query(
        "select has_table_privilege('authenticated','public.employees','INSERT') allowed",
      )
    ).rows[0].allowed,
    "Explicit grants permit policy-controlled employee writes",
  );
  check(
    !(
      await client.query(
        "select has_table_privilege('authenticated','public.payroll_items','UPDATE') allowed",
      )
    ).rows[0].allowed,
    "Explicit grants prohibit direct payroll item modification",
  );
  check(
    !(
      await client.query(
        "select has_table_privilege('authenticated','public.audit_logs','INSERT') allowed",
      )
    ).rows[0].allowed,
    "Explicit grants prohibit forged audit writes",
  );
  check(
    !(
      await client.query(
        "select has_table_privilege('anon','public.employees','SELECT') allowed",
      )
    ).rows[0].allowed,
    "Anonymous role has no personnel table privileges",
  );
  const ids = Array.from({ length: 8 }, () => randomUUID());
  for (const id of ids)
    await client.query("insert into auth.users(id) values($1)", [id]);
  const [
    adminA,
    adminB,
    accountant,
    hr,
    manager,
    employee,
    approver,
    supervisor,
  ] = ids;
  async function as(user, sql, values = []) {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user ?? "",
    ]);
    await client.query("set role authenticated");
    return client.query(sql, values);
  }
  const cA = (
    await as(
      adminA,
      "select create_company('Test A','USD','Africa/Nairobi') id",
    )
  ).rows[0].id;
  const cB = (
    await as(
      adminB,
      "select create_company('Test B','USD','Africa/Nairobi') id",
    )
  ).rows[0].id;
  check(cA !== cB, "Company creation creates isolated memberships");
  const bA = (
    await as(
      adminA,
      "insert into branches(company_id,name) values($1,'Branch A') returning id",
      [cA],
    )
  ).rows[0].id;
  const bA2 = (
    await as(
      adminA,
      "insert into branches(company_id,name) values($1,'Branch A2') returning id",
      [cA],
    )
  ).rows[0].id;
  const bB = (
    await as(
      adminB,
      "insert into branches(company_id,name) values($1,'Branch B') returning id",
      [cB],
    )
  ).rows[0].id;
  for (const [u, r, b] of [
    [accountant, "accountant", null],
    [hr, "hr_manager", null],
    [manager, "branch_manager", bA],
    [employee, "employee", null],
    [approver, "company_admin", null],
    [supervisor, "supervisor", bA],
  ])
    await as(adminA, "select set_membership($1,$2,$3,$4)", [cA, u, r, b]);
  await rejected(
    () =>
      as(adminA, "select set_membership($1,$2,$3,null)", [
        cA,
        adminA,
        "employee",
      ]),
    "Cannot demote own membership",
    /own membership/,
  );
  await rejected(
    () =>
      as(employee, "select set_membership($1,$2,$3,null)", [
        cA,
        employee,
        "company_admin",
      ]),
    "Employee cannot elevate membership",
    /Forbidden/,
  );
  async function addEmployee(user, c, b, name, u = null) {
    return (
      await as(
        user,
        "insert into employees(company_id,branch_id,first_name,last_name,start_date,basic_salary,user_id) values($1,$2,$3,'Fixture','2026-10-01',300,$4) returning id",
        [c, b, name, u],
      )
    ).rows[0].id;
  }
  const eA = await addEmployee(adminA, cA, bA, "Asha", employee),
    eA2 = await addEmployee(adminA, cA, bA2, "Other"),
    eB = await addEmployee(adminB, cB, bB, "Private");
  check(
    (
      await as(adminA, "select employee_number from employees where id=$1", [
        eA,
      ])
    ).rows[0].employee_number === "EMP-01" &&
      (
        await as(adminA, "select employee_number from employees where id=$1", [
          eA2,
        ])
      ).rows[0].employee_number === "EMP-02" &&
      (
        await as(adminB, "select employee_number from employees where id=$1", [
          eB,
        ])
      ).rows[0].employee_number === "EMP-01",
    "Employee numbers start at 01 and increment independently per company",
  );
  check(
    (await as(adminA, "select * from employees where company_id=$1", [cB]))
      .rowCount === 0,
    "Company A cannot read Company B employees",
  );
  check(
    (await as(employee, "select * from employees")).rowCount === 1,
    "Employee only reads own private profile",
  );
  check(
    (await as(manager, "select * from employee_directory($1)", [cA]))
      .rowCount === 1,
    "Branch manager directory excludes other branches",
  );
  check(
    (await as(accountant, "select * from employees")).rowCount === 0,
    "Accountant cannot read private employee profiles",
  );
  check(
    (await as(accountant, "select * from employee_directory($1)", [cA]))
      .rowCount === 2,
    "Accountant has restricted employee directory",
  );
  await rejected(
    () => addEmployee(employee, cA, bA, "Unauthorized"),
    "Employee cannot create employees",
    /row-level security/,
  );
  await rejected(
    () => addEmployee(adminA, cA, bB, "Cross tenant"),
    "Cross-company branch foreign key rejected",
    /foreign key/,
  );
  check(
    (
      await as(
        adminA,
        "update employees set phone='123' where id=$1 returning id",
        [eA],
      )
    ).rowCount === 1,
    "Employee update succeeds for admin",
  );
  const temporary = await addEmployee(adminA, cA, bA, "Temporary");
  // Salary history intentionally prevents deleting employment history; terminate instead.
  await rejected(
    () => as(adminA, "delete from employees where id=$1", [temporary]),
    "Employee with salary history cannot be destructively deleted",
    /foreign key/,
  );
  await as(
    adminA,
    "update employees set status='terminated',end_date='2026-10-01' where id=$1",
    [temporary],
  );
  await as(
    adminA,
    "update employees set end_date='2026-09-30',start_date='2026-09-01',status='terminated' where id=$1",
    [eA2],
  );
  await as(
    adminA,
    "update employees set end_date='2026-09-30',start_date='2026-09-01' where id=$1",
    [temporary],
  );
  const shift = (
    await as(
      adminA,
      "insert into work_shifts(company_id,name,start_time,end_time) values($1,'Day','08:00','17:00') returning id",
      [cA],
    )
  ).rows[0].id;
  const device = (
    await as(
      adminA,
      "insert into attendance_devices(company_id,branch_id,name,model,serial_number,ip_address,connector_key_hash) values($1,$2,'Clock','Test','TEST-ONLY','192.168.1.201',$3) returning id",
      [cA, bA, "a".repeat(64)],
    )
  ).rows[0].id;
  await as(
    adminA,
    "insert into device_employee_mappings(company_id,employee_id,device_id,device_user_id) values($1,$2,$3,$4)",
    [cA, eA, device, "7"],
  );
  await rejected(
    () =>
      as(
        manager,
        "insert into device_employee_mappings(company_id,employee_id,device_id,device_user_id) values($1,$2,$3,'8')",
        [cA, eA2, device],
      ),
    "Branch spoofing mapping rejected",
    /same branch|row-level security/,
  );
  const events = [
    {
      device_user_id: "7",
      occurred_at: "2026-10-01T08:00:00+03:00",
      punch: 0,
      source_key: "b".repeat(64),
    },
  ];
  await rejected(
    () =>
      as(employee, "select ingest_device_events($1,$2)", [
        device,
        JSON.stringify(events),
      ]),
    "Employee cannot call device ingestion",
    /permission denied/,
  );
  await client.query("reset role");
  await client.query("set role service_role");
  check(
    (
      await client.query("select ingest_device_events($1,$2) n", [
        device,
        JSON.stringify(events),
      ])
    ).rows[0].n === 1,
    "First device event ingested",
  );
  check(
    (
      await client.query("select ingest_device_events($1,$2) n", [
        device,
        JSON.stringify(events),
      ])
    ).rows[0].n === 0,
    "Duplicate attendance upload is idempotent",
  );
  check(
    (await as(manager, "select * from raw_attendance_events")).rowCount === 1,
    "Branch manager can read own branch punches",
  );
  const lt = (
    await as(
      adminA,
      "insert into leave_types(company_id,name,paid,annual_entitlement) values($1,'Annual',true,3) returning id",
      [cA],
    )
  ).rows[0].id;
  await as(
    adminA,
    "insert into shift_assignments(company_id,employee_id,shift_id,starts_on) values($1,$2,$3,'2026-10-01') returning id",
    [cA, eA, shift],
  );
  const leave = (
    await as(
      employee,
      "select request_leave($1,$2,$3,'2026-10-03','2026-10-03',1,'Test leave') id",
      [cA, eA, lt],
    )
  ).rows[0].id;
  await rejected(
    () =>
      as(
        employee,
        "select request_leave($1,$2,$3,'2026-10-03','2026-10-03',1,'Overlap')",
        [cA, eA, lt],
      ),
    "Overlapping leave rejected",
    /exclusion constraint/,
  );
  await rejected(
    () =>
      as(
        employee,
        "select request_leave($1,$2,$3,'2026-10-10','2026-10-12',3,'Over entitlement')",
        [cA, eA, lt],
      ),
    "Pending and approved leave consume entitlement",
    /entitlement/,
  );
  await rejected(
    () =>
      as(
        adminB,
        "select request_leave($1,$2,$3,'2026-10-10','2026-10-10',1,'Cross tenant')",
        [cA, eA2, lt],
      ),
    "Null employee auth link cannot bypass tenant authorization",
    /Forbidden/,
  );
  await rejected(
    () =>
      as(employee, "select review_request('leave',$1,true,'Self')", [leave]),
    "Self approval rejected",
    /reviewer/,
  );
  await as(hr, "select review_request('leave',$1,true,'Reviewed')", [leave]);
  const period = (
    await as(
      accountant,
      "insert into payroll_periods(company_id,name,start_date,end_date,divisor) values($1,'October 2026','2026-10-01','2026-10-31',26) returning id",
      [cA],
    )
  ).rows[0].id;
  await rejected(
    () => as(accountant, "select generate_payroll($1)", [period]),
    "Payroll refuses incomplete attendance",
    /Attendance unresolved/,
  );
  await client.query("reset role");
  await client.query(
    "insert into attendance_summaries(company_id,employee_id,work_date,status,reviewed,paid_leave,worked_minutes) select $1,$2,d::date,case when extract(day from d) in (1,2) then 'absent' when extract(day from d)=3 then 'leave' else 'present' end,true,extract(day from d)=3,480 from generate_series('2026-10-01'::date,'2026-10-31'::date,'1 day') d",
    [cA, eA],
  );
  const advance = (
    await as(
      accountant,
      "insert into salary_advances(company_id,employee_id,requested_amount,approved_amount,reason,status,disbursed_at,disbursement_reference,authorization_reference) values($1,$2,100,100,'Test','disbursed',now(),'ADV-TEST','SIGNED-TEST') returning id",
      [cA, eA],
    )
  ).rows[0].id;
  await as(
    accountant,
    "select schedule_recovery('advance',$1,array['2026-10-31'::date],array[25::numeric])",
    [advance],
  );
  await rejected(
    () =>
      as(
        accountant,
        "select schedule_recovery('advance',$1,array['2026-11-30'::date],array[100::numeric])",
        [advance],
      ),
    "Advance schedule cannot exceed principal",
    /exceeds recoverable/,
  );
  const run = (await as(accountant, "select generate_payroll($1) id", [period]))
    .rows[0].id;
  const item = (
    await as(accountant, "select * from payroll_items where run_id=$1", [run])
  ).rows[0];
  check(
    item.basic_earnings === "276.92" && item.unpaid_absence === "23.08",
    "SQL payroll applies unpaid absence exactly once",
  );
  check(
    item.advance_recovery === "25.00" && item.net === "251.92",
    "SQL payroll includes one authorized advance installment",
  );
  await rejected(
    () => as(accountant, "select generate_payroll($1)", [period]),
    "Duplicate payroll generation rejected",
    /unique constraint/,
  );
  await rejected(
    () =>
      as(accountant, "update payroll_periods set divisor=30 where id=$1", [
        period,
      ]),
    "Generated period cannot be edited",
    /already has payroll/,
  );
  await rejected(
    () =>
      as(
        accountant,
        "update payroll_items set net=0 where id=$1 returning id",
        [item.id],
      ),
    "Direct payroll edits blocked by table privileges",
    /permission denied/,
  );
  await rejected(
    () => as(employee, "select transition_payroll($1,'approved')", [run]),
    "Employee cannot approve payroll",
    /Invalid transition/,
  );
  await as(accountant, "select transition_payroll($1,'verified')", [run]);
  await rejected(
    () => as(accountant, "select transition_payroll($1,'approved')", [run]),
    "Generator cannot approve own payroll",
    /independent approver/,
  );
  await as(approver, "select transition_payroll($1,'approved')", [run]);
  const payment = (
    await as(accountant, "select record_payment($1,100,'PAY-1','bank') id", [
      item.id,
    ])
  ).rows[0].id;
  check(
    (await as(accountant, "select status from payroll_runs where id=$1", [run]))
      .rows[0].status === "partially_paid",
    "Partial payment sets partially paid state",
  );
  await rejected(
    () =>
      as(accountant, "select record_payment($1,200,'PAY-OVER','bank')", [
        item.id,
      ]),
    "Overpayment rejected transactionally",
    /exceeds payable/,
  );
  await rejected(
    () =>
      as(accountant, "select record_payment($1,1,'PAY-1','bank')", [item.id]),
    "Duplicate payment reference rejected",
    /unique constraint/,
  );
  await as(accountant, "select reverse_payment($1,'REV-1')", [payment]);
  await rejected(
    () => as(accountant, "select reverse_payment($1,'REV-2')", [payment]),
    "Duplicate reversal rejected",
    /unique constraint/,
  );
  await as(accountant, "select record_payment($1,251.92,'PAY-2','bank')", [
    item.id,
  ]);
  check(
    (await as(accountant, "select status from payroll_runs where id=$1", [run]))
      .rows[0].status === "paid",
    "Payments reconcile to net payroll after reversal",
  );
  await as(approver, "select transition_payroll($1,'locked')", [run]);
  await rejected(
    () =>
      as(
        accountant,
        "select reverse_payment((select id from salary_payments where reference='PAY-2'),'REV-LOCKED')",
      ),
    "Locked payroll rejects reversal",
    /locked payroll/,
  );
  await rejected(
    () =>
      as(
        employee,
        "insert into storage.objects(bucket_id,name) values('employee-documents',$1)",
        [`${cA}/${eA}/${randomUUID()}.pdf`],
      ),
    "Employee cannot upload private files",
    /row-level security/,
  );
  const path = `${cA}/${eA}/${randomUUID()}.pdf`;
  await as(
    hr,
    "insert into storage.objects(bucket_id,name) values('employee-documents',$1)",
    [path],
  );
  check(
    (await as(employee, "select * from storage.objects")).rowCount === 1,
    "Employee reads own private file",
  );
  check(
    (await as(adminB, "select * from storage.objects")).rowCount === 0,
    "Other company cannot read private storage",
  );
  check(
    (await as(accountant, "select * from storage.objects")).rowCount === 0,
    "Accountant cannot read private storage",
  );
  check(
    (await as(employee, "select * from audit_logs")).rowCount === 0,
    "Employee cannot read audit records",
  );
  check(
    (await as(adminA, "select * from audit_logs where company_id=$1", [cA]))
      .rowCount > 0,
    "Authorized writes create audit records",
  );
  await rejected(
    () =>
      as(
        adminA,
        "insert into audit_logs(company_id,action,table_name) values($1,'fake','employees')",
        [cA],
      ),
    "Audit records cannot be forged through authenticated REST",
    /permission denied|row-level security/,
  );
  check(
    (
      await as(
        employee,
        "select * from payroll_balances where employee_id=$1",
        [eA],
      )
    ).rows[0].remaining_payable === "0.00",
    "Employee payslip balances honor RLS and reconcile",
  );
  check(
    (
      await as(adminB, "select * from payroll_balances where company_id=$1", [
        cA,
      ])
    ).rowCount === 0,
    "Reporting view does not bypass company RLS",
  );
  check(
    (await as(manager, "select * from attendance_employee($1,$2)", [cA, eA]))
      .rowCount === 1,
    "Branch processing uses restricted employee fields",
  );
  check(
    (await as(manager, "select * from attendance_employee($1,$2)", [cA, eA2]))
      .rowCount === 0,
    "Branch processing excludes other branches",
  );
  check(
    (await as(null, "select * from employees")).rowCount === 0,
    "Missing authenticated identity sees no employees",
  );
  check(
    (await as(accountant, "select payroll_round(1.225,'half_even') v")).rows[0]
      .v === "1.22",
    "Company half-even rounding",
  );
  check(
    (await as(accountant, "select payroll_round(1.225,'half_up') v")).rows[0]
      .v === "1.23",
    "Company half-up rounding",
  );
  const incident = (
    await as(
      hr,
      "insert into employee_incidents(company_id,employee_id,incident_date,category,description,verified_loss,status) values($1,$2,'2026-10-10','equipment','Fixture reviewed incident',20,'approved') returning id",
      [cA, eA],
    )
  ).rows[0].id;
  const plan = (
    await as(
      accountant,
      "insert into damage_recovery_plans(company_id,employee_id,incident_id,approved_amount,authorization_reference,employee_consent_at,legal_basis,status) values($1,$2,$3,20,'SIGNED-TEST',now(),'Reviewed fixture basis','approved') returning id",
      [cA, eA, incident],
    )
  ).rows[0].id;
  await rejected(
    () =>
      as(
        accountant,
        "insert into damage_recovery_plans(company_id,employee_id,incident_id,approved_amount,authorization_reference,employee_consent_at,legal_basis,status) values($1,$2,$3,1,'SIGNED-TEST',now(),'Reviewed fixture basis','approved')",
        [cA, eA, incident],
      ),
    "Multiple plans cannot over-recover one incident",
    /exceeds approved incident loss/,
  );
  await as(
    accountant,
    "select schedule_recovery('damage',$1,array['2026-11-30'::date],array[10::numeric])",
    [plan],
  );
  await rejected(
    () =>
      as(
        accountant,
        "select schedule_recovery('damage',$1,array['2026-12-31'::date],array[11::numeric])",
        [plan],
      ),
    "Damage installments cannot exceed authorization",
    /exceeds recoverable/,
  );
  await as(
    accountant,
    "select schedule_recovery('advance',$1,array['2026-11-30'::date],array[25::numeric])",
    [advance],
  );
  const november = (
    await as(
      accountant,
      "insert into payroll_periods(company_id,name,start_date,end_date,divisor) values($1,'November','2026-11-01','2026-11-30',26) returning id",
      [cA],
    )
  ).rows[0].id;
  await client.query("reset role");
  await client.query(
    "insert into attendance_summaries(company_id,employee_id,work_date,status,reviewed,worked_minutes) select $1,$2,d::date,'present',true,480 from generate_series('2026-11-01'::date,'2026-11-30'::date,'1 day') d",
    [cA, eA],
  );
  const novemberRun = (
    await as(accountant, "select generate_payroll($1) id", [november])
  ).rows[0].id;
  const novemberItem = (
    await as(accountant, "select * from payroll_items where run_id=$1", [
      novemberRun,
    ])
  ).rows[0];
  check(
    novemberItem.advance_recovery === "25.00" &&
      novemberItem.damage_recovery === "10.00" &&
      novemberItem.net === "265.00",
    "Next period recovers only its advance and damage installments",
  );
  check(
    (
      await as(
        accountant,
        "select * from advance_repayments where advance_id=$1 and payroll_item_id is not null",
        [advance],
      )
    ).rowCount === 2,
    "Installments reserved exactly once across periods",
  );
  await as(accountant, "select transition_payroll($1,'verified')", [
    novemberRun,
  ]);
  await as(approver, "select transition_payroll($1,'approved')", [novemberRun]);
  const connections = [
    server.getPgClient("postgres", "127.0.0.1"),
    server.getPgClient("postgres", "127.0.0.1"),
  ];
  try {
    for (const connection of connections) {
      await connection.connect();
      await connection.query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [accountant],
      );
      await connection.query("set role authenticated");
    }
    const payments = await Promise.allSettled(
      connections.map((connection, i) =>
        connection.query("select record_payment($1,200,$2,'bank')", [
          novemberItem.id,
          `CONCURRENT-${i}`,
        ]),
      ),
    );
    check(
      payments.filter((r) => r.status === "fulfilled").length === 1 &&
        payments.filter((r) => r.status === "rejected").length === 1,
      "Concurrent payments cannot overpay",
    );
  } finally {
    await Promise.all(connections.map((c) => c.end()));
  }
  const balance = (
    await as(accountant, "select * from payroll_balances where id=$1", [
      novemberItem.id,
    ])
  ).rows[0];
  check(
    balance.total_paid === "200.00" && balance.remaining_payable === "65.00",
    "Reconciliation reflects concurrent transaction result",
  );
  await as(
    hr,
    "insert into employee_documents(company_id,employee_id,document_type,title,storage_path,mime_type,size_bytes,expiration_date) values($1,$2,'passport','Fixture passport',$3,'application/pdf',100,current_date+10)",
    [cA, eA, path],
  );
  await client.query("reset role");
  await client.query("set role service_role");
  check(
    (await client.query("select run_maintenance() n")).rows[0].n > 0,
    "Document expiration notifications generated",
  );
  check(
    (await client.query("select run_maintenance() n")).rows[0].n === 0,
    "Maintenance notifications are idempotent",
  );
  check(
    (await as(employee, "select * from notifications")).rowCount === 0,
    "Employee cannot read HR alerts",
  );
  check(
    (await as(hr, "select * from notifications")).rowCount > 0,
    "HR can read document expiration alerts",
  );
  check(
    Array.isArray(
      (
        await as(
          accountant,
          "select analytics_series($1,'2026-10-01','2026-11-30','USD') v",
          [cA],
        )
      ).rows[0].v.payroll,
    ),
    "Analytics aggregate authorized payroll",
  );
  await rejected(
    () => as(employee, "select run_maintenance()"),
    "Employee cannot execute service maintenance",
    /permission denied/,
  );
  check(
    (
      await as(
        employee,
        "select remaining_balance from advance_balances where id=$1",
        [advance],
      )
    ).rows[0].remaining_balance === "50.00",
    "Employee advance balance excludes recovered installments",
  );
  check(
    (
      await as(
        accountant,
        "select remaining_balance from damage_balances where id=$1",
        [plan],
      )
    ).rows[0].remaining_balance === "10.00",
    "Damage balance reconciles to approved recovery",
  );
  const ownAdvance = (
    await as(
      employee,
      "select request_advance($1,$2,50,'Fixture self-service') id",
      [cA, eA],
    )
  ).rows[0].id;
  check(
    (
      await as(employee, "select status from salary_advances where id=$1", [
        ownAdvance,
      ])
    ).rows[0].status === "pending",
    "Self-service advance starts pending",
  );
  await rejected(
    () =>
      as(employee, "select request_advance($1,$2,50,'Other employee')", [
        cA,
        eA2,
      ]),
    "Employee cannot request advance for another person",
    /Forbidden/,
  );
  const correction = (
    await as(
      employee,
      "select request_correction($1,$2,'2026-12-01','2026-12-01T08:00:00+03:00','2026-12-01T17:00:00+03:00','Fixture correction') id",
      [cA, eA],
    )
  ).rows[0].id;
  check(
    (
      await as(
        employee,
        "select status from attendance_corrections where id=$1",
        [correction],
      )
    ).rows[0].status === "pending",
    "Employee can request an audited attendance correction",
  );
  await rejected(
    () =>
      as(employee, "select review_correction($1,true,'Self approval')", [
        correction,
      ]),
    "Correction requester cannot approve own correction",
    /reviewer/,
  );
  await as(hr, "select review_correction($1,true,'Reviewed correction')", [
    correction,
  ]);
  check(
    (
      await as(
        employee,
        "select status from attendance_summaries where employee_id=$1 and work_date='2026-12-01'",
        [eA],
      )
    ).rows[0].status === "present",
    "Independent correction review updates attendance",
  );
  const health = (
    await as(
      adminA,
      "select last_sync_at from attendance_devices where id=$1",
      [device],
    )
  ).rows[0];
  check(
    health.last_sync_at === null,
    "Queued event upload alone cannot claim complete device synchronization",
  );
  await client.query("reset role");
  await client.query("set role service_role");
  await client.query("select ingest_device_events($1,$2)", [device, "[]"]);
  check(
    (
      await as(
        adminA,
        "select last_sync_at from attendance_devices where id=$1",
        [device],
      )
    ).rows[0].last_sync_at !== null,
    "Only final heartbeat records successful full device synchronization",
  );
  await rejected(
    () =>
      as(
        employee,
        "select request_leave($1,$2,$3,'2026-12-07','2026-12-09',1,'Understated days')",
        [cA, eA, lt],
      ),
    "Leave cannot understate scheduled days to bypass entitlement",
    /scheduled working days/,
  );
  const euroPeriod = (
    await as(
      accountant,
      "insert into payroll_periods(company_id,name,start_date,end_date,divisor,currency) values($1,'Duplicate EUR October','2026-10-01','2026-10-31',26,'EUR') returning id",
      [cA],
    )
  ).rows[0].id;
  await as(adminA, "update employees set currency='EUR' where id=$1", [eA]);
  await rejected(
    () => as(accountant, "select generate_payroll($1)", [euroPeriod]),
    "Currency changes cannot duplicate an employee payroll period",
    /overlapping payroll period/,
  );
  await as(adminA, "update employees set currency='USD' where id=$1", [eA]);
  await rejected(
    () =>
      as(
        employee,
        "select configure_payroll_schedule($1,true,'previous_month')",
        [cB],
      ),
    "Employees cannot enable automatic payroll",
    /administrator/,
  );
  await as(
    adminB,
    "select configure_payroll_schedule($1,true,'previous_month')",
    [cB],
  );
  await rejected(
    () => as(adminB, "select run_scheduled_payroll('2026-11-28T12:00:00Z')"),
    "Authenticated users cannot execute service payroll scheduler",
    /permission denied/,
  );
  await client.query("reset role");
  await client.query("set role service_role");
  check(
    (
      await client.query(
        "select run_scheduled_payroll('2026-11-27T12:00:00Z') result",
      )
    ).rows[0].result.length === 0,
    "Automatic payroll waits until the company-local 28th",
  );
  check(
    (
      await client.query(
        "select run_scheduled_payroll('2026-11-28T12:00:00Z') result",
      )
    ).rows[0].result[0].status === "needs_review",
    "Automatic payroll does not bypass unresolved attendance",
  );
  await client.query("reset role");
  await client.query(
    "insert into attendance_summaries(company_id,employee_id,work_date,status,reviewed) select $1,$2,d::date,'rest',true from generate_series('2026-10-01'::date,'2026-10-31'::date,'1 day') d on conflict(employee_id,work_date) do nothing",
    [cB, eB],
  );
  await client.query("set role service_role");
  const automatic = (
    await client.query(
      "select run_scheduled_payroll('2026-11-28T12:00:00Z') result",
    )
  ).rows[0].result;
  check(
    automatic[0].status === "draft_created",
    "Scheduled payroll generates a draft from reviewed attendance: " +
      JSON.stringify(automatic),
  );
  check(
    (
      await client.query(
        "select run_scheduled_payroll('2026-11-28T12:00:00Z') result",
      )
    ).rows[0].result[0].status === "already_exists",
    "Repeated scheduler execution cannot duplicate payroll",
  );
  check(
    (
      await client.query("select status from payroll_runs where id=$1", [
        automatic[0].run_id,
      ])
    ).rows[0].status === "draft",
    "Scheduled payroll never automatically approves or pays salaries",
  );
  const manualCompany = (
    await as(adminA, "select create_company('Manual payroll fixture') id")
  ).rows[0].id;
  const manualEmployee = (
    await as(
      adminA,
      "insert into employees(company_id,first_name,last_name,start_date,basic_salary) values($1,'Payroll','Fixture','2020-01-01',260) returning id",
      [manualCompany],
    )
  ).rows[0].id;
  await client.query("reset role");
  await client.query(
    "insert into attendance_summaries(company_id,employee_id,work_date,status,reviewed,late_minutes) select $1,$2,d::date,'present',true,case when d::date='2020-09-01' then 60 else 0 end from generate_series('2020-09-01'::date,'2020-09-30'::date,'1 day') d",
    [manualCompany, manualEmployee],
  );
  await rejected(
    () =>
      as(adminB, "select generate_monthly_salaries($1,'2020-09-01',true)", [
        manualCompany,
      ]),
    "Monthly payroll rejects another company",
    /Forbidden/,
  );
  const manualPeriod = (
    await as(
      adminA,
      "insert into payroll_periods(company_id,name,start_date,end_date,divisor,currency) values($1,'Sep fixture','2020-09-01','2020-09-30',26,'USD') returning id",
      [manualCompany],
    )
  ).rows[0].id;
  await as(
    adminA,
    "insert into authorized_deductions(company_id,employee_id,period_id,category,amount,legal_basis,authorization_reference) values($1,$2,$3,'other',3,'Fixture policy','TEST')",
    [manualCompany, manualEmployee, manualPeriod],
  );
  await as(
    adminA,
    "insert into salary_advances(company_id,employee_id,requested_amount,approved_amount,reason,status,disbursed_at,disbursement_reference,authorization_reference) values($1,$2,26,26,'Fixture','disbursed',now(),'TEST','TEST')",
    [manualCompany, manualEmployee],
  );
  await client.query("reset role");
  await client.query(
    "update attendance_summaries set status='absent' where employee_id=$1 and work_date='2020-09-02'",
    [manualEmployee],
  );
  const manualRun = (
    await as(
      adminA,
      "select generate_monthly_salaries($1,'2020-09-01',true) id",
      [manualCompany],
    )
  ).rows[0].id;
  const manualItem = (
    await as(
      adminA,
      "select late_deductions,net,advance_recovery,unpaid_absence,other_deductions from payroll_items where run_id=$1",
      [manualRun],
    )
  ).rows[0];
  check(
    manualItem.late_deductions === "1.25" &&
      manualItem.net === "219.75" &&
      manualItem.advance_recovery === "26.00" &&
      manualItem.unpaid_absence === "10.00" &&
      manualItem.other_deductions === "3.00",
    "Monthly salary deducts authorized late minutes using period hourly rate",
  );
  check(
    (
      await as(
        adminA,
        "select generate_monthly_salaries($1,'2020-09-01',true) id",
        [manualCompany],
      )
    ).rows[0].id === manualRun,
    "Monthly salary retry reuses the run without duplicate deductions",
  );
  await rejected(
    () =>
      as(adminA, "select generate_monthly_salaries($1,'2999-01-01',true)", [
        manualCompany,
      ]),
    "Monthly generation rejects future attendance",
    /completed month/,
  );
  await client.query("reset role");
  await client.query(
    "delete from company_memberships where company_id=$1 and user_id=$2",
    [cA, employee],
  );
  await rejected(
    () =>
      as(
        employee,
        "select request_advance($1,$2,10,'revoked membership fixture')",
        [cA, eA],
      ),
    "Removed member cannot request advance through an old employee link",
    /Forbidden/,
  );
  await rejected(
    () =>
      as(
        employee,
        "select request_correction($1,$2,'2026-10-01','2026-10-01T08:00:00Z','2026-10-01T09:00:00Z','revoked membership fixture')",
        [cA, eA],
      ),
    "Removed member cannot request attendance correction",
    /Forbidden/,
  );
  await rejected(
    () =>
      as(
        employee,
        "select request_leave($1,$2,$3,'2026-10-01','2026-10-01',1,'revoked membership fixture')",
        [cA, eA, lt],
      ),
    "Removed member cannot request leave",
    /Forbidden/,
  );
  check(
    (await as(employee, "select id from employees where company_id=$1", [cA]))
      .rowCount === 0,
    "Membership removal immediately hides linked employee data",
  );
  await as(adminA, "select set_login_name('  Admin.Fixture  ')");
  check(
    (await as(adminA, "select username from account_login_names")).rows[0]
      .username === "admin.fixture",
    "Login names normalize case and whitespace",
  );
  check(
    (await as(adminB, "select username from account_login_names")).rowCount ===
      0,
    "Other users cannot read login names",
  );
  await rejected(
    () => as(adminB, "select set_login_name('ADMIN.FIXTURE')"),
    "Duplicate login names cannot hijack an account",
    /duplicate key/,
  );
  await rejected(
    () => as(employee, "select resolve_login_email('admin.fixture')"),
    "Authenticated clients cannot enumerate emails by login name",
    /permission denied/,
  );
  await client.query("reset role");
  await client.query(
    "update auth.users set email='fixture-admin@maamul.invalid' where id=$1",
    [adminA],
  );
  await client.query("set role service_role");
  check(
    (await client.query("select resolve_login_email('admin.fixture') email"))
      .rows[0].email === "fixture-admin@maamul.invalid",
    "Only service endpoint resolves a login name to its authentication email",
  );
  console.log(
    `\n${checks} PostgreSQL integration checks passed. Supabase Auth/Storage HTTP and hardware remain separate acceptance tests.`,
  );
  process.exitCode = 0;
} finally {
  if (client) await client.end();
  await server.stop();
}
