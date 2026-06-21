-- Enable pg_net extension to support asynchronous HTTP request execution
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Database trigger function to invoke the send-sms Edge Function
CREATE OR REPLACE FUNCTION public.trigger_alert_webhook()
RETURNS TRIGGER AS $$
DECLARE
  request_host TEXT;
  webhook_url TEXT;
BEGIN
  -- Extract hostname from request headers if available
  BEGIN
    request_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION
    WHEN OTHERS THEN
      request_host := NULL;
  END;

  -- Default to user's production project reference if host headers are absent
  IF request_host IS NULL OR request_host = '' THEN
    request_host := 'nxhccqbvjrxqqfvpfcmx.supabase.co';
  END IF;

  -- Map local development connections to local Docker container gateway, 
  -- and hosted connections to the production project API URL
  IF request_host LIKE 'localhost%' OR request_host LIKE '127.0.0.1%' OR request_host LIKE '54321%' THEN
    webhook_url := 'http://kong:8000/functions/v1/send-sms';
  ELSE
    -- Ensure schema is attached if request_host is just the domain ref
    IF request_host NOT LIKE 'http%' THEN
      webhook_url := 'https://' || request_host || '/functions/v1/send-sms';
    ELSE
      webhook_url := request_host || '/functions/v1/send-sms';
    END IF;
  END IF;

  -- Invoke the Edge Function asynchronously via pg_net
  BEGIN
    PERFORM extensions.net_http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('private.keys.service_role', true), '')
      ),
      body := jsonb_build_object('record', row_to_json(new)),
      timeout_ms := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log exception as warning to prevent database inserts from failing 
      -- due to offline environments or network timeout latency
      RAISE WARNING 'Failed to trigger alerts_queue SMS webhook: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to alerts_queue INSERT execution
CREATE OR REPLACE TRIGGER on_alert_queued
  AFTER INSERT ON public.alerts_queue
  FOR EACH ROW EXECUTE FUNCTION public.trigger_alert_webhook();
