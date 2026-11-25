# **CROPSY**

# **Implementation-Ready Technical Blueprint**

**Document version:** 1.0  
**Date:** 25 November 2026  
**Status:** Engineering Baseline  
**Architecture:** Modular Monolith  
**Primary language:** JavaScript  
**Database:** PostgreSQL \+ PostGIS  
**ORM:** Prisma  
**API standard:** OpenAPI 3.1.0

---

# **PART A — IMPLEMENTATION BASELINE**

## **A1. System architecture**

```
CROPSY/
│
├── apps/
│   ├── web/                      # Next.js + JavaScript
│   ├── mobile/                   # React Native + Expo
│   └── api/                      # Fastify + JavaScript
│
├── services/
│   └── ai-service/               # Python + FastAPI
│
├── packages/
│   ├── shared-schemas/
│   ├── api-client/
│   ├── constants/
│   └── shared-utils/
│
├── infrastructure/
│   ├── database/
│   ├── redis/
│   └── monitoring/
│
├── docs/
│   ├── SRS.md
│   ├── SDD.md
│   ├── DATABASE.md
│   ├── API.md
│   └── DEVELOPMENT_PLAN.md
│
└── README.md
```

## **A2. Backend module structure**

Every module should follow a consistent structure:

```
modules/
├── identity/
├── access-control/
├── users/
├── locations/
├── farmers/
├── buyers/
├── farmer-groups/
├── catalog/
├── marketplace/
├── price-intelligence/
├── trading/
├── auctions/
├── orders/
├── payments/
├── ledger/
├── logistics/
├── quality/
├── warehouse/
├── traceability/
├── communication/
├── notifications/
├── disputes/
├── ai/
├── administration/
├── analytics/
└── audit/
```

Example module:

```
marketplace/
├── marketplace.routes.js
├── marketplace.controller.js
├── marketplace.service.js
├── marketplace.repository.js
├── marketplace.schema.js
├── marketplace.policy.js
├── marketplace.events.js
├── marketplace.constants.js
└── tests/
    ├── marketplace.unit.test.js
    └── marketplace.integration.test.js
```

## **A3. Core implementation rules**

1. All critical transactions are server-authoritative.  
2. All money values use PostgreSQL `Decimal`, not floating-point numbers.  
3. Every critical state transition must be validated.  
4. Financial records must be immutable after posting.  
5. Payment webhooks must be signature-verified and idempotent.  
6. Inventory reservations must be atomic.  
7. Auction bids must be safe under concurrent requests.  
8. All administrative actions must be auditable.  
9. AI services must not directly mutate order, payment, or ledger records.  
10. Every background job must be retry-safe.  
11. Database migrations must be version-controlled.  
12. The web and mobile applications must use the same backend API.

---

# **PART B — PRISMA DATABASE SCHEMA**

## **B1. Database configuration**

Recommended dependencies:

```
npm install prisma @prisma/client
npm install zod
npm install fastify @fastify/cors @fastify/helmet
npm install ioredis bullmq
npm install socket.io
npm install argon2
npm install jose
npm install @fastify/rate-limit
npm install @fastify/swagger @fastify/swagger-ui

npm install -D jest
npm install -D supertest
```

Initialize Prisma:

```
npx prisma init
```

Configure `.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/cropsy?schema=public"

REDIS_URL="redis://localhost:6379"

NODE_ENV="development"
PORT=4000
```

Enable PostGIS through a SQL migration:

```
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

The PostGIS extension may require database-provider support and appropriate database permissions.

## **B2. Complete initial Prisma schema**

The following is the initial relational schema baseline for the CROPSY application. It covers identity, profiles, geography, catalog, marketplace, trading, orders, payments, ledger, logistics, quality, communication, disputes, AI metadata, and auditability.

Save as:

`apps/api/prisma/schema.prisma`

```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==========================================
// ENUMS
// ==========================================

enum UserStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  BLOCKED
  DEACTIVATED
}

enum Language {
  BN
  EN
}

enum VerificationStatus {
  NOT_SUBMITTED
  PENDING
  APPROVED
  REJECTED
  NEEDS_MORE_INFORMATION
}

enum AccountType {
  FARMER
  BUYER
  TRANSPORTER
  CONSUMER
  ADMIN
}

enum BusinessType {
  WHOLESALER
  RETAILER
  RESTAURANT
  INSTITUTION
  PROCESSOR
  OTHER
}

enum AddressType {
  HOME
  FARM
  BUSINESS
  WAREHOUSE
  OTHER
}

enum ListingStatus {
  DRAFT
  PENDING_REVIEW
  ACTIVE
  PAUSED
  RESERVED
  SOLD
  EXPIRED
  CANCELLED
  REJECTED
}

enum PriceType {
  FARM_GATE
  WHOLESALE
  RETAIL
  PLATFORM_TRANSACTION
}

enum OfferStatus {
  PENDING
  COUNTERED
  ACCEPTED
  REJECTED
  WITHDRAWN
  EXPIRED
  CANCELLED
}

enum AuctionStatus {
  SCHEDULED
  ACTIVE
  CLOSED
  CANCELLED
  NO_WINNER
}

enum BidStatus {
  ACCEPTED
  REJECTED
  RETRACTED
}

enum OrderStatus {
  PENDING_CONFIRMATION
  CONFIRMED
  PAYMENT_PENDING
  PAID
  PROCESSING
  READY_FOR_PICKUP
  IN_TRANSIT
  DELIVERED
  COMPLETED
  CANCELLED
  REFUND_PENDING
  PARTIALLY_REFUNDED
  REFUNDED
  DISPUTED
}

enum PaymentStatus {
  CREATED
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  EXPIRED
  REFUND_PENDING
  PARTIALLY_REFUNDED
  REFUNDED
}

enum PaymentTransactionType {
  INITIATION
  VERIFICATION
  CAPTURE
  REFUND
  WEBHOOK
  RECONCILIATION
}

enum LedgerAccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

enum JournalStatus {
  DRAFT
  POSTED
  REVERSED
}

enum ShipmentStatus {
  REQUESTED
  ASSIGNED
  ACCEPTED
  PICKED_UP
  IN_TRANSIT
  DELIVERED
  DELIVERY_EXCEPTION
  RETURNED
  CANCELLED
}

enum ShipmentEventType {
  ASSIGNED
  ACCEPTED
  PICKED_UP
  LOCATION_UPDATED
  IN_TRANSIT
  DELIVERY_EXCEPTION
  DELIVERED
  RETURNED
}

enum InspectionResult {
  PENDING
  PASSED
  FAILED
  CONDITIONAL
}

enum DisputeStatus {
  OPEN
  UNDER_REVIEW
  WAITING_FOR_EVIDENCE
  RESOLVED
  REJECTED
  CLOSED
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  READ
}

enum ConversationType {
  BUYER_FARMER
  ORDER_SUPPORT
  GROUP
  ADMIN_SUPPORT
}

enum MessageType {
  TEXT
  IMAGE
  DOCUMENT
  SYSTEM
}

enum GroupStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum MembershipStatus {
  PENDING
  ACTIVE
  REJECTED
  LEFT
  REMOVED
}

enum CollectionStatus {
  OPEN
  TARGET_REACHED
  CLOSED
  CANCELLED
}

enum InventoryStatus {
  AVAILABLE
  RESERVED
  DAMAGED
  EXPIRED
  RELEASED
}

enum AIJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum AuditSeverity {
  INFO
  WARNING
  CRITICAL
}

// ==========================================
// IDENTITY AND ACCESS CONTROL
// ==========================================

model User {
  id                String     @id @default(uuid()) @db.Uuid
  fullName          String     @map("full_name") @db.VarChar(150)
  email             String?    @unique @db.VarChar(255)
  phone             String?    @unique @db.VarChar(20)
  passwordHash      String     @map("password_hash")
  status            UserStatus @default(PENDING_VERIFICATION)
  accountType       AccountType @map("account_type")
  preferredLanguage Language   @default(BN) @map("preferred_language")
  emailVerifiedAt   DateTime?  @map("email_verified_at")
  phoneVerifiedAt   DateTime?  @map("phone_verified_at")
  lastLoginAt       DateTime?  @map("last_login_at")
  createdAt         DateTime   @default(now()) @map("created_at")
  updatedAt         DateTime   @updatedAt @map("updated_at")

  userRoles        UserRole[]
  sessions         UserSession[]
  addresses        UserAddress[]
  farmerProfile    FarmerProfile?
  buyerProfile     BuyerProfile?
  transporter      TransporterProfile?
  ledGroups        FarmerGroup[] @relation("GroupLeader")
  groupMemberships FarmerGroupMember[]
  offers           Offer[]
  counterOffers    CounterOffer[]
  bids             Bid[]
  buyerOrders      Order[] @relation("BuyerOrders")
  farmerOrders     Order[] @relation("FarmerOrders")
  shipments        Shipment[] @relation("TransporterShipments")
  sentMessages     Message[]
  notifications    Notification[]
  openedDisputes   Dispute[] @relation("DisputeOpener")
  auditLogs        AuditLog[] @relation("AuditActor")

  @@index([status])
  @@index([accountType])
  @@map("users")
}

model Role {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique @db.VarChar(80)
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  userRoles   UserRole[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid()) @db.Uuid
  key         String   @unique @db.VarChar(150)
  description String?
  roles       RolePermission[]

  @@map("permissions")
}

