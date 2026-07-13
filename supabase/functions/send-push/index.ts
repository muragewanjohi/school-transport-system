import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

// Helper to sign JWT and fetch Google OAuth Access Token using Web Crypto API
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pem = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDerString = atob(pem);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const textEncoder = new TextEncoder();
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedClaim = btoa(JSON.stringify(claim)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const stringToSign = `${encodedHeader}.${encodedClaim}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    textEncoder.encode(stringToSign)
  );

  const signedJwt = `${stringToSign}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json();
    const record = body.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "Missing notification record" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { user_id, title, message, notification_type } = record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const firebaseJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables");
    }

    if (!firebaseJson) {
      // If service account key is missing, log warning and complete gracefully so webhook doesn't crash
      console.warn("FCM push notification skipped: FIREBASE_SERVICE_ACCOUNT environment variable is not configured.");
      return new Response(JSON.stringify({ 
        success: false, 
        error: "FIREBASE_SERVICE_ACCOUNT is not configured. Push skipped." 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const serviceAccount = JSON.parse(firebaseJson);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user push tokens
    const { data: tokenRows, error: tokenError } = await supabase
      .from("user_fcm_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (tokenError) {
      throw new Error(`Failed to query user FCM tokens: ${tokenError.message}`);
    }

    if (!tokenRows || tokenRows.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No registered FCM tokens found for this user. Push skipped." 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Authenticate with Google APIs
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const sendPromises = tokenRows.map(async (row) => {
      const payload = {
        message: {
          token: row.token,
          notification: {
            title: title,
            body: message,
          },
          data: {
            notification_type: notification_type || "general",
            click_action: "FLUTTER_NOTIFICATION_CLICK"
          }
        }
      };

      try {
        const response = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const resData = await response.json();
        if (!response.ok) {
          console.error(`FCM send error for token ${row.token.substring(0, 10)}...:`, resData);
        }
        return { token: row.token, ok: response.ok, result: resData };
      } catch (e: any) {
        console.error(`FCM dispatch network error for token ${row.token.substring(0, 10)}...:`, e.message);
        return { token: row.token, ok: false, error: e.message };
      }
    });

    const results = await Promise.all(sendPromises);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Push notifications dispatch completed", 
      results 
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    console.error("FCM Edge Function Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
