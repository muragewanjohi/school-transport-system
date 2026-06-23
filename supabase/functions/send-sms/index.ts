import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

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
      return new Response(JSON.stringify({ error: "Missing record payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id, student_id, parent_id, message_type, custom_message } = record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch student name and parent profile details (bypassing RLS with service role client)
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("name, parent:profiles!parent_id(phone, name)")
      .eq("id", student_id)
      .single();

    if (studentError || !student) {
      throw new Error(`Failed to fetch student details: ${studentError?.message || "Not found"}`);
    }

    // Cast the nested parent profiles join
    const parentProfile = student.parent as unknown as { phone: string; name: string } | null;
    const parentPhone = parentProfile?.phone;
    const studentName = student.name;

    if (!parentPhone) {
      throw new Error(`Parent phone number not found for student: ${studentName}`);
    }

    // Format the alert message
    let message = custom_message || "";
    const nowTime = new Date().toLocaleTimeString("en-US", { hour12: true });

    if (!message) {
      if (message_type === "proximity") {
        message = `Safaricom Track: The school bus is 5 minutes away. Please prepare ${studentName} for pickup.`;
      } else if (message_type === "boarding") {
        message = `Safaricom Track: ${studentName} has safely boarded the school bus at ${nowTime}.`;
      } else if (message_type === "dropoff") {
        message = `Safaricom Track: ${studentName} has been dropped off at school/home at ${nowTime}.`;
      } else {
        throw new Error(`Invalid message type: ${message_type}`);
      }
    }

    // Read Africa's Talking credentials
    const atUsername = Deno.env.get("AFRICASTALKING_USERNAME") || "sandbox";
    const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");
    const atSenderId = Deno.env.get("AFRICASTALKING_SENDER_ID"); // Optional custom sender ID

    if (!atApiKey) {
      throw new Error("Missing AFRICASTALKING_API_KEY environment variable");
    }

    // Clean phone number: Africa's Talking requires international format (e.g., +2547XXXXXXXX)
    let cleanPhone = parentPhone.trim();
    if (cleanPhone.startsWith("0")) {
      cleanPhone = `+254${cleanPhone.slice(1)}`;
    }
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${cleanPhone}`;
    }

    const params = new URLSearchParams();
    params.append("username", atUsername);
    params.append("to", cleanPhone);
    params.append("message", message);
    if (atSenderId) {
      params.append("from", atSenderId);
    }

    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": atApiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: params.toString(),
    });

    const atResult = await response.json();
    if (!response.ok) {
      throw new Error(`Africa's Talking API error: ${JSON.stringify(atResult)}`);
    }

    // Mark enqueued alert record as processed in the database
    const { error: updateError } = await supabase
      .from("alerts_queue")
      .update({ processed: true })
      .eq("id", id);

    if (updateError) {
      console.error(`Failed to update alerts_queue row ${id}:`, updateError.message);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "SMS dispatched successfully", 
      result: atResult 
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    console.error("SMS Edge Function Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
