const { createClient } = require("@supabase/supabase-js");

const url = "https://nxhccqbvjrxqqfvpfcmx.supabase.co";
const anonKey = "sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ";

const supabase = createClient(url, anonKey);

async function run() {
  const { data, error } = await supabase
    .from("trips")
    .select("id, schedule_id, trip_date, status");
  if (error) {
    console.error("Error querying trips:", error);
  } else {
    console.log("All visible trips:", JSON.stringify(data, null, 2));
  }
}

run();
