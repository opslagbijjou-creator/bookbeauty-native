export type AppRole = "customer" | "company" | "admin";

export const ROLES = {
  customer: "customer",
  company: "company",
  admin: "admin",
} as const;

export function isValidRole(value: unknown): value is AppRole {
  return value === ROLES.customer || value === ROLES.company || value === ROLES.admin;
}
