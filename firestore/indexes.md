# Firestore Indexes (BookBeauty)

Maak deze composite indexes aan:

1. `companies_public`
- Query: `where(isActive == true)` + `orderBy(name asc)`
- Fields:
  - `isActive` Asc
  - `name` Asc

2. `companies_public`
- Query: `where(isActive == true)` + `where(categories array-contains X)` + `orderBy(name asc)`
- Fields:
  - `isActive` Asc
  - `categories` Array-contains
  - `name` Asc

3. `companies_public/{companyId}/services_public`
- Query: `where(isActive == true)` + `orderBy(category asc)` + `orderBy(price asc)`
- Fields:
  - `isActive` Asc
  - `category` Asc
  - `price` Asc

4. `feed_public`
- Query: `where(isActive == true)` + `orderBy(createdAt desc)`
- Fields:
  - `isActive` Asc
  - `createdAt` Desc

5. `feed_public`
- Query: `where(isActive == true)` + `where(category == X)` + `orderBy(createdAt desc)`
- Fields:
  - `isActive` Asc
  - `category` Asc
  - `createdAt` Desc

6. `feed_public`
- Query: `where(companyId == X)` + `orderBy(createdAt desc)`
- Fields:
  - `companyId` Asc
  - `createdAt` Desc

7. `feed_public`
- Query: `where(companyId == X)` + `where(isActive == true)` + `orderBy(createdAt desc)`
- Fields:
  - `companyId` Asc
  - `isActive` Asc
  - `createdAt` Desc

8. `bookings`
- Query: `where(companyId == X)` + `where(bookingDate == YYYY-MM-DD)`
- Fields:
  - `companyId` Asc
  - `bookingDate` Asc

## Geen extra composite index nodig
- `bookings` met alleen `where(companyId == X)`
- `bookings` met alleen `where(customerId == X)`
- `feed_public/{postId}/comments` met `orderBy(createdAt desc)` (single-field)
- `companies/{companyId}/notifications` met `orderBy(createdAt desc)` of `where(read == false)` (single-field)
- `booking_slot_locks` gebruikt punt-reads op document-ID (geen query-index)
