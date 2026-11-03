# Module: OTP delivery log + email-sent screen

**Status:** `passing`  
**Stack:** Supabase migration `20261103120000_otp_delivery_log.sql`; Next.js admin_dashboard (`issuePhoneOtp`, `/api/webhooks/africastalking/delivery-report`, `/api/webhooks/resend`, `/api/otp-deliveries`, staff + student console chips, nightly purge); Flutter parent_app login verification screen.

Spec: [architecture.md](architecture.md) — "OTP delivery log" and "Parent app code screen".

## Scenarios — recording sends

### Happy — SMS accepted
```gherkin
Given a registered parent requests an OTP in production
When Africa's Talking accepts the SMS with messageId ATXid_1
Then an otp_delivery_log row is written with channel sms, status sent, provider_message_id ATXid_1
And the row does not contain the OTP code
```

### Sad — SMS refused, email fallback
```gherkin
Given Africa's Talking refuses the SMS (UserInBlacklist) and the parent has an email
When the parent requests an OTP
Then an sms row is written with status failed and the reason
And an email row is written with status sent and the Resend id
```

### Happy — email requested directly
```gherkin
Given the parent taps Send code via email
When the OTP is emailed
Then only an email row is written
```

### Guard — logging cannot break login
```gherkin
Given writing to otp_delivery_log fails
When the parent requests an OTP
Then the OTP response is unchanged
```

### Guard — dry run is not logged
```gherkin
Given SMS dry-run or Play Review
When an OTP is requested
Then no otp_delivery_log row is written
```

## Scenarios — delivery reports

### Happy — SMS delivered
```gherkin
Given a logged sms row with provider_message_id ATXid_1
When Africa's Talking posts a delivery report id=ATXid_1 status=Success with the right token
Then the row status becomes delivered
```

### Sad — SMS undelivered
```gherkin
When Africa's Talking posts status=Failed failureReason=UserInBlacklist
Then the row status becomes undelivered with that reason
```

### Sad — wrong or missing token
```gherkin
When a delivery report arrives with a wrong token
Then the response is 401 and nothing is updated
```

### Happy — email bounced
```gherkin
Given a logged email row with Resend id em_1
When a correctly signed email.bounced webhook arrives
Then the row status becomes undelivered with reason bounced
```

### Sad — bad email webhook signature or stale timestamp
```gherkin
When a Resend webhook has an invalid signature or a timestamp older than 5 minutes
Then the response is 401 and nothing is updated
```

## Scenarios — console

### Happy — school admin sees latest status
```gherkin
Given a school admin of School A
When they load GET /api/otp-deliveries
Then they get the latest attempt per profile in School A only
```

### Sad — driver token
```gherkin
Given a driver drv.* token
When it calls GET /api/otp-deliveries
Then the response is 403
```

### Happy — status chip
```gherkin
Given a parent's latest SMS is undelivered with UserInBlacklist
When the admin views the student roster
Then the guardian's phone shows "SMS not delivered · UserInBlacklist" with the time
```

### Guard — retention
```gherkin
Given otp_delivery_log rows older than 30 days
When the nightly purge runs
Then those rows are deleted
```

## Scenarios — parent app

### Happy — code went by email
```gherkin
Given the OTP response has source email and email_hint j***@gmail.com
When the verification screen opens
Then it says "We've emailed a 6-digit code to" j***@gmail.com and asks to check spam
```

### Happy — code went by SMS
```gherkin
Given the OTP response has source sms
When the verification screen opens
Then it says "We've sent a 6-digit code to" the phone number
```

### Happy — switched to email
```gherkin
Given the verification screen shows the phone
When the parent taps Send code via email and it succeeds
Then the heading switches to the email address
```
