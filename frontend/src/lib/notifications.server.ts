export type NotificationChannel = "whatsapp" | "sms";

export type DeliveryStatus = {
  status: "sent" | "failed" | "mocked" | "skipped";
  error?: string;
  timestamp: string;
};

export type NotificationResult = Record<NotificationChannel, DeliveryStatus>;

export type SafeTagAlertParams = {
  childName: string;
  code: string;
  locationText?: string | null;
  finderContact?: string | null;
  lat?: number | null;
  lng?: number | null;
  guardianPhone: string;
  timeIst: string;
};

export function maskPhone(phone: string): string {
  const clean = phone.replace(/[^\d+]/g, "");
  if (clean.length <= 4) return "****";
  const start = clean.slice(0, 2);
  const end = clean.slice(-2);
  return `${start}******${end}`;
}

export function normalizeE164(phone: string): string {
  // 1. Strip spaces, dashes, brackets, and non-digit/non-plus chars
  let cleaned = phone.replace(/[\s\-\(\)]/g, "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  // 2. If it already starts with "+", return as is
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // 3. Remove leading zeroes
  cleaned = cleaned.replace(/^0+/, "");

  // 4. If it already starts with "91", add "+" prefix. Otherwise add "+91" by default.
  if (cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  return `+91${cleaned}`;
}

export function formatAlertMessage(params: SafeTagAlertParams): string {
  const { childName, code, locationText, finderContact, lat, lng, timeIst } = params;
  const mapsLink =
    lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const lines = [
    `SafeTag ALERT: ${childName} (tag ${code}) has been found.`,
    `Location: ${locationText?.trim() || "not provided"}.`,
  ];
  if (mapsLink) {
    lines.push(`Map: ${mapsLink}`);
  }
  lines.push(`Finder contact: ${finderContact?.trim() || "not provided"}.`);
  lines.push(`Time: ${timeIst}.`);

  return lines.join("\n");
}

export async function sendTwilioMessage(
  toPhone: string,
  fromPhone: string,
  bodyText: string,
  isWhatsapp: boolean,
  accountSid: string,
  authToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const to = isWhatsapp
      ? toPhone.startsWith("whatsapp:")
        ? toPhone
        : `whatsapp:${toPhone}`
      : toPhone;
    const from = isWhatsapp
      ? fromPhone.startsWith("whatsapp:")
        ? fromPhone
        : `whatsapp:${fromPhone}`
      : fromPhone;

    console.log(`[Twilio ${isWhatsapp ? "WhatsApp" : "SMS"}] Sending to: ${to}`);

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", from);
    formData.append("Body", bodyText);

    const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: formData.toString(),
    });

    const data = (await response.json()) as { status?: string; message?: string; code?: number };

    if (!response.ok) {
      const errMsg = data.message || `HTTP ${response.status}`;
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: errMsg };
  }
}

export async function sendSafeTagAlert(params: SafeTagAlertParams): Promise<NotificationResult> {
  const mode = process.env["NOTIFY_MODE"] || "mock";
  const channelsConfig = process.env["NOTIFY_CHANNELS"] || "whatsapp,sms";
  const activeChannels = channelsConfig
    .toLowerCase()
    .split(",")
    .map((c) => c.trim()) as NotificationChannel[];

  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const whatsappFrom = process.env["TWILIO_WHATSAPP_FROM"];
  const smsFrom = process.env["TWILIO_SMS_FROM"];

  const toE164 = normalizeE164(params.guardianPhone);
  const maskedPhone = maskPhone(toE164);
  const message = formatAlertMessage(params);

  const isMock =
    mode === "mock" ||
    !accountSid ||
    !authToken ||
    accountSid.startsWith("AC_YOUR_") ||
    authToken === "your_auth_token";

  const results: NotificationResult = {
    whatsapp: { status: "skipped", timestamp: new Date().toISOString() },
    sms: { status: "skipped", timestamp: new Date().toISOString() },
  };

  if (isMock) {
    console.log(
      `[SafeTag NOTIFY MOCK] Mode: MOCK. Notification to ${maskedPhone} for tag ${params.code}:\n${message}`,
    );
    if (activeChannels.includes("whatsapp")) {
      results.whatsapp = { status: "mocked", timestamp: new Date().toISOString() };
    }
    if (activeChannels.includes("sms")) {
      results.sms = { status: "mocked", timestamp: new Date().toISOString() };
    }
    return results;
  }

  // Live Mode: WhatsApp first, then SMS
  if (activeChannels.includes("whatsapp")) {
    if (!whatsappFrom) {
      results.whatsapp = {
        status: "failed",
        error: "TWILIO_WHATSAPP_FROM missing",
        timestamp: new Date().toISOString(),
      };
    } else {
      console.log(`[SafeTag NOTIFY LIVE] Sending WhatsApp to ${maskedPhone}...`);
      const waResult = await sendTwilioMessage(
        toE164,
        whatsappFrom,
        message,
        true,
        accountSid,
        authToken,
      );
      if (waResult.success) {
        results.whatsapp = { status: "sent", timestamp: new Date().toISOString() };
      } else {
        results.whatsapp = {
          status: "failed",
          error: waResult.error || "WhatsApp delivery failed",
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  if (activeChannels.includes("sms")) {
    if (!smsFrom) {
      console.log("SMS skipped: TWILIO_SMS_FROM not set");
      results.sms = {
        status: "skipped",
        timestamp: new Date().toISOString(),
      };
    } else {
      console.log(`[SafeTag NOTIFY LIVE] Sending SMS to ${maskedPhone}...`);
      const smsResult = await sendTwilioMessage(
        toE164,
        smsFrom,
        message,
        false,
        accountSid,
        authToken,
      );
      if (smsResult.success) {
        results.sms = { status: "sent", timestamp: new Date().toISOString() };
      } else {
        results.sms = {
          status: "failed",
          error: smsResult.error || "SMS delivery failed",
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  return results;
}
