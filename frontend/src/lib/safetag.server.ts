import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSafeTagAlert } from "./notifications.server";
import {
  checkRateLimit,
  sanitizeCoordinates,
  sanitizeText,
} from "./rate-limit.server";

export async function handleTagAlertRequest(
  request: Request,
  code: string,
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip") ||
      "127.0.0.1";

    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode || cleanCode.length > 20) {
      return Response.json(
        { error: "Invalid tag code format." },
        { status: 400 },
      );
    }

    const rateCheck = checkRateLimit(clientIp, cleanCode);
    if (!rateCheck.allowed) {
      return Response.json(
        {
          error:
            "Too many alert requests. Please wait a few minutes before trying again.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSec || 60) },
        },
      );
    }

    let body: {
      location?: string;
      finderContact?: string;
      lat?: unknown;
      lng?: unknown;
    } = {};
    try {
      body = await request.json();
    } catch {
      // Body can be empty if finder sent no notes
    }

    const locationText = sanitizeText(body.location, 500);
    const finderContact = sanitizeText(body.finderContact, 100);
    const lat = sanitizeCoordinates(body.lat);
    const lng = sanitizeCoordinates(body.lng);

    // Load tag and guardian details server-side ONLY
    const { data: tag, error: tagError } = await supabaseAdmin
      .from("safety_tags")
      .select("id, token, person_name, guardian_name, guardian_phone")
      .eq("token", cleanCode)
      .maybeSingle();

    if (tagError || !tag) {
      return Response.json(
        { error: "Tag not found or inactive." },
        { status: 404 },
      );
    }

    const timeIst =
      new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }) + " IST";

    // Send notifications (WhatsApp then SMS)
    const deliveryStatus = await sendSafeTagAlert({
      childName: tag.person_name,
      code: tag.token,
      locationText,
      finderContact,
      lat,
      lng,
      guardianPhone: tag.guardian_phone,
      timeIst,
    });

    const notified = Object.values(deliveryStatus).some(
      (ch) => ch?.status === "sent" || ch?.status === "mocked",
    );

    if (!notified) {
      console.error(
        "[SafeTag Alert] Guardian notification failed across all channels:",
        deliveryStatus,
      );
    }

    // Save alert record in database
    const { error: scanError } = await supabaseAdmin
      .from("safety_tag_scans")
      .insert({
        safety_tag_id: tag.id,
        finder_note: locationText,
        finder_contact: finderContact,
        lat,
        lng,
        delivery_status: deliveryStatus,
      });

    if (scanError) {
      console.error("[SafeTag Alert] Error saving scan record:", scanError);
    }

    // Return strictly sanitized response - zero guardian data leakage
    return Response.json({ success: true, notified }, { status: 200 });
  } catch (err) {
    console.error("[SafeTag Alert] Unhandled exception:", err);
    return Response.json(
      { error: "Could not send alert. Please try again." },
      { status: 500 },
    );
  }
}
