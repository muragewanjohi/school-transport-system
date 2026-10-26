# Module: Secondary guardians in the parent app

**Status:** `passing`  
**Stack:** Next.js admin_dashboard (`GET /api/parent/children`, `GET /api/parent/etas`, `src/lib/parentChildren.ts`)

Spec: [architecture.md](architecture.md) — "Parent Mobile Session & Live ETA API" (ownership rule).

## Scenarios

### Happy — secondary guardian sees the child
```gherkin
Given Brian's guardians are Elizaphan (primary, parent_id) and Caroline
And Caroline has logged in with her own phone via OTP
When Caroline's app loads GET /api/parent/children
Then Brian is in her children list
And Brian's parent_id is still Elizaphan
```

### Happy — primary parent unchanged
```gherkin
Given a parent whose id is a student's parent_id
When they load GET /api/parent/children
Then that student is returned
```

### Happy — unlinked student still auto-links
```gherkin
Given a student with no parent_id whose guardian phone matches the parent
When the parent loads GET /api/parent/children
Then the student is returned and parent_id is set to that parent
```

### Sad — unrelated parent sees nothing
```gherkin
Given a parent whose phone is not on any student's guardians
When they load GET /api/parent/children
Then the children list is empty
```

### Happy — secondary guardian gets ETAs
```gherkin
Given Caroline is a guardian on Brian but not his parent_id
When she requests GET /api/parent/etas?student_id=<Brian>
Then the response is 200 (not 403)
```

### Sad — ETAs for someone else's child
```gherkin
Given a student whose parent_id and guardians do not include the caller
When the caller requests GET /api/parent/etas for that student
Then the response is 403
```

## Out of scope (tracked in progress-tracker Open Questions)
Trip-start / proximity push and SMS alerts are queued by DB triggers for `students.parent_id` only, so secondary guardians do not yet receive them.