model UserRole {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  roleId     String   @map("role_id") @db.Uuid
  assignedBy String?  @map("assigned_by") @db.Uuid
  assignedAt DateTime @default(now()) @map("assigned_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId])
  @@index([roleId])
  @@map("user_roles")
}

model RolePermission {
  roleId       String @map("role_id") @db.Uuid
  permissionId String @map("permission_id") @db.Uuid

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model UserSession {
  id                String    @id @default(uuid()) @db.Uuid
  userId            String    @map("user_id") @db.Uuid
  refreshTokenHash  String    @map("refresh_token_hash")
  deviceName        String?   @map("device_name")
  expiresAt         DateTime  @map("expires_at")
  revokedAt         DateTime? @map("revoked_at")
  createdAt         DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@map("user_sessions")
}

// ==========================================
// GEOGRAPHIC DATA
// ==========================================

model District {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @unique @db.VarChar(100)
  nameBn    String?  @map("name_bn") @db.VarChar(100)
  code      String?  @unique @db.VarChar(20)
  upazilas  Upazila[]
  addresses UserAddress[]

  @@map("districts")
}

model Upazila {
  id         String   @id @default(uuid()) @db.Uuid
  districtId String   @map("district_id") @db.Uuid
  name       String   @db.VarChar(100)
  nameBn     String?  @map("name_bn") @db.VarChar(100)
  district   District @relation(fields: [districtId], references: [id])

  addresses UserAddress[]

  @@unique([districtId, name])
  @@map("upazilas")
}

model UserAddress {
  id           String      @id @default(uuid()) @db.Uuid
  userId       String      @map("user_id") @db.Uuid
  addressType  AddressType @default(HOME) @map("address_type")
  addressLine  String      @map("address_line")
  districtId   String?     @map("district_id") @db.Uuid
  upazilaId    String?     @map("upazila_id") @db.Uuid
  latitude     Decimal?    @db.Decimal(10, 7)
  longitude    Decimal?    @db.Decimal(10, 7)
  isDefault    Boolean     @default(false) @map("is_default")
  createdAt    DateTime    @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  district District? @relation(fields: [districtId], references: [id])
  upazila  Upazila?  @relation(fields: [upazilaId], references: [id])

  @@index([userId])
  @@index([districtId, upazilaId])
  @@map("user_addresses")
}

// ==========================================
// FARMER AND BUYER PROFILES
// ==========================================

model FarmerProfile {
  id                 String             @id @default(uuid()) @db.Uuid
  userId             String             @unique @map("user_id") @db.Uuid
  farmName           String?            @map("farm_name")
  farmArea           Decimal?           @map("farm_area") @db.Decimal(12, 2)
  farmAreaUnit       String?            @map("farm_area_unit") @db.VarChar(20)
  verificationStatus VerificationStatus @default(NOT_SUBMITTED) @map("verification_status")
  verifiedAt         DateTime?          @map("verified_at")
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  listings   Listing[]
  inspections QualityInspection[] @relation("FarmerInspections")

  @@map("farmer_profiles")
}

model BuyerProfile {
  id                 String             @id @default(uuid()) @db.Uuid
  userId             String             @unique @map("user_id") @db.Uuid
  businessName       String?            @map("business_name")
  businessType       BusinessType?      @map("business_type")
  verificationStatus VerificationStatus @default(NOT_SUBMITTED) @map("verification_status")
  verifiedAt         DateTime?          @map("verified_at")
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("buyer_profiles")
}

model VerificationDocument {
  id           String             @id @default(uuid()) @db.Uuid
  userId       String             @map("user_id") @db.Uuid
  documentType String             @map("document_type")
  objectKey    String             @map("object_key")
  status       VerificationStatus @default(PENDING)
  reviewedBy   String?            @map("reviewed_by") @db.Uuid
  reviewedAt   DateTime?          @map("reviewed_at")
  reviewNote   String?            @map("review_note")
  createdAt    DateTime           @default(now()) @map("created_at")

  @@index([userId, status])
  @@map("verification_documents")
}

// ==========================================
// FARMER GROUPS
// ==========================================

model FarmerGroup {
  id          String      @id @default(uuid()) @db.Uuid
  name        String      @db.VarChar(150)
  description String?
  leaderId    String      @map("leader_id") @db.Uuid
  status      GroupStatus @default(ACTIVE)
  createdAt   DateTime    @default(now()) @map("created_at")

  leader      User                @relation("GroupLeader", fields: [leaderId], references: [id])
  members     FarmerGroupMember[]
  collections GroupCollection[]

  @@index([leaderId])
  @@map("farmer_groups")
}

model FarmerGroupMember {
  id        String           @id @default(uuid()) @db.Uuid
  groupId   String           @map("group_id") @db.Uuid
  userId    String           @map("user_id") @db.Uuid
  status    MembershipStatus @default(PENDING)
  joinedAt  DateTime?        @map("joined_at")

  group FarmerGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@map("farmer_group_members")
}

model GroupCollection {
  id                String           @id @default(uuid()) @db.Uuid
  groupId           String           @map("group_id") @db.Uuid
  productId         String           @map("product_id") @db.Uuid
  targetQuantity    Decimal          @map("target_quantity") @db.Decimal(14, 3)
  collectedQuantity Decimal          @default(0) @map("collected_quantity") @db.Decimal(14, 3)
  status            CollectionStatus @default(OPEN)
  createdAt         DateTime         @default(now()) @map("created_at")

  group         FarmerGroup        @relation(fields: [groupId], references: [id])
  product       Product            @relation(fields: [productId], references: [id])
  contributions GroupContribution[]

  @@map("group_collections")
}

model GroupContribution {
  id             String   @id @default(uuid()) @db.Uuid
  collectionId   String   @map("collection_id") @db.Uuid
  farmerId       String   @map("farmer_id") @db.Uuid
  quantity       Decimal  @db.Decimal(14, 3)
  verified       Boolean  @default(false)
  createdAt      DateTime @default(now()) @map("created_at")

  collection GroupCollection @relation(fields: [collectionId], references: [id])
  farmer     User            @relation(fields: [farmerId], references: [id])

  @@index([collectionId])
  @@map("group_contributions")
}

// ==========================================
// PRODUCT CATALOG
// ==========================================

model ProductCategory {
  id        String            @id @default(uuid()) @db.Uuid
  name      String            @unique @db.VarChar(100)
  nameBn    String?           @map("name_bn") @db.VarChar(100)
  parentId  String?           @map("parent_id") @db.Uuid
  parent    ProductCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children  ProductCategory[] @relation("CategoryTree")
  products  Product[]

  @@map("product_categories")
}

model Product {
  id          String   @id @default(uuid()) @db.Uuid
  categoryId  String   @map("category_id") @db.Uuid
  name        String   @db.VarChar(150)
  nameBn      String?  @map("name_bn") @db.VarChar(150)
  description String?
  defaultUnit String   @map("default_unit") @db.VarChar(20)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")

  category      ProductCategory       @relation(fields: [categoryId], references: [id])
  listings      Listing[]
  priceRecords  MarketPriceObservation[]
  collections   GroupCollection[]
  inspections   QualityInspection[]
  inventory     InventoryBatch[]
  traceability  TraceabilityBatch[]

  @@index([categoryId, isActive])
  @@map("products")
}

// ==========================================
// MARKETPLACE
// ==========================================

model Listing {
  id               String        @id @default(uuid()) @db.Uuid
  farmerId         String        @map("farmer_id") @db.Uuid
  productId        String        @map("product_id") @db.Uuid
  title            String        @db.VarChar(200)
  description      String?
  quantity         Decimal       @db.Decimal(14, 3)
  availableQuantity Decimal      @map("available_quantity") @db.Decimal(14, 3)
  unit             String        @db.VarChar(20)
  askingPrice      Decimal       @map("asking_price") @db.Decimal(14, 2)
  currency         String        @default("BDT") @db.VarChar(3)
  status           ListingStatus @default(DRAFT)
  harvestDate      DateTime?     @map("harvest_date")
  availableUntil   DateTime?     @map("available_until")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  farmer       FarmerProfile @relation(fields: [farmerId], references: [id])
  product      Product       @relation(fields: [productId], references: [id])
  images       ListingImage[]
  offers       Offer[]
  auction      Auction?
  orderItems   OrderItem[]
  reservations ListingReservation[]

  @@index([status, productId])
  @@index([farmerId, status])
  @@index([availableUntil])
  @@map("listings")
}

model ListingImage {
  id        String   @id @default(uuid()) @db.Uuid
  listingId String   @map("listing_id") @db.Uuid
  objectKey String   @map("object_key")
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@map("listing_images")
}

model ListingReservation {
  id          String   @id @default(uuid()) @db.Uuid
  listingId   String   @map("listing_id") @db.Uuid
  orderId     String   @map("order_id") @db.Uuid
  quantity    Decimal  @db.Decimal(14, 3)
  expiresAt   DateTime @map("expires_at")
  releasedAt  DateTime? @map("released_at")
  createdAt   DateTime @default(now()) @map("created_at")

  listing Listing @relation(fields: [listingId], references: [id])

  @@index([listingId, expiresAt])
  @@map("listing_reservations")
}

model MarketPriceObservation {
  id         String    @id @default(uuid()) @db.Uuid
  productId  String    @map("product_id") @db.Uuid
  districtId String?   @map("district_id") @db.Uuid
  price      Decimal   @db.Decimal(14, 2)
  currency   String    @default("BDT") @db.VarChar(3)
  unit       String    @db.VarChar(20)
  priceType  PriceType @map("price_type")
  source     String    @db.VarChar(100)
  observedAt DateTime  @map("observed_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id])

  @@index([productId, observedAt])
  @@index([districtId, observedAt])
  @@map("market_price_observations")
}

// ==========================================
// OFFERS AND AUCTIONS
// ==========================================

model Offer {
  id          String      @id @default(uuid()) @db.Uuid
  listingId   String      @map("listing_id") @db.Uuid
  buyerId     String      @map("buyer_id") @db.Uuid
  offeredPrice Decimal    @map("offered_price") @db.Decimal(14, 2)
  quantity    Decimal     @db.Decimal(14, 3)
  status      OfferStatus @default(PENDING)
  expiresAt   DateTime?   @map("expires_at")
  createdAt   DateTime    @default(now()) @map("created_at")

  listing       Listing        @relation(fields: [listingId], references: [id])
  buyer         User           @relation(fields: [buyerId], references: [id])
  counterOffers CounterOffer[]

  @@index([listingId, status])
  @@index([buyerId, createdAt])
  @@map("offers")
}

model CounterOffer {
  id             String   @id @default(uuid()) @db.Uuid
  offerId        String   @map("offer_id") @db.Uuid
  senderId       String   @map("sender_id") @db.Uuid
  proposedPrice  Decimal  @map("proposed_price") @db.Decimal(14, 2)
  proposedQuantity Decimal @map("proposed_quantity") @db.Decimal(14, 3)
  expiresAt      DateTime? @map("expires_at")
  createdAt      DateTime @default(now()) @map("created_at")

  offer  Offer @relation(fields: [offerId], references: [id])
  sender User  @relation(fields: [senderId], references: [id])

  @@index([offerId, createdAt])
  @@map("counter_offers")
}

model Auction {
  id               String        @id @default(uuid()) @db.Uuid
  listingId        String        @unique @map("listing_id") @db.Uuid
  startingPrice    Decimal       @map("starting_price") @db.Decimal(14, 2)
  minimumIncrement Decimal       @map("minimum_increment") @db.Decimal(14, 2)
  reservePrice     Decimal?      @map("reserve_price") @db.Decimal(14, 2)
  currentBid       Decimal?      @map("current_bid") @db.Decimal(14, 2)
  startsAt         DateTime      @map("starts_at")
  endsAt           DateTime      @map("ends_at")
  status           AuctionStatus @default(SCHEDULED)
  createdAt        DateTime      @default(now()) @map("created_at")

  listing Listing @relation(fields: [listingId], references: [id])
  bids    Bid[]

  @@index([status, startsAt, endsAt])
  @@map("auctions")
}

model Bid {
  id        String    @id @default(uuid()) @db.Uuid
  auctionId String    @map("auction_id") @db.Uuid
  buyerId   String    @map("buyer_id") @db.Uuid
  amount    Decimal   @db.Decimal(14, 2)
  status    BidStatus @default(ACCEPTED)
  createdAt DateTime  @default(now()) @map("created_at")

  auction Auction @relation(fields: [auctionId], references: [id])
  buyer   User    @relation(fields: [buyerId], references: [id])

  @@index([auctionId, amount])
  @@index([buyerId, createdAt])
  @@map("bids")
}

// ==========================================
// ORDERS
// ==========================================

model Order {
  id             String      @id @default(uuid()) @db.Uuid
  orderNumber    String      @unique @map("order_number") @db.VarChar(40)
  buyerId        String      @map("buyer_id") @db.Uuid
  farmerId       String      @map("farmer_id") @db.Uuid
  status         OrderStatus @default(PENDING_CONFIRMATION)
  subtotal       Decimal     @db.Decimal(14, 2)
  deliveryFee    Decimal     @default(0) @map("delivery_fee") @db.Decimal(14, 2)
  platformFee    Decimal     @default(0) @map("platform_fee") @db.Decimal(14, 2)
  totalAmount    Decimal     @map("total_amount") @db.Decimal(14, 2)
  currency       String      @default("BDT") @db.VarChar(3)
  deliveryAddress Json       @map("delivery_address")
  notes          String?
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")

  buyer          User               @relation("BuyerOrders", fields: [buyerId], references: [id])
  farmer         User               @relation("FarmerOrders", fields: [farmerId], references: [id])
  items          OrderItem[]
  payments       Payment[]
  shipments      Shipment[]
  disputes       Dispute[]
  statusHistory  OrderStatusHistory[]

  @@index([buyerId, createdAt])
  @@index([farmerId, createdAt])
  @@index([status, createdAt])
  @@map("orders")
}

model OrderItem {
  id         String  @id @default(uuid()) @db.Uuid
  orderId    String  @map("order_id") @db.Uuid
  listingId  String  @map("listing_id") @db.Uuid
  quantity   Decimal @db.Decimal(14, 3)
  unit       String  @db.VarChar(20)
  unitPrice  Decimal @map("unit_price") @db.Decimal(14, 2)
  lineTotal  Decimal @map("line_total") @db.Decimal(14, 2)

  order   Order   @relation(fields: [orderId], references: [id])
  listing Listing @relation(fields: [listingId], references: [id])

  @@index([orderId])
  @@index([listingId])
  @@map("order_items")
}

model OrderStatusHistory {
  id          String      @id @default(uuid()) @db.Uuid
  orderId     String      @map("order_id") @db.Uuid
  fromStatus  OrderStatus? @map("from_status")
  toStatus    OrderStatus @map("to_status")
  actorId     String?     @map("actor_id") @db.Uuid
  reason      String?
  createdAt   DateTime    @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id])

  @@index([orderId, createdAt])
  @@map("order_status_history")
}

// ==========================================
// PAYMENTS
// ==========================================

model Payment {
  id                String        @id @default(uuid()) @db.Uuid
  orderId           String        @map("order_id") @db.Uuid
  provider          String        @db.VarChar(60)
  providerReference String?       @map("provider_reference")
  amount            Decimal       @db.Decimal(14, 2)
  currency          String        @default("BDT") @db.VarChar(3)
  status            PaymentStatus @default(CREATED)
  verifiedAt        DateTime?     @map("verified_at")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  order        Order                @relation(fields: [orderId], references: [id])
  transactions PaymentTransaction[]
  refunds      Refund[]

  @@index([orderId, status])
  @@unique([provider, providerReference])
  @@map("payments")
}

model PaymentTransaction {
  id                String                 @id @default(uuid()) @db.Uuid
  paymentId         String                 @map("payment_id") @db.Uuid
  transactionType   PaymentTransactionType @map("transaction_type")
  providerReference String?                @map("provider_reference")
  status            String                 @db.VarChar(40)
  providerResponse  Json?                  @map("provider_response")
  createdAt         DateTime               @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [id])

  @@index([paymentId, createdAt])
  @@map("payment_transactions")
}

model PaymentWebhookEvent {
  id              String   @id @default(uuid()) @db.Uuid
  provider        String   @db.VarChar(60)
  providerEventId String   @map("provider_event_id")
  eventType       String   @map("event_type")
  payload         Json
  processedAt     DateTime? @map("processed_at")
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([provider, providerEventId])
  @@index([processedAt])
  @@map("payment_webhook_events")
}

model Refund {
  id              String   @id @default(uuid()) @db.Uuid
  paymentId       String   @map("payment_id") @db.Uuid
  amount          Decimal  @db.Decimal(14, 2)
  reason          String
  providerReference String? @map("provider_reference")
  status          String   @db.VarChar(40)
  createdAt       DateTime @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [id])

  @@index([paymentId])
  @@map("refunds")
}

// ==========================================
// DOUBLE-ENTRY LEDGER
// ==========================================

