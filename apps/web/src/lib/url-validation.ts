import { z } from "zod"

/** Empty or http(s) only — blocks javascript:/data: href injection.
 *  Shared by site-settings and admin/projects URL fields. */
export const optionalHttpUrl = z
  .string()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    message: "URL must be empty or an http(s) URL",
  })
