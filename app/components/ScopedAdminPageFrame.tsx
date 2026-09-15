import "server-only";
import type {ReactNode} from "react";
import {createDatabase} from "../lib/db/database";
import {AdminPageFrame} from "./AdminLayout";
export async function ScopedAdminPageFrame({children}:{children:ReactNode}) {
 const [active]=await createDatabase().sql<{id:string;schema_version:number}>("SELECT id,schema_version FROM challenges WHERE is_active");
 return <div key={`${active?.id}:${active?.schema_version}`} data-active-contest={active?.id || ""} data-contest-version={active?.schema_version || 0}><AdminPageFrame>{children}</AdminPageFrame></div>;
}
