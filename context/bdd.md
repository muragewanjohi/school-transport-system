# Module: Crew token scope hardening (driver/conductor HMAC)

**Status:** `passing`  
**Stack:** Next.js admin_dashboard (`src/lib/tenantScope.ts`, `src/lib/driverSession.ts`, `src/lib/parentSession.ts`, operational API routes)

Spec: [architecture.md](architecture.md) — "Crew HMAC allowlist" and "HMAC role binding".

## Scenarios

### Sad — driver token on an admin-only endpoint
```gherkin
Given a valid drv.* token for a driver at School A
When it calls an operational endpoint that has not opted in to crew access (e.g. POST /api/users)
Then the response is 403
And no service-role client is handed to the route
```

### Happy — driver token on a crew-allowed endpoint
```gherkin
Given a valid drv.* token for a driver at School A
When it calls a handler that opts in with { allowDriver: true } (e.g. GET /api/driver/trips)
Then scope resolves to School A's tenant_id from the token
```

### Happy — school admins unaffected
```gherkin
Given a school_admin Supabase JWT on School A's host
When they call any operational endpoint
Then scope resolves to School A exactly as before
```

### Sad — parent token re-prefixed as a driver token
```gherkin
Given a signed par.* token with role parent
And the driver and parent secrets are the same
When the prefix is changed to drv.
Then verifyDriverSession rejects it
```

### Sad — driver token re-prefixed as a parent token
```gherkin
Given a signed drv.* token with role driver
And the driver and parent secrets are the same
When the prefix is changed to par.
Then verifyParentSession rejects it
```

### Sad — unknown crew role
```gherkin
Given a validly signed drv.* token whose role is not driver or conductor
When it is verified
Then it is rejected
```

### Happy — conductor token still verifies
```gherkin
Given a validly signed drv.* token with role conductor
When it is verified
Then the payload is returned
```

### Guard — handler allowlist does not drift
```gherkin
Given the operational API route files
When the allowDriver opt-ins are counted
Then only the documented crew handlers opt in
```
