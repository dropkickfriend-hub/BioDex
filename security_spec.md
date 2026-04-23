# BioDex Security Specification

## 1. Data Invariants
- An observation MUST have a valid `userId` matching the authenticated user.
- Species data (commonName, scientificName) must be strings of reasonable length (< 200 chars).
- Observations are immutable once created to ensure scientific integrity of the historical record.
- Users can ONLY read their own observations, except for global summary data.
- User profiles must have `ageVerified` set to true to exist (enforced by application logic and rules).

## 2. The Dirty Dozen Payloads (Targeting PERMISSION_DENIED)
1. Creating an observation with someone else's `userId`.
2. Updating an existing observation (Immutability check).
3. Deleting an observation (Scientific record persistence).
4. Reading another user's observation document directly.
5. Creating a user profile for another UID.
6. Updating `ageVerified` to `false` after initial setup.
7. Creating an observation with an invalid geohash (oversized string).
8. Creating an observation with a massive `description` string (> 50KB).
9. Listing the entire `observations` collection without a `userId` filter.
10. Creating an observation with a future timestamp.
11. Modifying the `speciesId` of an existing observation.
12. Accessing the `users` collection without being authenticated.

## 3. Test Runner Concept
The `firestore.rules` will be validated against these scenarios to ensure Zero-Trust access.