model LedgerAccount {
  id          String           @id @default(uuid()) @db.Uuid
  accountCode String           @unique @map("account_code") @db.VarChar(30)
  accountName String           @map("account_name") @db.VarChar(120)
  accountType LedgerAccountType @map("account_type")
  currency    String           @default("BDT") @db.VarChar(3)
  isActive    Boolean          @default(true) @map("is_active")

  lines JournalLine[]

  @@map("ledger_accounts")
}

model JournalEntry {
  id            String        @id @default(uuid()) @db.Uuid
  referenceType String        @map("reference_type") @db.VarChar(60)
  referenceId   String        @map("reference_id") @db.Uuid
  status        JournalStatus @default(DRAFT)
  description   String?
  reversalOfId  String?       @map("reversal_of_id") @db.Uuid
  postedAt      DateTime?     @map("posted_at")
  createdAt     DateTime      @default(now()) @map("created_at")

  lines JournalLine[]

  @@index([referenceType, referenceId])
  @@map("journal_entries")
}

model JournalLine {
  id              String  @id @default(uuid()) @db.Uuid
  journalEntryId  String  @map("journal_entry_id") @db.Uuid
  ledgerAccountId String  @map("ledger_account_id") @db.Uuid
  debit           Decimal @default(0) @db.Decimal(14, 2)
  credit          Decimal @default(0) @db.Decimal(14, 2)
  currency        String  @default("BDT") @db.VarChar(3)

  journalEntry JournalEntry  @relation(fields: [journalEntryId], references: [id])
  account      LedgerAccount @relation(fields: [ledgerAccountId], references: [id])

  @@index([journalEntryId])
  @@map("journal_lines")
}

// ==========================================
// LOGISTICS
// ==========================================

model TransporterProfile {
  id                 String             @id @default(uuid()) @db.Uuid
  userId             String             @unique @map("user_id") @db.Uuid
  verificationStatus VerificationStatus @default(NOT_SUBMITTED) @map("verification_status")
  serviceArea         Json?              @map("service_area")
  createdAt           DateTime           @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id])
  vehicles Vehicle[]
  shipments Shipment[]

  @@map("transporter_profiles")
}

model Vehicle {
  id                String   @id @default(uuid()) @db.Uuid
  transporterId     String   @map("transporter_id") @db.Uuid
  vehicleType       String   @map("vehicle_type")
  capacity          Decimal  @db.Decimal(14, 3)
  capacityUnit      String   @map("capacity_unit") @db.VarChar(20)
  registrationNumber String  @unique @map("registration_number")
  isActive          Boolean  @default(true) @map("is_active")

  transporter TransporterProfile @relation(fields: [transporterId], references: [id])
  shipments   Shipment[]

  @@map("vehicles")
}

model Shipment {
  id           String         @id @default(uuid()) @db.Uuid
  orderId      String         @map("order_id") @db.Uuid
  transporterId String?       @map("transporter_id") @db.Uuid
  vehicleId    String?        @map("vehicle_id") @db.Uuid
  status       ShipmentStatus @default(REQUESTED)
  pickupAt     DateTime?      @map("pickup_at")
  deliveredAt  DateTime?      @map("delivered_at")
  createdAt    DateTime       @default(now()) @map("created_at")

  order       Order               @relation(fields: [orderId], references: [id])
  transporter TransporterProfile? @relation(fields: [transporterId], references: [id])
  vehicle     Vehicle?            @relation(fields: [vehicleId], references: [id])
  events      ShipmentEvent[]

  @@index([orderId, status])
  @@index([transporterId, status])
  @@map("shipments")
}

model ShipmentEvent {
  id          String            @id @default(uuid()) @db.Uuid
  shipmentId  String            @map("shipment_id") @db.Uuid
  eventType   ShipmentEventType @map("event_type")
  description String?
  latitude    Decimal?          @db.Decimal(10, 7)
  longitude   Decimal?          @db.Decimal(10, 7)
  occurredAt  DateTime          @map("occurred_at")
  createdAt   DateTime          @default(now()) @map("created_at")

  shipment Shipment @relation(fields: [shipmentId], references: [id])

  @@index([shipmentId, occurredAt])
  @@map("shipment_events")
}

// ==========================================
// QUALITY AND WAREHOUSE
// ==========================================

model QualityInspection {
  id                String           @id @default(uuid()) @db.Uuid
  productId         String           @map("product_id") @db.Uuid
  inspectorId       String           @map("inspector_id") @db.Uuid
  farmerProfileId   String?          @map("farmer_profile_id") @db.Uuid
  grade             String?
  result            InspectionResult @default(PENDING)
  inspectionDetails Json?            @map("inspection_details")
  inspectedAt       DateTime?        @map("inspected_at")
  createdAt         DateTime         @default(now()) @map("created_at")

  product Product       @relation(fields: [productId], references: [id])
  farmer  FarmerProfile? @relation("FarmerInspections", fields: [farmerProfileId], references: [id])

  @@index([productId, result])
  @@map("quality_inspections")
}

model Warehouse {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(150)
  address   String
  latitude  Decimal? @db.Decimal(10, 7)
  longitude Decimal? @db.Decimal(10, 7)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  batches InventoryBatch[]

  @@map("warehouses")
}

model InventoryBatch {
  id          String          @id @default(uuid()) @db.Uuid
  warehouseId String          @map("warehouse_id") @db.Uuid
  productId   String          @map("product_id") @db.Uuid
  batchCode   String          @unique @map("batch_code")
  quantity    Decimal         @db.Decimal(14, 3)
  unit        String          @db.VarChar(20)
  status      InventoryStatus @default(AVAILABLE)
  receivedAt  DateTime        @default(now()) @map("received_at")

  warehouse Warehouse @relation(fields: [warehouseId], references: [id])
  product   Product   @relation(fields: [productId], references: [id])

  @@index([warehouseId, productId, status])
  @@map("inventory_batches")
}

// ==========================================
// TRACEABILITY
// ==========================================

model TraceabilityBatch {
  id              String   @id @default(uuid()) @db.Uuid
  productId       String   @map("product_id") @db.Uuid
  farmerId        String   @map("farmer_id") @db.Uuid
  batchCode       String   @unique @map("batch_code")
  qrCodeReference String   @unique @map("qr_code_reference")
  createdAt       DateTime @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id])
  events  TraceabilityEvent[]

  @@map("traceability_batches")
}

model TraceabilityEvent {
  id          String   @id @default(uuid()) @db.Uuid
  batchId     String   @map("batch_id") @db.Uuid
  eventType   String   @map("event_type") @db.VarChar(60)
  description String?
  metadata    Json?
  occurredAt  DateTime @map("occurred_at")

  batch TraceabilityBatch @relation(fields: [batchId], references: [id])

  @@index([batchId, occurredAt])
  @@map("traceability_events")
}

// ==========================================
// COMMUNICATION
// ==========================================

model Conversation {
  id           String           @id @default(uuid()) @db.Uuid
  type         ConversationType
  referenceId  String?          @map("reference_id") @db.Uuid
  createdAt    DateTime         @default(now()) @map("created_at")

  participants ConversationParticipant[]
  messages     Message[]

  @@map("conversations")
}

model ConversationParticipant {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @map("conversation_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  joinedAt       DateTime @default(now()) @map("joined_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@map("conversation_participants")
}

model Message {
  id             String      @id @default(uuid()) @db.Uuid
  conversationId String      @map("conversation_id") @db.Uuid
  senderId       String      @map("sender_id") @db.Uuid
  type           MessageType @default(TEXT)
  content        String?
  attachmentKey  String?     @map("attachment_key")
  createdAt      DateTime    @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id])
  sender       User         @relation(fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@map("messages")
}

