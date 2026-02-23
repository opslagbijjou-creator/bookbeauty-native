export type AppRole = "customer" | "company" | "employee" | "influencer" | "admin";

export const ROLES = {
  customer: "customer",
  company: "company",
  employee: "employee",
  influencer: "influencer",
  admin: "admin",
} as const;

export function isValidRole(value: unknown): value is AppRole {
  return (
    value === ROLES.customer ||
    value === ROLES.company ||
    value === ROLES.employee ||
    value === ROLES.influencer ||
    value === ROLES.admin
  );
}
