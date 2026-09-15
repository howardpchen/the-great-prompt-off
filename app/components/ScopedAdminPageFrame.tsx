import "server-only";
import type {ReactNode} from "react";
import type {AdminContestContext} from "../lib/db/admin-page-snapshot";
import {AdminPageFrame} from "./AdminLayout";
export function ScopedAdminPageFrame({children, contestContext: active}:{children:ReactNode; contestContext:AdminContestContext}) {
 return <div key={`${active?.id}:${active?.schema_version}`} data-active-contest={active?.id || ""} data-contest-version={active?.schema_version || 0}><AdminPageFrame>{children}</AdminPageFrame></div>;
}
