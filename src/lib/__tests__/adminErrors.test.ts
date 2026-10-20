import { describe, expect, it } from "vitest";
import { classifyCreateUserError, createUserErrorKey } from "@/lib/adminErrors";

describe("admin create-user error mapping", () => {
  it("maps the leaked-password rejection to a weak-password code", () => {
    expect(
      classifyCreateUserError({
        code: "weak_password",
        message: "Password is known to be weak and easy to guess, please choose a different one.",
        status: 422,
      }),
    ).toBe("ADMIN_WEAK_PASSWORD");
  });
  it("maps duplicate e-mail to a controlled code", () => {
    expect(classifyCreateUserError({ code: "email_exists", message: "x" })).toBe("ADMIN_EMAIL_EXISTS");
  });
  it("keeps unknown failures generic", () => {
    expect(classifyCreateUserError({ message: "boom" })).toBe("ADMIN_OPERATION_FAILED");
  });
  it("selects the matching UI message key", () => {
    expect(createUserErrorKey("ADMIN_WEAK_PASSWORD")).toBe("admin.error.weakPassword");
    expect(createUserErrorKey("ADMIN_EMAIL_EXISTS")).toBe("admin.error.emailExists");
    expect(createUserErrorKey("other")).toBe("admin.error.generic");
  });
});
