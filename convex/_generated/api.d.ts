/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as automation from "../automation.js";
import type * as http from "../http.js";
import type * as loans from "../loans.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_loans from "../lib/loans.js";
import type * as lib_rbac from "../lib/rbac.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "automation": typeof automation,
  "http": typeof http,
  "loans": typeof loans,
  "seed": typeof seed,
  "tools": typeof tools,
  "users": typeof users,
  "lib/auth": typeof lib_auth,
  "lib/hmac": typeof lib_hmac,
  "lib/loans": typeof lib_loans,
  "lib/rbac": typeof lib_rbac,
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