model Notification {
  id        String             @id @default(uuid()) @db.Uuid
  userId    String             @map("user_id") @db.Uuid
  title     String
  body      String
  status    NotificationStatus @default(PENDING)
  data      Json?
  createdAt DateTime           @default(now()) @map("created_at")
  readAt    DateTime?          @map("read_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status, createdAt])
  @@map("notifications")
}

// ==========================================
// DISPUTES
// ==========================================

model Dispute {
  id          String        @id @default(uuid()) @db.Uuid
  orderId     String        @map("order_id") @db.Uuid
  openedById  String        @map("opened_by_id") @db.Uuid
  category    String        @db.VarChar(80)
  description String
  status      DisputeStatus @default(OPEN)
  resolution  String?
  createdAt   DateTime      @default(now()) @map("created_at")
  resolvedAt  DateTime?     @map("resolved_at")

  order    Order           @relation(fields: [orderId], references: [id])
  opener   User            @relation("DisputeOpener", fields: [openedById], references: [id])
  evidence DisputeEvidence[]

  @@index([status, createdAt])
  @@map("disputes")
}

model DisputeEvidence {
  id          String   @id @default(uuid()) @db.Uuid
  disputeId   String   @map("dispute_id") @db.Uuid
  objectKey   String   @map("object_key")
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  dispute Dispute @relation(fields: [disputeId], references: [id], onDelete: Cascade)

  @@map("dispute_evidence")
}

// ==========================================
// AI AND MODEL METADATA
// ==========================================

model AIModelVersion {
  id          String   @id @default(uuid()) @db.Uuid
  modelName   String   @map("model_name")
  version     String
  taskType    String   @map("task_type")
  status      String   @db.VarChar(30)
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at")

  predictions AIPrediction[]

  @@unique([modelName, version])
  @@map("ai_model_versions")
}

model AIPrediction {
  id             String   @id @default(uuid()) @db.Uuid
  modelVersionId String?  @map("model_version_id") @db.Uuid
  predictionType String   @map("prediction_type")
  entityId       String?  @map("entity_id") @db.Uuid
  inputSnapshot  Json     @map("input_snapshot")
  output         Json
  limitations    Json?
  createdAt      DateTime @default(now()) @map("created_at")

  modelVersion AIModelVersion? @relation(fields: [modelVersionId], references: [id])

  @@index([predictionType, createdAt])
  @@index([entityId])
  @@map("ai_predictions")
}

// ==========================================
// SYSTEM RELIABILITY
// ==========================================

model IdempotencyKey {
  id          String   @id @default(uuid()) @db.Uuid
  key         String   @unique @db.VarChar(150)
  userId      String?  @map("user_id") @db.Uuid
  requestHash String   @map("request_hash")
  response    Json?
  status      String   @db.VarChar(30)
  expiresAt   DateTime @map("expires_at")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("idempotency_keys")
}

model OutboxEvent {
  id           String    @id @default(uuid()) @db.Uuid
  eventType    String    @map("event_type")
  aggregateType String   @map("aggregate_type")
  aggregateId  String    @map("aggregate_id") @db.Uuid
  payload      Json
  processedAt  DateTime? @map("processed_at")
  attempts     Int       @default(0)
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([processedAt, createdAt])
  @@map("outbox_events")
}

model AuditLog {
  id         String        @id @default(uuid()) @db.Uuid
  actorId    String?       @map("actor_id") @db.Uuid
  action     String        @db.VarChar(120)
  entityType String        @map("entity_type") @db.VarChar(80)
  entityId   String?       @map("entity_id") @db.Uuid
  severity   AuditSeverity @default(INFO)
  metadata   Json?
  requestId  String?       @map("request_id")
  createdAt  DateTime      @default(now()) @map("created_at")

  actor User? @relation("AuditActor", fields: [actorId], references: [id])

  @@index([actorId, createdAt])
  @@index([entityType, entityId])
  @@index([severity, createdAt])
  @@map("audit_logs")
}
```

## **B3. Important schema review notes**

The schema is the initial implementation baseline, not a substitute for running Prisma validation and reviewing the resulting migrations.

Before merging it into the main branch:

* Run `npx prisma format`.  
* Run `npx prisma validate`.  
* Run `npx prisma generate`.  
* Resolve any missing inverse relations reported by Prisma.  
* Review all delete behaviors.  
* Add database-level constraints not expressible in Prisma.  
* Test migrations against a clean PostgreSQL database.  
* Review indexes using actual query plans.

Some business requirements need additional implementation-level decisions:

### **1\. Multi-farmer checkout**

The schema currently models one farmer per order. A buyer cart containing products from multiple farmers must be split into separate seller orders under a parent checkout or purchase group.

Recommended future structure:

```
PurchaseGroup
    |
    +--- Order (Farmer A)
    |
    +--- Order (Farmer B)
    |
    +--- Order (Farmer C)
```

A parent purchase group should contain the buyer's overall checkout reference and coordinate payment allocation.

Do not implement multi-farmer checkout by assigning several farmers to the current `Order.farmerId`.

### **2\. Geographic data**

PostGIS geography columns and GiST indexes require SQL migrations. Prisma's standard scalar mapping does not fully represent PostGIS spatial behavior in every workflow.

Use raw SQL migrations for:

* Geography columns  
* Spatial indexes  
* Distance queries  
* Spatial constraints

### **3\. Financial integrity**

Add database-level validation for:

```
debit >= 0
credit >= 0
debit and credit cannot both be positive
posted journal entries must balance
posted journal lines cannot be modified
```

These rules require transactional application logic and, where appropriate, PostgreSQL constraints or triggers.

### **4\. Listing reservation**

The `ListingReservation` table references `orderId` as a scalar in this initial schema. Add the formal relation after deciding the order creation and reservation lifecycle.

### **5\. Additional production tables**

Before a complete production release, add:

* `PlatformSetting`  
* `NotificationPreference`  
* `UserConsent`  
* `FileAsset`  
* `AuctionStatusHistory`  
* `ShipmentStatusHistory`  
* `RefundStatusHistory`  
* `MarketDataSource`  
* `AIJob`  
* `AIFeedback`  
* `WarehouseManagerAssignment`  
* `QualityInspectionEvidence`  
* `OrderFulfillmentGroup`, if multi-farmer checkout is approved.

---

# **PART C — DATABASE MIGRATION PLAN**

## **C1. Migration principles**

Use Prisma Migrate for version-controlled schema evolution.

Never use `prisma db push` as the production migration process.

Development:

```
npx prisma migrate dev --name migration_name
```

Production:

```
npx prisma migrate deploy
```

Inspect status:

```
npx prisma migrate status
```

Generate client:

```
npx prisma generate
```

## **C2. Migration sequence**

| Migration | Name | Tables / changes |
| ----- | ----- | ----- |
| 001 | `init_extensions` | PostgreSQL extensions |
| 002 | `identity_core` | users, roles, permissions, sessions |
| 003 | `geographic_data` | districts, upazilas, addresses |
| 004 | `user_profiles` | farmer, buyer, transporter profiles |
| 005 | `verification` | verification documents |
| 006 | `farmer_groups` | groups, members, collections |
| 007 | `product_catalog` | categories, products |
| 008 | `marketplace` | listings, images, reservations |
| 009 | `market_prices` | market price observations |
| 010 | `offers_and_auctions` | offers, counters, auctions, bids |
| 011 | `orders` | orders, items, status history |
| 012 | `payments` | payments, transactions, webhook events, refunds |
| 013 | `financial_ledger` | ledger accounts, journal entries, lines |
| 014 | `logistics` | vehicles, shipments, shipment events |
| 015 | `quality_warehouse` | inspections, warehouses, inventory |
| 016 | `traceability` | batches and events |
| 017 | `communication` | conversations, messages, notifications |
| 018 | `disputes` | disputes and evidence |
| 019 | `ai_metadata` | AI model versions and predictions |
| 020 | `reliability_audit` | idempotency, outbox, audit |
| 021 | `integrity_constraints` | custom SQL constraints and triggers |
| 022 | `spatial_indexes` | PostGIS geography columns and indexes |

This is a logical migration plan. If a model depends on another table, its migration must be ordered after that table.

## **C3. Example migration workflow**

Create the initial migration:

```
npx prisma migrate dev --name init_identity
```

Review:

```
apps/api/prisma/migrations/
```

A migration folder contains:

```
202611250001_init_identity/
└── migration.sql
```

Review the generated SQL before applying it.

Do not edit an already-applied migration in a shared or production environment. Create a new corrective migration instead.

## **C4. Seed data**

Create:

```
apps/api/prisma/seed.js
```

Seed:

* System roles  
* Permissions  
* Role-permission assignments  
* Product categories  
* Product measurement units  
* Bangladesh district and upazila reference data  
* Default platform settings  
* Ledger account chart

Example:

```
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles = [
    "SUPER_ADMIN",
    "DISTRICT_ADMIN",
    "UPAZILA_COORDINATOR",
    "FARMER",
    "FARMER_GROUP_LEADER",
    "WHOLESALER",
    "RETAILER",
    "INSTITUTIONAL_BUYER",
    "CONSUMER",
    "TRANSPORTER",
    "QUALITY_INSPECTOR",
    "WAREHOUSE_MANAGER",
    "PAYMENT_OFFICER",
    "DISPUTE_OFFICER"
  ];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: `${name} system role`
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Configure the seed command according to the Prisma version used by the project.

Never seed production with a publicly known administrator password.

## **C5. Migration acceptance tests**

* A clean database can apply all migrations.  
* Existing development data survives compatible migrations.  
* Foreign keys prevent orphan records.  
* Unique constraints reject duplicate identities.  
* Financial constraints prevent invalid journal entries.  
* Spatial queries work after PostGIS migration.  
* Roll-forward recovery is documented.  
* Backup restoration has been tested.  
* Production deployment runs migrations before application code requires new schema fields.

---

# **PART D — OPENAPI 3.1 SPECIFICATION**

## **D1. API conventions**

Base path:

```
/api/v1
```

Server:

```
https://api.cropsy.example.com/api/v1
```

The example domain is a placeholder and must be replaced with the actual production domain.

Authentication:

```
Authorization: Bearer <access_token>
```

Pagination:

```
?page=1&limit=20
```

Idempotency:

```
Idempotency-Key: unique-client-generated-key
```

## **D2. OpenAPI specification**

Save as:

`apps/api/openapi.yaml`

The following specification defines the initial public API contracts for the core CROPSY modules. It uses reusable components and explicit request/response schemas.

```
openapi: 3.1.0

info:
  title: CROPSY API
  version: 1.0.0
  description: >
    REST API for the CROPSY agricultural marketplace,
    trading, ordering, payments, logistics, and intelligence platform.

servers:
  - url: https://api.cropsy.example.com/api/v1
    description: Production placeholder
  - url: http://localhost:4000/api/v1
    description: Local development

tags:
  - name: Authentication
  - name: Users
  - name: Farmers
  - name: Buyers
  - name: Products
  - name: Listings
  - name: Offers
  - name: Auctions
  - name: Orders
  - name: Payments
  - name: Logistics
  - name: Quality
  - name: Notifications
  - name: Disputes
  - name: AI
  - name: Administration

security:
  - BearerAuth: []

paths:

  # =====================================
  # AUTHENTICATION
  # =====================================

  /auth/register:
    post:
      tags: [Authentication]
      operationId: registerUser
      security: []
      summary: Register a new user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '201':
          description: Account created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RegisterResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '409':
          $ref: '#/components/responses/Conflict'

  /auth/login:
    post:
      tags: [Authentication]
      operationId: loginUser
      security: []
      summary: Authenticate user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Authenticated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /auth/refresh:
    post:
      tags: [Authentication]
      operationId: refreshSession
      summary: Refresh authentication session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RefreshRequest'
      responses:
        '200':
          description: Session refreshed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /auth/logout:
    post:
      tags: [Authentication]
      operationId: logoutUser
      responses:
        '204':
          description: Session revoked
        '401':
          $ref: '#/components/responses/Unauthorized'

  /auth/me:
    get:
      tags: [Authentication]
      operationId: getCurrentUser
      summary: Retrieve authenticated user
      responses:
        '200':
          description: Current user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '401':
          $ref: '#/components/responses/Unauthorized'

  # =====================================
  # USER PROFILE
  # =====================================

  /users/me:
    patch:
      tags: [Users]
      operationId: updateCurrentUser
      summary: Update current user's profile
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: Profile updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '422':
          $ref: '#/components/responses/ValidationError'

  /farmers/me:
    get:
      tags: [Farmers]
      operationId: getFarmerProfile
      responses:
        '200':
          description: Farmer profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FarmerProfile'
        '403':
          $ref: '#/components/responses/Forbidden'

    put:
      tags: [Farmers]
      operationId: updateFarmerProfile
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/FarmerProfileRequest'
      responses:
        '200':
          description: Farmer profile updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FarmerProfile'

  /farmers/verification:
    post:
      tags: [Farmers]
      operationId: submitFarmerVerification
      summary: Submit farmer verification documents
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VerificationRequest'
      responses:
        '202':
          description: Verification submitted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VerificationResponse'

  /buyers/me:
    get:
      tags: [Buyers]
      operationId: getBuyerProfile
      responses:
        '200':
          description: Buyer profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BuyerProfile'

    put:
      tags: [Buyers]
      operationId: updateBuyerProfile
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/BuyerProfileRequest'
      responses:
        '200':
          description: Buyer profile updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BuyerProfile'

  # =====================================
  # PRODUCTS
  # =====================================

  /products:
    get:
      tags: [Products]
      operationId: listProducts
      security: []
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: categoryId
          in: query
          schema:
            type: string
            format: uuid
        - name: search
          in: query
          schema:
            type: string
            maxLength: 100
      responses:
        '200':
          description: Product catalog
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProductListResponse'

  /products/{productId}:
    get:
      tags: [Products]
      operationId: getProduct
      security: []
      parameters:
        - $ref: '#/components/parameters/ProductId'
      responses:
        '200':
          description: Product details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Product'
        '404':
          $ref: '#/components/responses/NotFound'

  # =====================================
  # MARKETPLACE
  # =====================================

  /listings:
    get:
      tags: [Listings]
      operationId: listListings
      security: []
      summary: Search marketplace listings
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: productId
          in: query
          schema:
            type: string
            format: uuid
        - name: districtId
          in: query
          schema:
            type: string
            format: uuid
        - name: minPrice
          in: query
          schema:
            type: number
            minimum: 0
        - name: maxPrice
          in: query
          schema:
            type: number
            minimum: 0
        - name: minQuantity
          in: query
          schema:
            type: number
            exclusiveMinimum: 0
        - name: sort
          in: query
          schema:
            type: string
            enum: [createdAt, askingPrice, availableUntil]
        - name: order
          in: query
          schema:
            type: string
            enum: [asc, desc]
            default: desc
      responses:
        '200':
          description: Listings
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListingListResponse'

    post:
      tags: [Listings]
      operationId: createListing
      summary: Create farmer listing
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateListingRequest'
      responses:
        '201':
          description: Listing created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Listing'
        '403':
          $ref: '#/components/responses/Forbidden'
        '422':
          $ref: '#/components/responses/ValidationError'

  /listings/{listingId}:
    get:
      tags: [Listings]
      operationId: getListing
      security: []
      parameters:
        - $ref: '#/components/parameters/ListingId'
      responses:
        '200':
          description: Listing details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Listing'
        '404':
          $ref: '#/components/responses/NotFound'

    patch:
      tags: [Listings]
      operationId: updateListing
      parameters:
        - $ref: '#/components/parameters/ListingId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateListingRequest'
      responses:
        '200':
          description: Listing updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Listing'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'

  /listings/{listingId}/publish:
    post:
      tags: [Listings]
      operationId: publishListing
      parameters:
        - $ref: '#/components/parameters/ListingId'
      responses:
        '200':
          description: Listing published
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Listing'
        '409':
          $ref: '#/components/responses/Conflict'

  /listings/{listingId}/cancel:
    post:
      tags: [Listings]
      operationId: cancelListing
      parameters:
        - $ref: '#/components/parameters/ListingId'
      responses:
        '200':
          description: Listing cancelled
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Listing'

  # =====================================
  # OFFERS
  # =====================================

  /listings/{listingId}/offers:
    post:
      tags: [Offers]
      operationId: createOffer
      parameters:
        - $ref: '#/components/parameters/ListingId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOfferRequest'
      responses:
        '201':
          description: Offer submitted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Offer'
        '409':
          $ref: '#/components/responses/Conflict'

  /offers/{offerId}:
    get:
      tags: [Offers]
      operationId: getOffer
      parameters:
        - $ref: '#/components/parameters/OfferId'
      responses:
        '200':
          description: Offer details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Offer'

  /offers/{offerId}/counter:
    post:
      tags: [Offers]
      operationId: counterOffer
      parameters:
        - $ref: '#/components/parameters/OfferId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CounterOfferRequest'
      responses:
        '201':
          description: Counteroffer created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Offer'

  /offers/{offerId}/accept:
    post:
      tags: [Offers]
      operationId: acceptOffer
      parameters:
        - $ref: '#/components/parameters/OfferId'
      responses:
        '200':
          description: Offer accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Offer'
        '409':
          $ref: '#/components/responses/Conflict'

  /offers/{offerId}/reject:
    post:
      tags: [Offers]
      operationId: rejectOffer
      parameters:
        - $ref: '#/components/parameters/OfferId'
      responses:
        '200':
          description: Offer rejected
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Offer'

  # =====================================
  # AUCTIONS
  # =====================================

  /auctions:
    post:
      tags: [Auctions]
      operationId: createAuction
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateAuctionRequest'
      responses:
        '201':
          description: Auction created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Auction'

  /auctions/{auctionId}:
    get:
      tags: [Auctions]
      operationId: getAuction
      security: []
      parameters:
        - $ref: '#/components/parameters/AuctionId'
      responses:
        '200':
          description: Auction details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Auction'

  /auctions/{auctionId}/bids:
    post:
      tags: [Auctions]
      operationId: placeBid
      parameters:
        - $ref: '#/components/parameters/AuctionId'
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PlaceBidRequest'
      responses:
        '201':
          description: Bid accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Bid'
        '409':
          $ref: '#/components/responses/Conflict'
        '422':
          $ref: '#/components/responses/ValidationError'

    get:
      tags: [Auctions]
      operationId: listAuctionBids
      parameters:
        - $ref: '#/components/parameters/AuctionId'
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: Auction bid history
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BidListResponse'

  # =====================================
  # ORDERS
  # =====================================

  /orders:
    post:
      tags: [Orders]
      operationId: createOrder
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderRequest'
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '409':
          $ref: '#/components/responses/Conflict'

    get:
      tags: [Orders]
      operationId: listOrders
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/OrderStatus'
      responses:
        '200':
          description: Current user's orders
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderListResponse'

  /orders/{orderId}:
    get:
      tags: [Orders]
      operationId: getOrder
      parameters:
        - $ref: '#/components/parameters/OrderId'
      responses:
        '200':
          description: Order details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          $ref: '#/components/responses/NotFound'
        '403':
          $ref: '#/components/responses/Forbidden'

  /orders/{orderId}/cancel:
    post:
      tags: [Orders]
      operationId: cancelOrder
      parameters:
        - $ref: '#/components/parameters/OrderId'
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                reason:
                  type: string
                  maxLength: 500
      responses:
        '200':
          description: Cancellation processed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '409':
          $ref: '#/components/responses/Conflict'

  /orders/{orderId}/history:
    get:
      tags: [Orders]
      operationId: getOrderHistory
      parameters:
        - $ref: '#/components/parameters/OrderId'
      responses:
        '200':
          description: Order status history
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/OrderHistoryItem'

  # =====================================
  # PAYMENTS
  # =====================================

  /payments/initiate:
    post:
      tags: [Payments]
      operationId: initiatePayment
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InitiatePaymentRequest'
      responses:
        '201':
          description: Payment initiated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Payment'
        '409':
          $ref: '#/components/responses/Conflict'

  /payments/{paymentId}:
    get:
      tags: [Payments]
      operationId: getPayment
      parameters:
        - $ref: '#/components/parameters/PaymentId'
      responses:
        '200':
          description: Payment status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Payment'

  /payments/webhooks/{provider}:
    post:
      tags: [Payments]
      operationId: receivePaymentWebhook
      security: []
      parameters:
        - name: provider
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: true
      responses:
        '200':
          description: Webhook acknowledged
        '400':
          description: Invalid webhook
        '401':
          description: Invalid provider signature

  # =====================================
  # LOGISTICS
  # =====================================

  /shipments:
    post:
      tags: [Logistics]
      operationId: createShipment
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateShipmentRequest'
      responses:
        '201':
          description: Shipment created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Shipment'

  /shipments/{shipmentId}:
    get:
      tags: [Logistics]
      operationId: getShipment
      parameters:
        - $ref: '#/components/parameters/ShipmentId'
      responses:
        '200':
          description: Shipment details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Shipment'

  /shipments/{shipmentId}/events:
    post:
      tags: [Logistics]
      operationId: createShipmentEvent
      parameters:
        - $ref: '#/components/parameters/ShipmentId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ShipmentEventRequest'
      responses:
        '201':
          description: Shipment event recorded

  # =====================================
  # QUALITY
  # =====================================

  /quality/inspections:
    post:
      tags: [Quality]
      operationId: createInspection
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateInspectionRequest'
      responses:
        '201':
          description: Inspection created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Inspection'

  # =====================================
  # NOTIFICATIONS
  # =====================================

  /notifications:
    get:
      tags: [Notifications]
      operationId: listNotifications
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: User notifications
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/NotificationListResponse'

  /notifications/{notificationId}/read:
    patch:
      tags: [Notifications]
      operationId: markNotificationRead
      parameters:
        - name: notificationId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '204':
          description: Notification marked as read

  # =====================================
  # DISPUTES
  # =====================================

  /disputes:
    post:
      tags: [Disputes]
      operationId: createDispute
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateDisputeRequest'
      responses:
        '201':
          description: Dispute created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Dispute'

  /disputes/{disputeId}:
    get:
      tags: [Disputes]
      operationId: getDispute
      parameters:
        - name: disputeId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Dispute details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Dispute'

  # =====================================
  # AI
  # =====================================

  /ai/price-forecast:
    post:
      tags: [AI]
      operationId: getPriceForecast
      summary: Request advisory price forecast
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PriceForecastRequest'
      responses:
        '200':
          description: Forecast result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PriceForecastResponse'
        '202':
          description: Forecast accepted for asynchronous processing
        '503':
          description: AI service unavailable

  /ai/matching/recommendations:
    post:
      tags: [AI]
      operationId: getMatchingRecommendations
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MatchingRequest'
      responses:
        '200':
          description: Matching recommendations
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MatchingResponse'

  /ai/image-quality-analysis:
    post:
      tags: [AI]
      operationId: analyzeProductImage
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ImageAnalysisRequest'
      responses:
        '200':
          description: Advisory image analysis
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageAnalysisResponse'

components:

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  parameters:

    Page:
      name: page
      in: query
      schema:
        type: integer
        minimum: 1
        default: 1

    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20

    ProductId:
      name: productId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    ListingId:
      name: listingId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    OfferId:
      name: offerId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    AuctionId:
      name: auctionId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    OrderId:
      name: orderId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    PaymentId:
      name: paymentId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    ShipmentId:
      name: shipmentId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema:
        type: string
        minLength: 16
        maxLength: 150

  responses:

    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Forbidden:
      description: Permission denied
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    Conflict:
      description: Resource state conflict
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

    ValidationError:
      description: Business or input validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'

  schemas:

    RegisterRequest:
      type: object
      additionalProperties: false
      required: [fullName, password, accountType]
      properties:
        fullName:
          type: string
          minLength: 2
          maxLength: 150
        email:
          type: string
          format: email
        phone:
          type: string
          maxLength: 20
        password:
          type: string
          minLength: 12
          writeOnly: true
        accountType:
          $ref: '#/components/schemas/AccountType'
        preferredLanguage:
          type: string
          enum: [BN, EN]
          default: BN

    RegisterResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          const: true
        data:
          type: object
          required: [userId, status]
          properties:
            userId:
              type: string
              format: uuid
            status:
              type: string
              enum: [PENDING_VERIFICATION]

    LoginRequest:
      type: object
      required: [identifier, password]
      properties:
        identifier:
          type: string
        password:
          type: string
          writeOnly: true

    RefreshRequest:
      type: object
      properties:
        refreshToken:
          type: string
          writeOnly: true

    AuthResponse:
      type: object
      properties:
        success:
          type: boolean
        data:
          type: object
          properties:
            accessToken:
              type: string
          required: [accessToken]

    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        fullName:
          type: string
        email:
          type: [string, 'null']
        phone:
          type: [string, 'null']
        status:
          type: string
          enum:
            - PENDING_VERIFICATION
            - ACTIVE
            - SUSPENDED
            - BLOCKED
            - DEACTIVATED
        accountType:
          $ref: '#/components/schemas/AccountType'
        preferredLanguage:
          type: string
          enum: [BN, EN]

    AccountType:
      type: string
      enum: [FARMER, BUYER, TRANSPORTER, CONSUMER, ADMIN]

    UpdateUserRequest:
      type: object
      additionalProperties: false
      properties:
        fullName:
          type: string
          maxLength: 150
        preferredLanguage:
          type: string
          enum: [BN, EN]

    FarmerProfile:
      type: object
      properties:
        id:
          type: string
          format: uuid
        farmName:
          type: [string, 'null']
        farmArea:
          type: [number, 'null']
        farmAreaUnit:
          type: [string, 'null']
        verificationStatus:
          $ref: '#/components/schemas/VerificationStatus'

    FarmerProfileRequest:
      type: object
      properties:
        farmName:
          type: [string, 'null']
        farmArea:
          type: [number, 'null']
          exclusiveMinimum: 0
        farmAreaUnit:
          type: [string, 'null']

    BuyerProfile:
      type: object
      properties:
        id:
          type: string
          format: uuid
        businessName:
          type: [string, 'null']
        businessType:
          type: [string, 'null']
        verificationStatus:
          $ref: '#/components/schemas/VerificationStatus'

    BuyerProfileRequest:
      type: object
      properties:
        businessName:
          type: string
          maxLength: 150
        businessType:
          type: string
          enum:
            - WHOLESALER
            - RETAILER
            - RESTAURANT
            - INSTITUTION
            - PROCESSOR
            - OTHER

    VerificationStatus:
      type: string
      enum:
        - NOT_SUBMITTED
        - PENDING
        - APPROVED
        - REJECTED
        - NEEDS_MORE_INFORMATION

    VerificationRequest:
      type: object
      required: [documents]
      properties:
        documents:
          type: array
          minItems: 1
          items:
            type: object
            required: [documentType, objectKey]
            properties:
              documentType:
                type: string
              objectKey:
                type: string

    VerificationResponse:
      type: object
      properties:
        status:
          $ref: '#/components/schemas/VerificationStatus'

    Product:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        nameBn:
          type: [string, 'null']
        categoryId:
          type: string
          format: uuid
        defaultUnit:
          type: string
        isActive:
          type: boolean

    ProductListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Product'
        pagination:
          $ref: '#/components/schemas/Pagination'

    CreateListingRequest:
      type: object
      additionalProperties: false
      required:
        - productId
        - title
        - quantity
        - unit
        - askingPrice
      properties:
        productId:
          type: string
          format: uuid
        title:
          type: string
          maxLength: 200
        description:
          type: string
        quantity:
          type: number
          exclusiveMinimum: 0
        unit:
          type: string
        askingPrice:
          type: number
          minimum: 0
        currency:
          type: string
          enum: [BDT]
          default: BDT
        harvestDate:
          type: string
          format: date
        availableUntil:
          type: string
          format: date-time

    UpdateListingRequest:
      type: object
      additionalProperties: false
      properties:
        title:
          type: string
          maxLength: 200
        description:
          type: string
        askingPrice:
          type: number
          minimum: 0
        availableUntil:
          type: string
          format: date-time

    Listing:
      type: object
      properties:
        id:
          type: string
          format: uuid
        farmerId:
          type: string
          format: uuid
        productId:
          type: string
          format: uuid
        title:
          type: string
        quantity:
          type: number
        availableQuantity:
          type: number
        unit:
          type: string
        askingPrice:
          type: number
        currency:
          type: string
        status:
          type: string
          enum:
            - DRAFT
            - PENDING_REVIEW
            - ACTIVE
            - PAUSED
            - RESERVED
            - SOLD
            - EXPIRED
            - CANCELLED
            - REJECTED

    ListingListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Listing'
        pagination:
          $ref: '#/components/schemas/Pagination'

    CreateOfferRequest:
      type: object
      required: [offeredPrice, quantity]
      properties:
        offeredPrice:
          type: number
          exclusiveMinimum: 0
        quantity:
          type: number
          exclusiveMinimum: 0
        expiresAt:
          type: string
          format: date-time

    CounterOfferRequest:
      type: object
      required: [proposedPrice, proposedQuantity]
      properties:
        proposedPrice:
          type: number
          exclusiveMinimum: 0
        proposedQuantity:
          type: number
          exclusiveMinimum: 0
        expiresAt:
          type: string
          format: date-time

    Offer:
      type: object
      properties:
        id:
          type: string
          format: uuid
        listingId:
          type: string
          format: uuid
        buyerId:
          type: string
          format: uuid
        offeredPrice:
          type: number
        quantity:
          type: number
        status:
          type: string
          enum:
            - PENDING
            - COUNTERED
            - ACCEPTED
            - REJECTED
            - WITHDRAWN
            - EXPIRED
            - CANCELLED

    CreateAuctionRequest:
      type: object
      required:
        - listingId
        - startingPrice
        - minimumIncrement
        - startsAt
        - endsAt
      properties:
        listingId:
          type: string
          format: uuid
        startingPrice:
          type: number
          exclusiveMinimum: 0
        minimumIncrement:
          type: number
          exclusiveMinimum: 0
        reservePrice:
          type: [number, 'null']
          minimum: 0
        startsAt:
          type: string
          format: date-time
        endsAt:
          type: string
          format: date-time

    Auction:
      type: object
      properties:
        id:
          type: string
          format: uuid
        listingId:
          type: string
          format: uuid
        startingPrice:
          type: number
        currentBid:
          type: [number, 'null']
        startsAt:
          type: string
          format: date-time
        endsAt:
          type: string
          format: date-time
        status:
          type: string
          enum: [SCHEDULED, ACTIVE, CLOSED, CANCELLED, NO_WINNER]

    PlaceBidRequest:
      type: object
      required: [amount]
      properties:
        amount:
          type: number
          exclusiveMinimum: 0

    Bid:
      type: object
      properties:
        id:
          type: string
          format: uuid
        auctionId:
          type: string
          format: uuid
        amount:
          type: number
        status:
          type: string
          enum: [ACCEPTED, REJECTED, RETRACTED]
        createdAt:
          type: string
          format: date-time

    BidListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Bid'
        pagination:
          $ref: '#/components/schemas/Pagination'

    CreateOrderRequest:
      type: object
      required: [items, deliveryAddress]
      properties:
        items:
          type: array
          minItems: 1
          items:
            type: object
            required: [listingId, quantity]
            properties:
              listingId:
                type: string
                format: uuid
              quantity:
                type: number
                exclusiveMinimum: 0
        deliveryAddress:
          type: object
          required: [addressLine]
          properties:
            addressLine:
              type: string
            districtId:
              type: string
              format: uuid
            upazilaId:
              type: string
              format: uuid
            latitude:
              type: number
            longitude:
              type: number

    OrderStatus:
      type: string
      enum:
        - PENDING_CONFIRMATION
        - CONFIRMED
        - PAYMENT_PENDING
        - PAID
        - PROCESSING
        - READY_FOR_PICKUP
        - IN_TRANSIT
        - DELIVERED
        - COMPLETED
        - CANCELLED
        - REFUND_PENDING
        - PARTIALLY_REFUNDED
        - REFUNDED
        - DISPUTED

    Order:
      type: object
      properties:
        id:
          type: string
          format: uuid
        orderNumber:
          type: string
        buyerId:
          type: string
          format: uuid
        farmerId:
          type: string
          format: uuid
        status:
          $ref: '#/components/schemas/OrderStatus'
        subtotal:
          type: number
        deliveryFee:
          type: number
        platformFee:
          type: number
        totalAmount:
          type: number
        currency:
          type: string
          enum: [BDT]

    OrderListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Order'
        pagination:
          $ref: '#/components/schemas/Pagination'

    OrderHistoryItem:
      type: object
      properties:
        fromStatus:
          type: [string, 'null']
        toStatus:
          $ref: '#/components/schemas/OrderStatus'
        reason:
          type: [string, 'null']
        createdAt:
          type: string
          format: date-time

    InitiatePaymentRequest:
      type: object
      required: [orderId, provider]
      properties:
        orderId:
          type: string
          format: uuid
        provider:
          type: string

    Payment:
      type: object
      properties:
        id:
          type: string
          format: uuid
        orderId:
          type: string
          format: uuid
        provider:
          type: string
        amount:
          type: number
        currency:
          type: string
        status:
          type: string
          enum:
            - CREATED
            - PENDING
            - PROCESSING
            - SUCCEEDED
            - FAILED
            - EXPIRED
            - REFUND_PENDING
            - PARTIALLY_REFUNDED
            - REFUNDED
        checkoutUrl:
          type: [string, 'null']
          format: uri

    CreateShipmentRequest:
      type: object
      required: [orderId]
      properties:
        orderId:
          type: string
          format: uuid
        transporterId:
          type: [string, 'null']
          format: uuid

    Shipment:
      type: object
      properties:
        id:
          type: string
          format: uuid
        orderId:
          type: string
          format: uuid
        status:
          type: string
          enum:
            - REQUESTED
            - ASSIGNED
            - ACCEPTED
            - PICKED_UP
            - IN_TRANSIT
            - DELIVERED
            - DELIVERY_EXCEPTION
            - RETURNED
            - CANCELLED

    ShipmentEventRequest:
      type: object
      required: [eventType, occurredAt]
      properties:
        eventType:
          type: string
          enum:
            - ASSIGNED
            - ACCEPTED
            - PICKED_UP
            - LOCATION_UPDATED
            - IN_TRANSIT
            - DELIVERY_EXCEPTION
            - DELIVERED
            - RETURNED
        description:
          type: string
        latitude:
          type: number
        longitude:
          type: number
        occurredAt:
          type: string
          format: date-time

    CreateInspectionRequest:
      type: object
      required: [productId, result]
      properties:
        productId:
          type: string
          format: uuid
        result:
          type: string
          enum: [PENDING, PASSED, FAILED, CONDITIONAL]
        grade:
          type: string
        inspectionDetails:
          type: object
          additionalProperties: true

    Inspection:
      type: object
      properties:
        id:
          type: string
          format: uuid
        productId:
          type: string
          format: uuid
        result:
          type: string
        grade:
          type: [string, 'null']

    NotificationListResponse:
      type: object
      properties:
        data:
          type: array
          items:
            type: object
            properties:
              id:
                type: string
                format: uuid
              title:
                type: string
              body:
                type: string
              status:
                type: string
                enum: [PENDING, SENT, FAILED, READ]

    CreateDisputeRequest:
      type: object
      required: [orderId, category, description]
      properties:
        orderId:
          type: string
          format: uuid
        category:
          type: string
        description:
          type: string
          maxLength: 5000

    Dispute:
      type: object
      properties:
        id:
          type: string
          format: uuid
        orderId:
          type: string
          format: uuid
        category:
          type: string
        description:
          type: string
        status:
          type: string
          enum:
            - OPEN
            - UNDER_REVIEW
            - WAITING_FOR_EVIDENCE
            - RESOLVED
            - REJECTED
            - CLOSED

    PriceForecastRequest:
      type: object
      required: [productId, locationId, forecastDays]
      properties:
        productId:
          type: string
          format: uuid
        locationId:
          type: string
          format: uuid
        quantityKg:
          type: number
          exclusiveMinimum: 0
        forecastDays:
          type: integer
          minimum: 1
          maximum: 30

    PriceForecastResponse:
      type: object
      properties:
        productId:
          type: string
          format: uuid
        currency:
          type: string
          enum: [BDT]
        unit:
          type: string
        lowerEstimate:
          type: [number, 'null']
        upperEstimate:
          type: [number, 'null']
        trend:
          type: string
          enum:
            - INCREASING
            - DECREASING
            - STABLE
            - INSUFFICIENT_DATA
        uncertainty:
          type: [number, 'null']
        modelVersion:
          type: [string, 'null']
        dataUpdatedAt:
          type: [string, 'null']
          format: date-time
        limitations:
          type: array
          items:
            type: string

    MatchingRequest:
      type: object
      required: [listingId]
      properties:
        listingId:
          type: string
          format: uuid
        limit:
          type: integer
          minimum: 1
          maximum: 50
          default: 10

    MatchingResponse:
      type: object
      properties:
        recommendations:
          type: array
          items:
            type: object
            properties:
              buyerId:
                type: string
                format: uuid
              compatibilityScore:
                type: number
              reasons:
                type: array
                items:
                  type: string
              limitations:
                type: array
                items:
                  type: string

    ImageAnalysisRequest:
      type: object
      required: [objectKey, productId]
      properties:
        objectKey:
          type: string
        productId:
          type: string
          format: uuid

    ImageAnalysisResponse:
      type: object
      properties:
        analysisId:
          type: string
          format: uuid
        result:
          type: object
          additionalProperties: true
        limitations:
          type: array
          items:
            type: string
        modelVersion:
          type: [string, 'null']

    Pagination:
      type: object
      properties:
        page:
          type: integer
        limit:
          type: integer
        total:
          type: integer
        totalPages:
          type: integer

    ErrorResponse:
      type: object
      required: [success, error]
      properties:
        success:
          type: boolean
          const: false
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: array
              items:
                type: object
                properties:
                  field:
                    type: string
                  message:
                    type: string
        meta:
          type: object
          properties:
            requestId:
              type: string
```

## **D3. API contract rules**

### **Rule 1 — Do not trust client-side financial calculations**

The backend must calculate:

* Subtotal  
* Platform commission  
* Delivery fee  
* Applicable taxes, if any  
* Total amount  
* Refund amount

### **Rule 2 — Do not expose internal database models directly**

Use response DTOs.

Example:

```
export function toListingResponse(listing) {
  return {
    id: listing.id,
    title: listing.title,
    productId: listing.productId,
    quantity: Number(listing.quantity),
    availableQuantity: Number(listing.availableQuantity),
    askingPrice: Number(listing.askingPrice),
    currency: listing.currency,
    status: listing.status
  };
}
```

For money, consider returning decimal values as strings to preserve exact precision across JSON consumers. The final contract should standardize this consistently.

### **Rule 3 — Standardize error codes**

```
AUTH_INVALID_CREDENTIALS
AUTH_SESSION_EXPIRED
AUTH_ACCOUNT_SUSPENDED

USER_NOT_FOUND
PERMISSION_DENIED
RESOURCE_NOT_FOUND

LISTING_NOT_AVAILABLE
LISTING_INSUFFICIENT_QUANTITY

AUCTION_NOT_ACTIVE
AUCTION_BID_TOO_LOW
AUCTION_ALREADY_CLOSED

ORDER_INVALID_TRANSITION
ORDER_INSUFFICIENT_INVENTORY

PAYMENT_VERIFICATION_FAILED
PAYMENT_ALREADY_PROCESSED
PAYMENT_AMOUNT_MISMATCH

SHIPMENT_INVALID_TRANSITION

AI_INSUFFICIENT_DATA
AI_SERVICE_UNAVAILABLE
```

### **Rule 4 — Add API versioning**

Use:

```
/api/v1
/api/v2
```

Do not break existing mobile application clients when introducing incompatible changes.

### **Rule 5 — Validate OpenAPI in CI**

Use an OpenAPI validator and fail the build when the contract is invalid.

Recommended tools:

* Redocly CLI  
* Swagger Editor  
* OpenAPI Generator for client generation, if desired

Example:

```
npx @redocly/cli lint apps/api/openapi.yaml
```

---

# **PART E — MODULE-BY-MODULE DEVELOPMENT BACKLOG**

## **E1. Ticket conventions**

Ticket ID:

```
CROPSY-[MODULE]-[NUMBER]
```

Priority:

* P0: Critical for MVP.  
* P1: Important for MVP or pilot.  
* P2: Post-MVP.  
* P3: Future enhancement.

Story points:

* 1: Very small  
* 2: Small  
* 3: Moderate  
* 5: Large  
* 8: Very large

Dependencies refer to other tickets that must be completed first.

---

## **E2. EPIC 01 — Project Foundation**

**Epic ID:** CROPSY-FOUNDATION

**Goal:** Establish a maintainable development environment and backend foundation.

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| FOUNDATION-001 | Initialize monorepo | P0 | 3 | None |
| FOUNDATION-002 | Configure Fastify application | P0 | 3 | 001 |
| FOUNDATION-003 | Configure Prisma and PostgreSQL | P0 | 3 | 001 |
| FOUNDATION-004 | Configure Redis | P0 | 2 | 001 |
| FOUNDATION-005 | Configure environment validation | P0 | 2 | 002 |
| FOUNDATION-006 | Add structured logging | P0 | 2 | 002 |
| FOUNDATION-007 | Add global error handler | P0 | 2 | 002 |
| FOUNDATION-008 | Configure OpenAPI documentation | P0 | 3 | 002 |
| FOUNDATION-009 | Configure automated tests | P0 | 3 | 002 |
| FOUNDATION-010 | Configure CI pipeline | P0 | 3 | 009 |

### **Acceptance tests**

* API starts in development.  
* Missing required environment variables prevent unsafe startup.  
* Database connection is verified.  
* Redis connection is verified.  
* Errors use the standard response format.  
* API documentation is accessible.  
* Unit and integration tests execute in CI.  
* Secrets are excluded from Git.

---

## **E3. EPIC 02 — Identity and Access Control**

**Epic ID:** CROPSY-IDENTITY

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| IDENTITY-001 | Create user model and migrations | P0 | 3 | FOUNDATION-003 |
| IDENTITY-002 | Implement registration | P0 | 5 | 001 |
| IDENTITY-003 | Implement password hashing | P0 | 2 | 001 |
| IDENTITY-004 | Implement login | P0 | 5 | 002, 003 |
| IDENTITY-005 | Implement session management | P0 | 5 | 004 |
| IDENTITY-006 | Implement refresh-token rotation | P0 | 5 | 005 |
| IDENTITY-007 | Implement logout and revocation | P0 | 2 | 005 |
| IDENTITY-008 | Implement password recovery | P1 | 5 | 004 |
| IDENTITY-009 | Implement email verification | P1 | 3 | 002 |
| IDENTITY-010 | Implement phone verification | P1 | 5 | 002 |
| IDENTITY-011 | Implement RBAC | P0 | 5 | 001 |
| IDENTITY-012 | Implement ownership authorization | P0 | 5 | 011 |
| IDENTITY-013 | Add privileged-account MFA | P1 | 5 | 005 |

### **Acceptance tests**

* Duplicate email registration is rejected.  
* Duplicate phone registration is rejected.  
* Password is never stored as plaintext.  
* Invalid credentials do not create a session.  
* Expired refresh credentials are rejected.  
* Refresh-token reuse is detected according to the rotation policy.  
* Revoked sessions cannot be refreshed.  
* A user cannot access another user's private data.  
* Role permissions are checked server-side.  
* Suspended accounts cannot perform restricted operations.

---

## **E4. EPIC 03 — User Profiles and Verification**

**Epic ID:** CROPSY-PROFILES

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| PROFILE-001 | Create farmer profile | P0 | 3 | IDENTITY-001 |
| PROFILE-002 | Create buyer profile | P0 | 3 | IDENTITY-001 |
| PROFILE-003 | Implement profile editing | P0 | 3 | 001, 002 |
| PROFILE-004 | Implement geographic addresses | P0 | 5 | FOUNDATION-003 |
| PROFILE-005 | Implement private document upload | P0 | 5 | FOUNDATION-001 |
| PROFILE-006 | Submit verification | P1 | 3 | 001, 005 |
| PROFILE-007 | Admin verification review | P1 | 5 | 006, IDENTITY-011 |
| PROFILE-008 | Verification audit history | P1 | 3 | 007 |

### **Acceptance tests**

* A farmer can create only their own profile.  
* A buyer can create only their own profile.  
* Unauthorized roles cannot edit other profiles.  
* Verification documents are private.  
* A rejected verification includes a review reason.  
* Only authorized reviewers can approve verification.  
* All verification decisions are auditable.

---

## **E5. EPIC 04 — Product Catalog**

**Epic ID:** CROPSY-CATALOG

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| CATALOG-001 | Create category schema | P0 | 2 | FOUNDATION-003 |
| CATALOG-002 | Seed initial categories | P0 | 2 | 001 |
| CATALOG-003 | Create product schema | P0 | 3 | 001 |
| CATALOG-004 | Product CRUD APIs | P0 | 5 | 003 |
| CATALOG-005 | Add Bangla product names | P1 | 3 | 004 |
| CATALOG-006 | Product search and filtering | P0 | 5 | 004 |

### **Acceptance tests**

* Products belong to valid categories.  
* Inactive products cannot be listed.  
* Product search supports pagination.  
* Category hierarchy cannot contain invalid parent references.  
* Product names support Bangla and English.  
* Only authorized roles can create or modify catalog entries.

---

## **E6. EPIC 05 — Marketplace**

**Epic ID:** CROPSY-MARKETPLACE

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| MARKET-001 | Create listing schema | P0 | 3 | CATALOG-003, PROFILE-001 |
| MARKET-002 | Create listing API | P0 | 5 | MARKET-001 |
| MARKET-003 | Listing validation rules | P0 | 3 | MARKET-002 |
| MARKET-004 | Listing image upload | P0 | 5 | FOUNDATION-001 |
| MARKET-005 | Listing publish workflow | P0 | 5 | MARKET-003 |
| MARKET-006 | Listing update and pause | P0 | 3 | MARKET-005 |
| MARKET-007 | Public listing search | P0 | 5 | MARKET-005 |
| MARKET-008 | Location-based filtering | P1 | 5 | PROFILE-004, MARKET-007 |
| MARKET-009 | Listing expiry worker | P1 | 5 | FOUNDATION-004 |
| MARKET-010 | Listing status history | P1 | 3 | MARKET-005 |

### **Acceptance tests**

* Only eligible farmers can create listings.  
* Listing quantity must be positive.  
* Asking price cannot be negative.  
* Available quantity cannot exceed total quantity.  
* Unauthorized users cannot edit a listing.  
* Inactive listings are excluded from normal search.  
* Listing expiry is enforced by the backend.  
* Image uploads reject unsupported or oversized files.  
* Search results are paginated.

---

## **E7. EPIC 06 — Farmer Groups**

**Epic ID:** CROPSY-GROUPS

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| GROUP-001 | Create farmer group | P1 | 3 | PROFILE-001 |
| GROUP-002 | Group membership workflow | P1 | 5 | 001 |
| GROUP-003 | Group leader permissions | P1 | 3 | IDENTITY-011 |
| GROUP-004 | Create collection target | P1 | 5 | 001, CATALOG-003 |
| GROUP-005 | Record farmer contributions | P1 | 5 | 004 |
| GROUP-006 | Calculate verified collection total | P1 | 3 | 005 |

### **Acceptance tests**

* A group has one designated leader under the initial model.  
* Duplicate memberships are rejected.  
* Only authorized members can contribute.  
* Contribution quantities are positive.  
* Collection totals reflect verified contributions.  
* Group members cannot edit another member's contribution.

---

## **E8. EPIC 07 — Offers and Negotiation**

**Epic ID:** CROPSY-TRADING

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| TRADING-001 | Create offer model | P0 | 3 | MARKET-001 |
| TRADING-002 | Submit buyer offer | P0 | 5 | 001 |
| TRADING-003 | Counteroffer workflow | P1 | 5 | 002 |
| TRADING-004 | Accept or reject offer | P0 | 5 | 002 |
| TRADING-005 | Offer expiry worker | P1 | 3 | FOUNDATION-004 |
| TRADING-006 | Offer notifications | P1 | 3 | 002 |

### **Acceptance tests**

* Buyers cannot offer on unavailable listings.  
* Buyers cannot make offers on their own listings.  
* Offer quantity cannot exceed eligible available quantity.  
* Only authorized participants can respond to an offer.  
* Expired offers cannot be accepted.  
* Duplicate requests do not create duplicate offers.  
* Accepted offers follow the configured order-creation workflow.

---

## **E9. EPIC 08 — Auctions**

**Epic ID:** CROPSY-AUCTIONS

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| AUCTION-001 | Create auction schema | P0 | 3 | MARKET-001 |
| AUCTION-002 | Auction creation API | P0 | 5 | 001 |
| AUCTION-003 | Auction scheduling worker | P0 | 5 | FOUNDATION-004 |
| AUCTION-004 | Place bid transaction | P0 | 8 | 001, IDENTITY-011 |
| AUCTION-005 | Concurrent bid testing | P0 | 5 | 004 |
| AUCTION-006 | Auction close worker | P0 | 5 | 003 |
| AUCTION-007 | Winning bidder selection | P0 | 5 | 006 |
| AUCTION-008 | Real-time bid broadcasting | P1 | 5 | 004 |
| AUCTION-009 | Auction history | P1 | 3 | 004 |

### **Acceptance tests**

* Only authorized sellers can create auctions for eligible listings.  
* Auction start time must precede end time.  
* A buyer cannot bid on their own listing.  
* Bid must meet the minimum increment.  
* Expired auctions reject bids.  
* Simultaneous bids preserve correct bid ordering.  
* Duplicate idempotency keys do not create duplicate bids.  
* Auction closure uses server time.  
* Winner selection is deterministic and auditable.  
* No winner is declared when reserve rules are not satisfied.

---

## **E10. EPIC 09 — Orders and Inventory**

**Epic ID:** CROPSY-ORDERS

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| ORDER-001 | Create order schema | P0 | 3 | MARKET-001 |
| ORDER-002 | Order calculation service | P0 | 5 | 001 |
| ORDER-003 | Inventory reservation service | P0 | 8 | 001 |
| ORDER-004 | Create order API | P0 | 8 | 002, 003 |
| ORDER-005 | Order state machine | P0 | 5 | 001 |
| ORDER-006 | Order status history | P0 | 3 | 005 |
| ORDER-007 | Order cancellation | P1 | 5 | 005 |
| ORDER-008 | Order completion | P1 | 3 | 005 |
| ORDER-009 | Multi-farmer checkout design | P2 | 8 | 004 |

### **Acceptance tests**

* Server calculates the order total.  
* Client-supplied total is ignored.  
* Quantity cannot exceed available inventory.  
* Concurrent purchases cannot oversell inventory.  
* Duplicate checkout requests are idempotent.  
* An order cannot skip mandatory states.  
* Unauthorized users cannot access private order details.  
* Cancellation follows approved business rules.  
* Inventory is restored only when a valid cancellation or reservation release occurs.

---

## **E11. EPIC 10 — Payments and Ledger**

**Epic ID:** CROPSY-FINANCE

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| FINANCE-001 | Payment model | P0 | 3 | ORDER-001 |
| FINANCE-002 | Payment provider adapter interface | P0 | 5 | 001 |
| FINANCE-003 | Payment initiation | P0 | 5 | 002 |
| FINANCE-004 | Provider verification | P0 | 8 | 003 |
| FINANCE-005 | Webhook signature validation | P0 | 5 | 002 |
| FINANCE-006 | Webhook idempotency | P0 | 5 | 005 |
| FINANCE-007 | Ledger account setup | P0 | 3 | FOUNDATION-003 |
| FINANCE-008 | Journal posting service | P0 | 8 | 007 |
| FINANCE-009 | Reconciliation workflow | P1 | 8 | 004, 008 |
| FINANCE-010 | Refund workflow | P1 | 8 | 008 |
| FINANCE-011 | Financial audit reports | P1 | 5 | 008 |

### **Acceptance tests**

* A payment cannot be successful without provider verification.  
* A webhook with an invalid signature is rejected.  
* A duplicate webhook does not create duplicate journal entries.  
* Payment amount must match the verified order amount.  
* Ledger debit equals ledger credit.  
* Posted entries cannot be edited.  
* Refunds create traceable financial records.  
* Provider failures do not falsely mark an order as paid.  
* Payment reconciliation identifies unmatched transactions.

---

## **E12. EPIC 11 — Logistics**

**Epic ID:** CROPSY-LOGISTICS

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| LOGISTICS-001 | Transporter profile | P1 | 3 | PROFILE-001 |
| LOGISTICS-002 | Vehicle registration | P1 | 3 | 001 |
| LOGISTICS-003 | Shipment creation | P1 | 5 | ORDER-001 |
| LOGISTICS-004 | Transporter assignment | P1 | 5 | 003 |
| LOGISTICS-005 | Pickup confirmation | P1 | 3 | 004 |
| LOGISTICS-006 | Delivery tracking events | P1 | 5 | 003 |
| LOGISTICS-007 | Delivery confirmation | P1 | 5 | 006 |
| LOGISTICS-008 | Shipment notifications | P1 | 3 | 006 |

### **Acceptance tests**

* Unverified transporters cannot receive restricted assignments.  
* Vehicle capacity is respected.  
* A transporter can update only assigned shipments.  
* Invalid shipment transitions are rejected.  
* Pickup and delivery timestamps are recorded.  
* Delivery evidence is stored when required.  
* Shipment history is auditable.

---

## **E13. EPIC 12 — Quality and Warehouse**

**Epic ID:** CROPSY-QUALITY

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| QUALITY-001 | Inspection schema | P1 | 3 | CATALOG-003 |
| QUALITY-002 | Inspection submission | P1 | 5 | 001 |
| QUALITY-003 | Inspector authorization | P1 | 3 | IDENTITY-011 |
| QUALITY-004 | Warehouse management | P2 | 5 | FOUNDATION-003 |
| QUALITY-005 | Inventory batch management | P2 | 5 | 004 |
| QUALITY-006 | QR traceability | P2 | 5 | 001 |

### **Acceptance tests**

* Only authorized inspectors can submit official inspections.  
* Inspection records cannot be silently overwritten.  
* Inventory quantities cannot become negative.  
* Batch identifiers are unique.  
* Traceability events preserve history.  
* AI-generated image analysis is not represented as official inspection approval.

---

## **E14. EPIC 13 — Communication and Notifications**

**Epic ID:** CROPSY-COMMUNICATION

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| COMM-001 | Conversation model | P1 | 3 | IDENTITY-001 |
| COMM-002 | Message APIs | P1 | 5 | 001 |
| COMM-003 | Participant authorization | P1 | 5 | 002 |
| COMM-004 | Socket.IO integration | P1 | 5 | 002 |
| COMM-005 | Notification model | P1 | 3 | IDENTITY-001 |
| COMM-006 | Notification worker | P1 | 5 | FOUNDATION-004 |
| COMM-007 | Email/SMS adapters | P2 | 5 | 006 |
| COMM-008 | Notification preferences | P2 | 3 | 005 |

### **Acceptance tests**

* Only conversation participants can read private messages.  
* A user cannot impersonate another sender.  
* Message ordering is stable.  
* Failed notification delivery can be retried.  
* Duplicate notification jobs do not create duplicate critical messages.  
* Users can control supported notification preferences.

---

## **E15. EPIC 14 — Dispute Management**

**Epic ID:** CROPSY-DISPUTES

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| DISPUTE-001 | Dispute schema | P1 | 3 | ORDER-001 |
| DISPUTE-002 | Open dispute API | P1 | 5 | 001 |
| DISPUTE-003 | Evidence upload | P1 | 5 | FOUNDATION-001 |
| DISPUTE-004 | Officer assignment | P1 | 3 | IDENTITY-011 |
| DISPUTE-005 | Resolution workflow | P1 | 5 | 004 |
| DISPUTE-006 | Dispute audit history | P1 | 3 | 005 |

### **Acceptance tests**

* Only eligible parties can open an order dispute.  
* Evidence is private and access-controlled.  
* Only authorized officers can resolve disputes.  
* Resolution reasons are recorded.  
* Dispute status transitions are validated.  
* Financial adjustments follow the approved refund and ledger workflow.

---

## **E16. EPIC 15 — AI Intelligence**

**Epic ID:** CROPSY-AI

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| AI-001 | Python FastAPI service foundation | P1 | 5 | FOUNDATION-001 |
| AI-002 | Secure Node-to-AI communication | P1 | 3 | AI-001 |
| AI-003 | Market data collection pipeline | P1 | 8 | MARKET-001 |
| AI-004 | Price comparison engine | P1 | 5 | AI-003 |
| AI-005 | Rule-based matching | P1 | 5 | MARKET-007 |
| AI-006 | Forecasting evaluation pipeline | P2 | 8 | AI-003 |
| AI-007 | Forecast model prototype | P2 | 8 | AI-006 |
| AI-008 | Anomaly detection prototype | P2 | 8 | TRADING-004 |
| AI-009 | Computer vision prototype | P3 | 8 | QUALITY-001 |
| AI-010 | Bangla assistant with retrieval | P3 | 8 | IDENTITY-001 |
| AI-011 | AI feedback collection | P2 | 5 | AI-004 |
| AI-012 | Model version tracking | P2 | 5 | AI-001 |

### **Acceptance tests**

* AI service cannot access unauthorized private records.  
* Node.js validates all AI inputs and outputs.  
* Insufficient data returns an explicit insufficient-data response.  
* Every prediction records model version and timestamp.  
* AI failures do not corrupt marketplace transactions.  
* Anomaly alerts require human review.  
* Price forecasts are evaluated against documented baselines.  
* The assistant cannot complete a consequential transaction without explicit confirmation.

---

## **E17. EPIC 16 — Administration and Analytics**

**Epic ID:** CROPSY-ADMIN

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| ADMIN-001 | Admin dashboard foundation | P0 | 5 | IDENTITY-011 |
| ADMIN-002 | User moderation | P0 | 5 | 001 |
| ADMIN-003 | Farmer verification queue | P1 | 5 | PROFILE-007 |
| ADMIN-004 | Listing moderation | P1 | 5 | MARKET-005 |
| ADMIN-005 | Audit log viewer | P1 | 5 | FOUNDATION-002 |
| ADMIN-006 | Transaction reporting | P1 | 8 | ORDER-001 |
| ADMIN-007 | Market analytics dashboard | P2 | 8 | AI-003 |
| ADMIN-008 | Suspicious activity review queue | P2 | 8 | AI-008 |

### **Acceptance tests**

* Admin pages enforce role permissions.  
* Privileged actions are audited.  
* Moderation actions require a reason where appropriate.  
* Sensitive financial data is restricted to authorized roles.  
* Market reports disclose date range and data source.  
* AI anomaly alerts are labeled as unverified signals.

---

## **E18. EPIC 17 — Web and Mobile Applications**

**Epic ID:** CROPSY-CLIENTS

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| CLIENT-001 | Web application foundation | P0 | 5 | FOUNDATION-001 |
| CLIENT-002 | Mobile application foundation | P0 | 5 | FOUNDATION-001 |
| CLIENT-003 | Shared API client | P0 | 5 | FOUNDATION-008 |
| CLIENT-004 | Authentication screens | P0 | 5 | IDENTITY-004 |
| CLIENT-005 | Farmer dashboard | P0 | 8 | PROFILE-001 |
| CLIENT-006 | Buyer dashboard | P0 | 8 | PROFILE-002 |
| CLIENT-007 | Marketplace UI | P0 | 8 | MARKET-007 |
| CLIENT-008 | Listing creation UI | P0 | 5 | MARKET-002 |
| CLIENT-009 | Offer and auction UI | P1 | 8 | TRADING-002, AUCTION-004 |
| CLIENT-010 | Order management UI | P0 | 8 | ORDER-004 |
| CLIENT-011 | Payment UI | P0 | 5 | FINANCE-003 |
| CLIENT-012 | Shipment tracking UI | P1 | 5 | LOGISTICS-006 |
| CLIENT-013 | Bangla/English localization | P0 | 5 | CLIENT-001 |
| CLIENT-014 | Offline drafts | P2 | 5 | CLIENT-008 |
| CLIENT-015 | Accessibility improvements | P1 | 5 | CLIENT-001 |

### **Acceptance tests**

* Web and mobile use the same API contracts.  
* Authentication works across supported platforms.  
* UI handles expired sessions safely.  
* Loading, empty, success, and error states exist.  
* Bangla and English text display correctly.  
* Offline drafts never imply that a transaction has been committed.  
* Payment status is refreshed from the server.  
* Critical actions require confirmation.

---

## **E19. EPIC 18 — Quality Assurance and Production**

**Epic ID:** CROPSY-RELEASE

| Ticket | Task | Priority | Points | Dependencies |
| ----- | ----- | ----- | ----- | ----- |
| RELEASE-001 | Unit test coverage baseline | P0 | 5 | Foundation |
| RELEASE-002 | API integration tests | P0 | 8 | Core modules |
| RELEASE-003 | Marketplace E2E tests | P0 | 5 | MARKET |
| RELEASE-004 | Auction concurrency tests | P0 | 8 | AUCTIONS |
| RELEASE-005 | Inventory concurrency tests | P0 | 8 | ORDERS |
| RELEASE-006 | Payment webhook tests | P0 | 8 | FINANCE |
| RELEASE-007 | Security testing | P0 | 8 | Core modules |
| RELEASE-008 | Load testing | P1 | 5 | API |
| RELEASE-009 | Backup and recovery tests | P0 | 5 | Database |
| RELEASE-010 | Monitoring and alerting | P0 | 5 | Infrastructure |
| RELEASE-011 | Production deployment | P0 | 5 | Release approval |
| RELEASE-012 | Mobile store release preparation | P1 | 5 | CLIENTS |

### **Acceptance tests**

* Critical business workflows pass automated tests.  
* No known critical or high-severity security issue remains unresolved without formal risk acceptance.  
* Auction and inventory concurrency tests pass.  
* Payment provider integration passes sandbox testing.  
* Backup restoration is demonstrated.  
* Monitoring detects service failures.  
* Production secrets are securely configured.  
* Rollback and incident response procedures are documented.

---

# **PART F — DEPENDENCY GRAPH**

## **F1. High-level implementation dependencies**

```
flowchart TD
    A["Foundation"]
    B["Identity & RBAC"]
    C["Profiles & Verification"]
    D["Product Catalog"]
    E["Marketplace"]
    F["Trading & Auctions"]
    G["Orders & Inventory"]
    H["Payments & Ledger"]
    I["Logistics"]
    J["Quality & Warehouse"]
    K["Communication"]
    L["Disputes"]
    M["AI Intelligence"]
    N["Administration"]
    O["Web & Mobile"]
    P["Testing & Release"]

    A --> B
    A --> D
    A --> O

    B --> C
    B --> K
    B --> N

    C --> E
    D --> E

    E --> F
    E --> G

    F --> G
    G --> H
    G --> I
    G --> L

    I --> J
    E --> M
    F --> M
    I --> M

    H --> N
    M --> N

    B --> O
    E --> O
    F --> O
    G --> O
    H --> O
    I --> O

    O --> P
    N --> P
    M --> P
```

## **F2. Recommended implementation order**

```
1. Foundation
2. Identity and RBAC
3. Profiles and Verification
4. Product Catalog
5. Marketplace
6. Basic Administration
7. Offers and Auctions
8. Orders and Inventory
9. Payments and Ledger
10. Communication and Notifications
11. Logistics
12. Quality and Warehouse
13. Disputes
14. AI Data Foundation
15. AI Features
16. Web and Mobile Refinement
17. Security and Load Testing
18. Production Deployment
```

Web and mobile development should begin early with mock API contracts, then integrate with the actual backend as each module becomes available.

---

# **PART G — ACCEPTANCE TEST DESIGN**

## **G1. Critical end-to-end scenarios**

### **Scenario 1: Farmer sells agricultural products**

```
Given:
    Farmer has an active account.
    Farmer has an approved profile.

When:
    Farmer creates a listing.
    Farmer publishes the listing.

Then:
    Listing becomes ACTIVE.
    Listing appears in eligible marketplace searches.
    Listing owner can manage the listing.
    Other users cannot modify it.
```

### **Scenario 2: Buyer purchases products**

```
Given:
    Buyer has an eligible account.
    Listing has sufficient available quantity.

When:
    Buyer submits checkout.
    Server validates quantity and price.
    Server reserves inventory.
    Server creates an order.

Then:
    Order is persisted.
    Inventory is reserved exactly once.
    Buyer receives an order reference.
    Farmer receives an order notification.
```

### **Scenario 3: Concurrent inventory purchase**

```
Given:
    Listing has 100 KG available.

When:
    Buyer A requests 70 KG.
    Buyer B requests 70 KG at nearly the same time.

Then:
    At most one request can reserve the full 70 KG.
    The other request must fail or receive only an explicitly supported partial quantity.
    Available quantity must never become negative.
```

### **Scenario 4: Auction bidding**

```
Given:
    Auction is ACTIVE.
    Current bid is BDT 1,000.
    Minimum increment is BDT 50.

When:
    Buyer submits BDT 1,050.

Then:
    Server validates the bid.
    Bid is recorded.
    Current bid becomes BDT 1,050.
    Eligible participants receive an update.
```

### **Scenario 5: Duplicate payment webhook**

```
Given:
    Payment provider sends a valid successful webhook.

When:
    The same webhook is received twice.

Then:
    Payment is processed once.
    Ledger posting occurs once.
    Duplicate event is acknowledged safely.
    No duplicate financial credit is created.
```

### **Scenario 6: AI insufficient data**

```
Given:
    A product has insufficient verified historical price data.

When:
    Farmer requests a price forecast.

Then:
    AI returns INSUFFICIENT_DATA.
    No fabricated price estimate is displayed.
    The UI explains that more data is required.
```

## **G2. Test coverage policy**

Suggested minimum coverage targets:

| Component | Initial target |
| ----- | ----- |
| Critical domain logic | 90% |
| Payment and ledger services | 95% |
| Auction and inventory services | 95% |
| General backend services | 80% |
| API integration tests | All critical endpoints |
| Critical user journeys | All MVP journeys |

Coverage percentage alone does not establish correctness. Concurrency, authorization, and state-transition tests are mandatory.

---

# **PART H — DEVELOPMENT GOVERNANCE**

## **H1. Git branching**

Recommended:

```
main
develop
feature/identity-registration
feature/marketplace-listings
feature/auction-bidding
feature/order-management
bugfix/payment-webhook
hotfix/security-issue
```

## **H2. Pull request requirements**

Every pull request should include:

* Ticket ID  
* Description  
* Scope  
* Screenshots where relevant  
* Database migration information  
* API contract changes  
* Tests  
* Security implications  
* Reviewer approval

## **H3. Definition of Done**

A ticket is complete only when:

* Implementation is finished.  
* Business rules are enforced server-side.  
* Input validation exists.  
* Authorization is tested.  
* Unit tests pass.  
* Integration tests pass where applicable.  
* API documentation is updated.  
* Database migration is reviewed.  
* Error handling is consistent.  
* No secrets are committed.  
* Code review is approved.

## **H4. Release gates**

**Gate 1 — Foundation**

* Database works.  
* Authentication works.  
* CI works.  
* Logging and error handling work.

**Gate 2 — Marketplace**

* Farmer can publish a listing.  
* Buyer can search and view listings.  
* Listing ownership is enforced.

**Gate 3 — Trading**

* Offers work.  
* Auction bidding is concurrency-safe.  
* Auction closure is server-authoritative.

**Gate 4 — Transactions**

* Orders are reliable.  
* Inventory cannot be oversold.  
* Payment provider verification works.  
* Ledger entries balance.

**Gate 5 — Pilot readiness**

* Core workflows are tested.  
* Security review is complete.  
* Backup restoration is tested.  
* Monitoring is operational.  
* Support and dispute workflows are available.

**Gate 6 — Production readiness**

* Operational procedures are documented.  
* Privacy and retention policies are approved.  
* Payment and legal arrangements are reviewed.  
* Production deployment and rollback are tested.

---

# **PART I — FINAL IMPLEMENTATION CHECKLIST**

## **Database**

* Prisma schema validated  
* All model relationships reviewed  
* Migrations generated  
* PostgreSQL constraints added  
* PostGIS enabled  
* Indexes reviewed  
* Seed data implemented  
* Backup and restore tested

## **API**

* OpenAPI file validated  
* Authentication implemented  
* RBAC implemented  
* Ownership authorization implemented  
* Request validation implemented  
* Error format standardized  
* Pagination implemented  
* Idempotency implemented  
* Rate limiting implemented  
* API tests implemented

## **Marketplace**

* Product catalog  
* Farmer profiles  
* Buyer profiles  
* Listing creation  
* Listing search  
* Listing moderation  
* Offers  
* Auctions  
* Inventory reservation

## **Financial system**

* Payment adapter  
* Payment initiation  
* Webhook verification  
* Idempotent payment processing  
* Ledger posting  
* Refund workflow  
* Reconciliation

## **Mobile and web**

* Shared API client  
* Authentication  
* Farmer dashboard  
* Buyer dashboard  
* Marketplace  
* Orders  
* Notifications  
* Bangla localization  
* Accessibility

## **Production**

* CI/CD  
* Monitoring  
* Security testing  
* Load testing  
* Backup restoration  
* Incident response  
* Deployment rollback  
* Production approval

---

# **FINAL ENGINEERING DECISION**

CROPSY should be implemented in incremental, testable modules.

The first engineering milestone is not to build every feature simultaneously. It is to establish a reliable foundation and complete the first end-to-end marketplace transaction.

**Recommended first milestone:**

```
User Registration
       |
       v
Farmer Verification
       |
       v
Product Listing
       |
       v
Buyer Search
       |
       v
Offer / Purchase
       |
       v
Order Creation
       |
       v
Payment Verification
       |
       v
Farmer Settlement Workflow
```

Once this workflow is reliable, extend the system with auctions, logistics, quality assurance, collective selling, traceability, and AI intelligence.

**CROPSY engineering principle: Build reliable transactions first, collect trustworthy data continuously, and introduce advanced intelligence only when the data and validation justify it.**

---

**End of Implementation-Ready Technical Blueprint — Version 1.0**

**Important status note:** This is a detailed implementation baseline, not a claim that the Prisma schema has been executed against a database or that the OpenAPI document has passed a validator. Before production use, run Prisma validation, resolve any schema-review findings, lint the OpenAPI file, and test the contracts against the implemented Fastify routes.

