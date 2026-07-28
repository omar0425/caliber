import { NextRequest, NextResponse } from "next/server";
import { changeLoginPassword } from "@/lib/password";
import { hasValidFormOrigin, publicRequestOrigin } from "@/lib/requestOrigin";
import {
  enforceContentLength,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

type PasswordResult =
  | "changed"
  | "missing-current"
  | "too-short"
  | "too-long"
  | "same"
  | "mismatch"
  | "incorrect";

function respond(
  req: NextRequest,
  formSubmission: boolean,
  result: PasswordResult,
  error: string | null,
  status = 200
) {
  if (!formSubmission) {
    return error
      ? NextResponse.json({ error }, { status })
      : NextResponse.json({ changed: true });
  }

  const url = new URL("/settings", publicRequestOrigin(req));
  if (result === "changed") url.searchParams.set("password", "changed");
  else url.searchParams.set("passwordError", result);
  url.hash = "login-security";
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 4 * 1024);
    if (!hasValidFormOrigin(req)) {
      throw new RequestError("Invalid password-change origin.", 403);
    }

    const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const formSubmission = contentType === "application/x-www-form-urlencoded";
    if (!formSubmission && contentType !== "application/json") {
      throw new RequestError("Unsupported content type.", 415);
    }

    let currentValue: unknown;
    let newValue: unknown;
    let confirmValue: unknown;
    if (formSubmission) {
      const form = await req.formData();
      currentValue = form.get("currentPassword");
      newValue = form.get("newPassword");
      confirmValue = form.get("confirmPassword");
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      currentValue = body.currentPassword;
      newValue = body.newPassword;
      confirmValue = body.confirmPassword;
    }
    const currentPassword = typeof currentValue === "string" ? currentValue : "";
    const newPassword = typeof newValue === "string" ? newValue : "";
    const confirmPassword = typeof confirmValue === "string" ? confirmValue : "";

    if (!currentPassword) {
      return respond(
        req,
        formSubmission,
        "missing-current",
        "Enter your current password.",
        400
      );
    }
    if (newPassword.length < 12) {
      return respond(
        req,
        formSubmission,
        "too-short",
        "Use at least 12 characters for the new password.",
        400
      );
    }
    if (currentPassword.length > 512 || newPassword.length > 512) {
      return respond(req, formSubmission, "too-long", "That password is too long.", 400);
    }
    if (currentPassword === newPassword) {
      return respond(
        req,
        formSubmission,
        "same",
        "Choose a different new password.",
        400
      );
    }
    if (newPassword !== confirmPassword) {
      return respond(
        req,
        formSubmission,
        "mismatch",
        "The new passwords do not match.",
        400
      );
    }
    if (!(await changeLoginPassword(currentPassword, newPassword))) {
      return respond(
        req,
        formSubmission,
        "incorrect",
        "The current password is incorrect.",
        403
      );
    }

    const response = respond(req, formSubmission, "changed", null);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestError
            ? error.message
            : "Unable to change the password.",
      },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}
