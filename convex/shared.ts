/*
  Plain helpers shared by the Convex functions and the browser.

  Nothing here may import from ./_generated or anything server-side: the
  client bundles this file, and the point is that both sides answer "is this
  the same customer?" identically. Two answers to that question is how a
  saved-customer list quietly grows a duplicate of everyone.
*/

/**
 * A Bangladeshi mobile number reduced to its local form.
 *
 * The same subscriber is written 01711-999888, +8801711999888, 8801711999888
 * and sometimes 1711999888, depending on who typed it and whether it came out
 * of a phone's contact list. All of those are one customer.
 */
export function normalisePhone(phone?: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // International prefix, dialled or pasted.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("880")) digits = digits.slice(3);
  // A local number that lost its leading zero.
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return digits;
}

/**
 * What identifies a customer: the phone number when there is one, the name
 * only when there is not. Two people called Rifat are two customers; one
 * number is one person.
 */
export function customerKey(name: string, phone?: string) {
  const digits = normalisePhone(phone);
  if (digits) return `p:${digits}`;
  return `n:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
