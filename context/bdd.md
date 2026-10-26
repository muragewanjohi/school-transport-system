# Module: Guardian-aware parent RLS + profile column guard

**Status:** `passing`  
**Stack:** Supabase migration `20261026120000_guardian_aware_parent_rls.sql` (tested on PGlite via Vitest `apps/admin_dashboard/src/lib/rlsGuardianParent.test.ts`; Flutter `test/parent_children_fallback_test.dart`) + Flutter parent_app fallback roster query.

Spec: [architecture.md](architecture.md) — "Parent ownership in RLS" and "Profile column guard".

## Scenarios — parent read access (RLS)

### Happy — secondary guardian reads the child
```gherkin
Given Brian's parent_id is Elizaphan and Caroline's phone is in Brian's guardians as 07…
And Caroline is signed in with a parent JWT for the same school
When she selects from students
Then she sees Brian
```

### Happy — secondary guardian reads route data
```gherkin
Given Caroline is a guardian on Brian, whose route is R1
When she selects from routes, stops, schedules, trips, live_coordinates and trip_stop_etas
Then she sees R1's rows and nothing from other routes
```

### Happy — primary parent unchanged
```gherkin
Given Elizaphan is Brian's parent_id
When he selects from students
Then he sees Brian
```

### Sad — unrelated parent
```gherkin
Given a parent whose phone is not on any guardian list
When they select from students or live_coordinates
Then they see nothing
```

### Sad — same phone in another school
```gherkin
Given Caroline's phone is also a guardian on a student in School B
When she (School A) selects from students
Then the School B student is not returned
```

### Sad — secondary guardian cannot edit the child
```gherkin
Given Caroline is a guardian but not Brian's parent_id
When she updates Brian's avatar_url
Then no row is updated
```

## Scenarios — profile column guard

### Sad — parent escalates own role
```gherkin
Given a parent signed in with an authenticated JWT
When they update their own profiles.role to super_admin
Then the update is rejected
```

### Sad — parent changes own phone to claim a child
```gherkin
Given a parent signed in with an authenticated JWT
When they update their own profiles.phone
Then the update is rejected
```

### Happy — parent updates own avatar
```gherkin
Given a parent signed in with an authenticated JWT
When they update their own profiles.avatar_url
Then the update succeeds
```

### Sad — end user inserts a profile
```gherkin
Given an authenticated user with no profile
When they insert a profiles row for themselves
Then the insert is rejected
```

### Sad — forged user_metadata role
```gherkin
Given an authenticated user whose user_metadata.role is super_admin but app_metadata has no role
When they update their own profiles.role
Then the update is rejected
```

### Sad — school admin promotes to platform admin
```gherkin
Given a school_admin (app_metadata) in School A
When they set a School A profile's role to super_admin
Then the update is rejected
```

### Happy — service role unaffected
```gherkin
Given a service-role connection
When it updates a profile's role, phone or tenant_id
Then the update succeeds
```

## Scenarios — Flutter fallback roster

### Happy — fallback relies on RLS, not parent_id
```gherkin
Given the children API is unreachable
When the parent app falls back to a direct students query
Then the query is not filtered by parent_id (RLS scopes it to the caller's children)
```
