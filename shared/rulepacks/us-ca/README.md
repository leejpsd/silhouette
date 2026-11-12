# Rule pack: United States — California (`us-ca`)

Status: **draft in review**. No `pack.json` ships until every number has been checked by the project owner against its official source.

## Planned programs

| Program | Official source to verify against |
|---|---|
| Federal Earned Income Tax Credit (EITC) | irs.gov |
| California Earned Income Tax Credit (CalEITC) | ftb.ca.gov |
| Young Child Tax Credit (YCTC) | ftb.ca.gov |
| CalFresh | cdss.ca.gov |
| California LifeLine | californialifeline.com / cpuc.ca.gov |
| CARE (energy bill discount) | cpuc.ca.gov |

## Verification procedure

1. A draft of `pack.json` and `../../bands/us-ca.json` is prepared from the official pages, recording the exact URL and a verbatim quote for every number.
2. The project owner opens each URL, compares every threshold, table and amount, and fills `checkedAt` / `checkedBy`.
3. Only then is `verifiedOn` set and the pack shipped.

Sensitive questions for this pack (asked on device, skippable): filing status, taxpayer id type, immigration-related eligibility.
