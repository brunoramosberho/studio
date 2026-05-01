-- CreateEnum
CREATE TYPE "BookingProductOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'READY', 'PICKED_UP', 'CANCELLED');

-- AlterTable
ALTER TABLE "Studio" ADD COLUMN "productsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "availableForPreOrder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductStudioAvailability" (
    "productId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ProductStudioAvailability_pkey" PRIMARY KEY ("productId","studioId")
);

-- CreateTable
CREATE TABLE "BookingProductOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "status" "BookingProductOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pickupAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingProductOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingProductOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BookingProductOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductStudioAvailability_studioId_idx" ON "ProductStudioAvailability"("studioId");

-- CreateIndex
CREATE INDEX "ProductStudioAvailability_tenantId_idx" ON "ProductStudioAvailability"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingProductOrder_bookingId_key" ON "BookingProductOrder"("bookingId");

-- CreateIndex
CREATE INDEX "BookingProductOrder_tenantId_status_idx" ON "BookingProductOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BookingProductOrder_studioId_pickupAt_idx" ON "BookingProductOrder"("studioId", "pickupAt");

-- CreateIndex
CREATE INDEX "BookingProductOrder_userId_idx" ON "BookingProductOrder"("userId");

-- CreateIndex
CREATE INDEX "BookingProductOrderItem_orderId_idx" ON "BookingProductOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "BookingProductOrderItem_productId_idx" ON "BookingProductOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "ProductStudioAvailability" ADD CONSTRAINT "ProductStudioAvailability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStudioAvailability" ADD CONSTRAINT "ProductStudioAvailability_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStudioAvailability" ADD CONSTRAINT "ProductStudioAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrder" ADD CONSTRAINT "BookingProductOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrder" ADD CONSTRAINT "BookingProductOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrder" ADD CONSTRAINT "BookingProductOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrder" ADD CONSTRAINT "BookingProductOrder_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrder" ADD CONSTRAINT "BookingProductOrder_stripePaymentId_fkey" FOREIGN KEY ("stripePaymentId") REFERENCES "StripePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrderItem" ADD CONSTRAINT "BookingProductOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BookingProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProductOrderItem" ADD CONSTRAINT "BookingProductOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
