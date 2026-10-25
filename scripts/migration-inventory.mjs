import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function migrationInventory() {
  const inventory = [];
  for (const filename of (await readdir("supabase/migrations"))
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort()) {
    const sql = await readFile(`supabase/migrations/${filename}`, "utf8");
    inventory.push({
      filename,
      sha256: createHash("sha256").update(sql).digest("hex"),
      tables: [...sql.matchAll(/create table public\.(\w+)/gi)].map(
        (m) => m[1],
      ),
      views: [...sql.matchAll(/create view public\.(\w+)/gi)].map((m) => m[1]),
      functions: [
        ...sql.matchAll(/create (?:or replace )?function public\.(\w+)/gi),
      ].map((m) => m[1]),
      dropsTables: /drop\s+table/i.test(sql),
    });
  }
  return inventory;
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/migration-inventory.mjs") ||
  process.argv[1] === "scripts/migration-inventory.mjs"
) {
  const inventory = await migrationInventory();
  await writeFile(
    "docs/MIGRATION-INVENTORY.json",
    JSON.stringify(inventory, null, 2) + "\n",
  );
  const tables = [...new Set(inventory.flatMap((m) => m.tables))],
    functions = [...new Set(inventory.flatMap((m) => m.functions))];
  const sql = `-- Read-only preflight. Run in your project's SQL editor before approving migrations.
-- Returns schema metadata only; no employee rows, keys, passwords or object contents.
begin read only;
set local statement_timeout='15s';
select current_setting('server_version') postgres_version,current_setting('server_version_num')::int>=150000 supports_security_invoker_views;
select name,installed_version,default_version from pg_available_extensions where name in ('pgcrypto','btree_gist');
select name,to_regclass(name) is not null present from unnest(array['auth.users','storage.buckets','storage.objects']) name;
select to_regprocedure('auth.uid()') is not null auth_uid_present;
select rolname from pg_roles where rolname in ('anon','authenticated','service_role');
select n.nspname schema_name,c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','p','m') order by c.relname;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[${functions.map((n) => `'${n}'`).join(",")}]) order by p.proname;
select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname='public' and tablename=any(array[${tables.map((n) => `'${n}'`).join(",")}]) order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name=any(array[${tables.map((n) => `'${n}'`).join(",")}]) and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='employee-documents';
select to_regclass('supabase_migrations.schema_migrations') is not null migration_history_present;
rollback;
`;
  await writeFile("supabase/preflight.sql", sql);
  console.log(
    `Reviewed inventory: ${inventory.length} migrations, ${tables.length} base tables. Wrote local metadata inventory and read-only preflight SQL. No database contacted.`,
  );
}
