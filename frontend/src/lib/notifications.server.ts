/**
 * SafeTag notification channels (Twilio WhatsApp and SMS).
 * Default channel: whatsapp (SMS is paid and fails on unpaid Twilio accounts).
 */

export function getNotifyChannels(): string[] {
  const envVal = process.env["NOTIFY_CHANNELS"];
  if (!envVal || envVal.trim() === "") {
    return ["whatsapp"];
  }
  return envVal
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Mask all digits except the last 2 for privacy and audit safety.
 * Example: "+919876543210" -> "+***********10"
 */
export function maskPhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 2) return "**";
  const visible = trimmed.slice(-2);
  const prefix = trimmed.slice(0, -2);
  return prefix.replace(/\d/g, "*") + visible;
}

export type SafeTagAlertPayload = {
  guardianPhone: string;
  personName: string;
  finderNote?: string | null;
  finderContact?: string | null;
};

async function sendTwilioMessage(to: string, body: string): Promise<void> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_PHONE_NUMBER"] || process.env["TWILIO_WHATSAPP_NUMBER"];

  if (!accountSid || !authToken || !fromNumber) {
    // If Twilio credentials are not configured, log concisely and return
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", fromNumber);
  params.set("Body", body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    const err: any = new Error(errorJson.message || `Twilio HTTP ${res.status}`);
    err.code = errorJson.code || res.status;
    throw err;
  }
}

export async function sendSafeTagAlert(
  payload: SafeTagAlertPayload,
): Promise<{ success: boolean; channelsAttempted: string[] }> {
  const channels = getNotifyChannels();
  const attempted: string[] = [];

  const alertBody = `[Safr Alert] A family SafeTag wristband for "${payload.personName}" was just scanned in Goa.${
    payload.finderNote ? ` Note: "${payload.finderNote}".` : ""
  }${payload.finderContact ? ` Finder Contact: ${payload.finderContact}` : ""}`;

  for (const channel of channels) {
    attempted.push(channel);
    try {
      if (channel === "whatsapp") {
        const to = payload.guardianPhone.startsWith("whatsapp:")
          ? payload.guardianPhone
          : `whatsapp:${payload.guardianPhone}`;
        await sendTwilioMessage(to, alertBody);
      } else if (channel === "sms") {
        const to = payload.guardianPhone.replace(/^whatsapp:/, "");
        await sendTwilioMessage(to, alertBody);
      }
    } catch (err: any) {
      const code = err?.code || "UNKNOWN";
      // Log single concise error with Twilio code and masked phone, never expose to finder
      console.error(
        `[notifications] Twilio delivery failed for channel "${channel}" (code: ${code}, recipient: ${maskPhoneNumber(
          payload.guardianPhone,
        )})`,
      );
    }
  }

  return { success: true, channelsAttempted: attempted };
}
