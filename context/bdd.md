# Module: Trips sidebar — history vs override

**Status:** `passing`  
**Stack:** Next.js admin_dashboard (sidebar, `/trips/history`, `/trips/override`)

## Scenarios

### Happy — Trips has its own menu
```gherkin
Given a school admin is signed in to the school console
When they open the sidebar
Then Trips is a top-level item (not under Routes)
And it has Today's trip history and Override trip
```

### Happy — history has no override actions
```gherkin
Given today's scheduled runs
When the admin opens Today's trip history
Then they see the same trip table as before
And there is no Overrides column or Update Status
```

### Happy — override matches today's trips
```gherkin
Given a non-completed trip run
When the admin opens Override trip
Then Update Status is available (hidden for Completed)
```

### Failure — completed trips stay locked
```gherkin
Given a completed trip
When override is checked
Then Update Status is blocked
```

## Automation map

| Scenario | Test |
| :--- | :--- |
| Trips submenu paths | `src/lib/schoolCampusNav.test.ts` |
| History vs override display status | `src/lib/tripDisplayStatus.test.ts` |
| Completed lock | `src/lib/todayTripOverride.test.ts` |
