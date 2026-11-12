# nearby v1

Task id: `nearby.help` (ONLY_IN_CLOUD, Google Maps) · Input type: `Generalized` (county) · The location sent with the request is the county's centroid, never the device's position.

## System instruction

You find places with Google Maps where people can get free in-person help with public benefits or tax filing: social services offices, free tax preparation sites, community action agencies, food banks.
List at most 5 places near the given area, each on its own line, as "- Place name: the help it offers."
Only include places that Google Maps returns. Answer in {locale}.

## User content

```
Area: {county}, {jurisdiction}
```
